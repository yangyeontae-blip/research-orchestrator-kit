import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from './schemas.mjs';
import { inside, isoNow, readJson, sha256File, slash } from './utils.mjs';

const REQUIRED_HUMAN_CHECKS = Object.freeze({
  plan: ['evidence_source_checked', 'method_alignment_reviewed'],
  docx: ['opened_in_application', 'layout_reviewed', 'content_compared'],
  hwpx: ['opened_in_application', 'layout_reviewed', 'content_compared'],
  video: ['browser_playback', 'seeking', 'audio'],
  readme: ['rendered_page_opened', 'link_clicked']
});

function check(name, result, evidence, source = 'automated') {
  return { name, result, evidence, source };
}

async function boundFile(root, binding) {
  if (!binding?.path || !/^[a-f0-9]{64}$/i.test(binding.sha256 || '')) throw new Error('Artifact path and SHA-256 are required');
  const absolute = path.resolve(root, binding.path);
  if (!inside(root, absolute)) throw new Error('Artifact must remain inside the project root');
  let cursor = path.resolve(root);
  for (const segment of path.relative(cursor, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('Artifact paths may not traverse symbolic links');
  }
  if (!(await fs.stat(absolute)).isFile()) throw new Error('Artifact must be a file');
  return { absolute, path: slash(path.relative(root, absolute)), sha256: await sha256File(absolute) };
}

function manualChecks(kind, specification) {
  const supplied = new Map((specification.human_checks || []).map(item => [item.name, item]));
  const confirmation = specification.human_confirmation;
  const confirmed = confirmation?.confirmed === true
    && typeof confirmation.verified_by === 'string' && confirmation.verified_by.trim()
    && Number.isFinite(Date.parse(confirmation.checked_at || ''));
  return REQUIRED_HUMAN_CHECKS[kind].map(name => {
    const item = supplied.get(name);
    if (!item) return check(name, 'not_run', '실제 사용 확인 기록 없음', 'human');
    const evidence = String(item.evidence || '').trim();
    const method = String(item.method || '').trim();
    const timestampValid = Number.isFinite(Date.parse(item.checked_at || ''));
    if (item.result === 'failed') return check(name, 'failed', evidence || '실제 사용 검사 실패', 'human');
    if (item.result === 'passed' && confirmed && timestampValid && evidence && method) {
      return check(name, 'passed', `${method}: ${evidence}`, 'human');
    }
    return check(name, 'not_run', '확인자·시각·검사 방법·실제 결과가 모두 기록되지 않음', 'human');
  });
}

async function planChecks(root, artifact, specification) {
  const project = specification.project_dir
    ? path.resolve(root, specification.project_dir)
    : path.dirname(artifact.absolute);
  if (!inside(root, project)) throw new Error('Project directory must remain inside the project root');
  const qualityPath = path.join(project, 'quality-report.json');
  let quality;
  try { quality = await readJson(qualityPath); }
  catch { return [check('plan_quality_report', 'not_run', '품질 보고서 없음')]; }
  try { await new SchemaRegistry(root).assert('quality-report', quality); }
  catch (error) { return [check('plan_quality_report', 'failed', `품질 보고서 형식 오류: ${error.message}`)]; }
  const hashMatches = quality.plan?.sha256 === artifact.sha256;
  const hardChecks = quality.automated?.hard_checks_passed === true;
  return [
    check('plan_quality_report', hashMatches ? 'passed' : 'failed', hashMatches ? '현재 계획서 해시와 일치' : '품질 보고서의 계획서 해시 불일치'),
    check('plan_automatic_checks', hardChecks ? 'passed' : 'failed', hardChecks ? '자동 형식·장부 검사 통과' : '자동 형식·장부 검사 미통과')
  ];
}

async function documentChecks(root, artifact, kind, specification) {
  const buffer = await fs.readFile(artifact.absolute);
  const zip = buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
  const marker = kind === 'docx' ? 'word/document.xml' : 'Contents/section';
  const container = zip && buffer.includes(Buffer.from(marker));
  const manifestPath = path.resolve(root, specification.manifest_path || path.join(path.dirname(artifact.path), 'document-manifest.json'));
  if (!inside(root, manifestPath)) throw new Error('Manifest must remain inside the project root');
  let manifest;
  try { manifest = await readJson(manifestPath); }
  catch { manifest = null; }
  if (manifest) {
    try { await new SchemaRegistry(root).assert('document-manifest', manifest); }
    catch (error) { return [check('document_container', container ? 'passed' : 'failed', container ? `${kind.toUpperCase()} ZIP 본문 항목 확인` : '문서 본문 항목을 확인하지 못함'), check('document_manifest', 'failed', `문서 매니페스트 형식 오류: ${error.message}`)]; }
  }
  const bindingMatches = manifest?.[kind]?.path === artifact.path && manifest?.[kind]?.sha256 === artifact.sha256;
  return [
    check('document_container', container ? 'passed' : 'failed', container ? `${kind.toUpperCase()} ZIP 본문 항목 확인` : '문서 본문 항목을 확인하지 못함'),
    check('document_manifest', bindingMatches ? 'passed' : manifest ? 'failed' : 'not_run', bindingMatches ? '매니페스트의 파일·해시 일치' : manifest ? '매니페스트 파일·해시 불일치' : '문서 매니페스트 없음')
  ];
}

async function fetchCheck(url, name, fetchImpl, options = {}) {
  if (!url) return check(name, 'not_run', '배포 URL 없음');
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Deployed URLs must use HTTPS');
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: options.range ? { Range: 'bytes=0-1023' } : {}, signal: AbortSignal.timeout(10000) });
    if (!options.range) {
      await response.body?.cancel?.();
      return check(name, response.ok ? 'passed' : 'failed', `HTTP ${response.status}`);
    }
    const range = response.headers.get('content-range') || '';
    if (response.status !== 206 || !/^bytes 0-\d+\//i.test(range)) {
      await response.body?.cancel?.();
      return check(name, 'failed', `HTTP ${response.status}, Content-Range: ${range || 'missing'}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const mp4 = bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    return check(name, mp4 ? 'passed' : 'failed', `HTTP ${response.status}, Content-Range: ${range}, MP4 header: ${mp4 ? 'present' : 'missing'}`);
  } catch (error) { return check(name, 'failed', `배포 URL 접근 실패: ${error.message}`); }
}

async function videoChecks(root, artifact, specification, fetchImpl) {
  const buffer = await fs.readFile(artifact.absolute);
  const mp4 = buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  const manifestPath = path.resolve(root, specification.manifest_path || path.join(path.dirname(artifact.path), 'video-manifest.json'));
  if (!inside(root, manifestPath)) throw new Error('Manifest must remain inside the project root');
  let manifest;
  try { manifest = await readJson(manifestPath); }
  catch { manifest = null; }
  if (manifest) {
    try { await new SchemaRegistry(root).assert('video-manifest', manifest); }
    catch (error) { return [check('video_container', mp4 ? 'passed' : 'failed', mp4 ? 'MP4 ftyp 확인' : 'MP4 헤더 확인 실패'), check('video_manifest', 'failed', `영상 매니페스트 형식 오류: ${error.message}`)]; }
  }
  const bound = manifest?.video?.path === artifact.path && manifest?.video?.sha256 === artifact.sha256;
  const technical = bound && Object.values(manifest.technical_checks || {}).every(value => value === true)
    && Boolean(manifest.video.audio_codec);
  return [
    check('video_container', mp4 ? 'passed' : 'failed', mp4 ? 'MP4 ftyp 확인' : 'MP4 헤더 확인 실패'),
    check('video_manifest', bound ? 'passed' : manifest ? 'failed' : 'not_run', bound ? '영상 매니페스트 파일·해시 일치' : manifest ? '영상 매니페스트 불일치' : '영상 매니페스트 없음'),
    check('video_technical_checks', technical ? 'passed' : 'not_run', technical ? '디코딩·자막·음성·라이선스 점검 기록 확인' : '음성 포함 기술 점검 기록 미완료'),
    await fetchCheck(specification.deployed_url, 'video_player_url', fetchImpl),
    await fetchCheck(specification.media_url, 'video_media_range', fetchImpl, { range: true })
  ];
}

async function readmeChecks(artifact, specification, fetchImpl) {
  const text = await fs.readFile(artifact.absolute, 'utf8');
  const link = specification.expected_link;
  return [
    check('readme_link_present', link ? (text.includes(link) ? 'passed' : 'failed') : 'not_run', link ? (text.includes(link) ? 'README에 기대 링크 있음' : 'README에 기대 링크 없음') : '기대 링크 미지정'),
    await fetchCheck(specification.deployed_url, 'readme_deployed_page', fetchImpl),
    await fetchCheck(link, 'readme_link_target', fetchImpl)
  ];
}

export async function verifyArtifactUse(root, specification, options = {}) {
  const kind = specification?.kind;
  if (!Object.hasOwn(REQUIRED_HUMAN_CHECKS, kind)) throw new Error('Unsupported artifact use kind');
  if (!specification.task_id) throw new Error('task_id is required');
  const artifact = await boundFile(root, specification.artifact);
  const hashCheck = check('artifact_hash', artifact.sha256 === specification.artifact.sha256.toLowerCase() ? 'passed' : 'failed', artifact.sha256 === specification.artifact.sha256.toLowerCase() ? '산출물 SHA-256 일치' : '산출물 SHA-256 불일치');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const automated = kind === 'plan' ? await planChecks(root, artifact, specification)
    : kind === 'docx' || kind === 'hwpx' ? await documentChecks(root, artifact, kind, specification)
      : kind === 'video' ? await videoChecks(root, artifact, specification, fetchImpl)
        : await readmeChecks(artifact, specification, fetchImpl);
  const checks = [hashCheck, ...automated, ...manualChecks(kind, specification)];
  const result = checks.some(item => item.result === 'failed') ? 'failed'
    : checks.every(item => item.result === 'passed') ? 'passed' : 'not_run';
  const automatedPassed = checks.filter(item => item.source === 'automated').every(item => item.result === 'passed');
  const report = {
    schema_version: 1,
    task_id: specification.task_id,
    kind,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    result,
    status: result === 'passed' ? 'use_verified' : automatedPassed ? 'automated_verified' : 'generated',
    checked_at: isoNow(),
    human_confirmation: specification.human_confirmation?.confirmed === true ? {
      verified_by: String(specification.human_confirmation.verified_by || ''),
      checked_at: String(specification.human_confirmation.checked_at || '')
    } : null,
    checks
  };
  await new SchemaRegistry(root).assert('use-verification', report);
  return report;
}
