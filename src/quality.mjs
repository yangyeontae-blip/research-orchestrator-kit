import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from './schemas.mjs';
import { exists, isoNow, readJson, sha256File, slash, writeJson } from './utils.mjs';

const evidenceLabels = {
  original_verified: '원문 확인',
  parsed_verified: '파싱 확인',
  metadata_only: '초록·메타데이터만 확인',
  unverified: '미확인'
};

function section(text, pattern) {
  return pattern.test(text);
}

function citationPairs(text) {
  const [body, references = ''] = text.split(/\n#{1,3}\s*(?:참고문헌|References)\s*\n/i);
  const citations = new Set();
  for (const match of body.matchAll(/\(([\p{L}][\p{L}\p{M}'’.-]+)(?:\s+(?:외|et al\.))?,?\s*(\d{4}[a-z]?)\)/gu)) {
    citations.add(`${match[1].toLowerCase()}|${match[2]}`);
  }
  const refs = new Set();
  for (const line of references.split(/\r?\n/)) {
    const match = line.match(/^[-*\s]*(?:\d+\.\s*)?([\p{L}][\p{L}\p{M}'’.-]+).*?\((\d{4}[a-z]?)\)/u);
    if (match) refs.add(`${match[1].toLowerCase()}|${match[2]}`);
  }
  return {
    citations: [...citations], references: [...refs],
    missingReferences: [...citations].filter(key => !refs.has(key)),
    uncitedReferences: [...refs].filter(key => !citations.has(key))
  };
}

function check(id, label, passed, evidence) {
  return { id, label, passed: Boolean(passed), evidence, source: 'automated' };
}

export async function generateQualityReport(root, projectDir, planPath, options = {}) {
  const project = path.resolve(root, projectDir);
  const plan = path.resolve(root, planPath);
  const text = await fs.readFile(plan, 'utf8');
  const brief = await readJson(path.join(project, 'research-brief.json'));
  const ledgerPath = path.join(project, 'claim-ledger.json');
  const ledger = await exists(ledgerPath) ? await readJson(ledgerPath) : { claims: [] };
  const literaturePath = path.join(project, 'literature-manifest.json');
  const literature = await exists(literaturePath) ? await readJson(literaturePath) : { items: [] };
  const pairs = citationPairs(text);
  const claimsMarked = ledger.claims.length > 0 && ledger.claims.every(item => evidenceLabels[item.verification_status] && item.verification_status !== 'unverified');
  const questions = section(text, /연구\s*문제|연구\s*질문|research questions?/i);
  const data = section(text, /자료\s*수집|자료원|participants?|data sources?|sampling/i);
  const analysis = section(text, /자료\s*분석|분석\s*방법|analysis/i);
  const ethics = section(text, /연구\s*윤리|익명|동의|irb|ethic/i);
  const feasibility = Boolean(brief.deadline) && section(text, /일정|timeline|추진/i);
  const references = /참고문헌|references/i.test(text);
  const profileFormat = brief.profile === 'apa7'
    ? (brief.apa_paper_type !== 'not_applicable' && /참고문헌|references/i.test(text))
    : brief.profile === 'jqi'
      ? (/국문\s*요약|초록/i.test(text) && /abstract/i.test(text) && /주제어|keywords/i.test(text))
      : true;
  const checks = [
    check('question_scope', '연구질문·대상·범위', questions, questions ? '연구질문 표지를 찾음' : '연구질문 표지를 찾지 못함'),
    check('method_alignment', '연구질문–자료–분석 정합성 필드', questions && data && analysis, `질문=${questions}, 자료=${data}, 분석=${analysis}`),
    check('evidence_status', '핵심 주장 근거 상태', claimsMarked, ledger.claims.length ? `${ledger.claims.length}개 주장 상태 표시` : '근거 장부가 비어 있음'),
    check('citation_reference', '본문 인용–참고문헌 대응', references && pairs.missingReferences.length === 0 && pairs.uncitedReferences.length === 0, `누락=${pairs.missingReferences.length}, 미인용=${pairs.uncitedReferences.length}`),
    check('feasibility', '실행 가능성·일정', feasibility, brief.deadline ? `마감일 ${brief.deadline}` : '마감일 미정'),
    check('ethics', '연구윤리·민감정보', ethics || !brief.sensitive_information, ethics ? '윤리 표지를 찾음' : '민감정보 없음으로 응답됨'),
    check('profile_format', `${brief.profile} 형식 필수 요소`, profileFormat, profileFormat ? '자동 형식 표지 통과' : '필수 형식 표지 누락'),
    check('literature_decisions', '문헌 선정·제외 이유', literature.items.length === 0 || literature.items.every(item => item.reason?.trim()), `${literature.items.length}개 문헌 점검`)
  ];
  const score = Number((10 * checks.filter(item => item.passed).length / checks.length).toFixed(1));
  const report = {
    schema_version: 1,
    project_id: brief.project_id,
    profile: brief.profile,
    plan: { path: slash(path.relative(root, plan)), sha256: await sha256File(plan) },
    automated: {
      score,
      hard_checks_passed: checks.every(item => item.passed),
      checks,
      limitations: [
        '자동 검사는 제목과 장부의 존재·대응만 확인하며 연구의 학술적 타당성을 판정하지 않는다.',
        'AI 평가와 사람 평가는 별도 필드이며 자동 점수에 포함되지 않는다.',
        '원문 확인 상태는 사람이 원문과 위치를 대조한 뒤에만 올릴 수 있다.'
      ]
    },
    ai_assessment: options.aiAssessment || null,
    human_assessment: options.humanAssessment || null,
    generated_at: isoNow()
  };
  await new SchemaRegistry(root).assert('quality-report', report);
  const jsonPath = path.join(project, 'quality-report.json');
  const mdPath = path.join(project, 'quality-report.md');
  await writeJson(jsonPath, report);
  const markdown = [
    '# 계획서 품질 보고서', '',
    `- 계획서: ${report.plan.path}`,
    `- SHA-256: ${report.plan.sha256}`,
    `- 프로필: ${report.profile}`,
    `- 자동 검사 점수: ${score}/10`,
    `- 자동 하드 체크: ${report.automated.hard_checks_passed ? '통과' : '미통과'}`,
    `- AI 평가: ${report.ai_assessment ? '기록됨' : '미실시'}`,
    `- 사람 평가: ${report.human_assessment ? '기록됨' : '미실시'}`,
    '', '## 자동 검사', '',
    ...checks.map(item => `- [${item.passed ? 'x' : ' '}] ${item.label}: ${item.evidence}`),
    '', '## 자동 검사의 한계', '',
    ...report.automated.limitations.map(item => `- ${item}`), ''
  ].join('\n');
  await fs.writeFile(mdPath, markdown, 'utf8');
  return { report, json_path: slash(path.relative(root, jsonPath)), md_path: slash(path.relative(root, mdPath)) };
}

export async function validateStandardArtifacts(root, projectDir, options = {}) {
  const project = path.resolve(root, projectDir);
  const registry = new SchemaRegistry(root);
  const targets = [
    ['research-brief', 'research-brief.json'],
    ['literature-manifest', 'literature-manifest.json'],
    ['claim-ledger', 'claim-ledger.json'],
    ['quality-report', 'quality-report.json'],
    ['document-manifest', 'document-manifest.json']
  ];
  const results = [];
  for (const [schema, file] of targets) {
    const target = path.join(project, file);
    if (!await exists(target)) {
      results.push({ file, status: ['quality-report', 'document-manifest'].includes(schema) ? 'optional_missing' : 'missing' });
      continue;
    }
    try {
      const value = await readJson(target);
      await registry.assert(schema, value);
      if (schema === 'document-manifest') {
        const md = path.resolve(root, value.markdown.path);
        const docx = path.resolve(root, value.docx.path);
        if (await sha256File(md) !== value.markdown.sha256 || await sha256File(docx) !== value.docx.sha256) throw new Error('document manifest hash mismatch');
      }
      results.push({ file, status: 'valid' });
    } catch (error) {
      results.push({ file, status: 'invalid', error: error.message });
    }
  }
  if (options.plan) await generateQualityReport(root, projectDir, options.plan);
  return { ok: results.every(item => !['missing', 'invalid'].includes(item.status)), results };
}
