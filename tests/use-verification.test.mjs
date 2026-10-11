import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { toolkitFixture } from './helpers.mjs';
import { sha256File } from '../src/utils.mjs';
import { verifyArtifactUse } from '../src/use-verification.mjs';
import { createResearchProject } from '../src/wizard.mjs';
import { exportPlanDocx } from '../src/export.mjs';

const checkedAt = '2030-01-01T00:00:00.000Z';
const confirmation = { confirmed: true, verified_by: 'synthetic human reviewer', checked_at: checkedAt };
const human = names => names.map(name => ({ name, result: 'passed', evidence: `Synthetic reviewer observed ${name}`, method: 'direct inspection', checked_at: checkedAt }));

test('a plan cannot reach use_verified from an automated report alone', async t => {
  const root = await toolkitFixture(t);
  const folder = path.join(root, 'workspace', 'plan');
  await fs.mkdir(folder, { recursive: true });
  const plan = path.join(folder, 'plan.md');
  await fs.writeFile(plan, '# Synthetic plan\n');
  const hash = await sha256File(plan);
  const quality = {
    schema_version: 1, project_id: 'synthetic', profile: 'generic',
    plan: { path: 'workspace/plan/plan.md', sha256: hash },
    automated: { score: 10, hard_checks_passed: true, checks: [], limitations: [] },
    ai_assessment: null, human_assessment: null, generated_at: checkedAt
  };
  await fs.writeFile(path.join(folder, 'quality-report.json'), JSON.stringify(quality));
  const specification = { task_id: 'plan-task', kind: 'plan', artifact: { path: quality.plan.path, sha256: hash } };
  const automatic = await verifyArtifactUse(root, specification);
  assert.equal(automatic.status, 'automated_verified');
  assert.equal(automatic.result, 'not_run');
  const claimedWithoutEvidence = await verifyArtifactUse(root, {
    ...specification, human_confirmation: confirmation,
    human_checks: human(['evidence_source_checked', 'method_alignment_reviewed']).map(item => ({ ...item, evidence: '' }))
  });
  assert.equal(claimedWithoutEvidence.status, 'automated_verified');
  const reviewed = await verifyArtifactUse(root, {
    ...specification, human_confirmation: confirmation,
    human_checks: human(['evidence_source_checked', 'method_alignment_reviewed'])
  });
  assert.equal(reviewed.status, 'use_verified');
  await fs.appendFile(plan, 'Changed after review\n');
  assert.equal((await verifyArtifactUse(root, { ...specification, human_confirmation: confirmation, human_checks: human(['evidence_source_checked', 'method_alignment_reviewed']) })).status, 'generated');
});

test('deployed video requires actual playback, seeking, and audio observations', async t => {
  const root = await toolkitFixture(t);
  const folder = path.join(root, 'workspace', 'video');
  await fs.mkdir(folder, { recursive: true });
  const video = path.join(folder, 'result.mp4');
  await fs.writeFile(video, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]));
  const hash = await sha256File(video);
  const manifest = {
    schema_version: 1, plan_sha256: 'a'.repeat(64), storyboard_sha256: 'b'.repeat(64), source_map_sha256: 'c'.repeat(64),
    video: { path: 'workspace/video/result.mp4', sha256: hash, duration_seconds: 10, width: 1920, height: 1080, fps: 30, video_codec: 'h264', audio_codec: 'aac' },
    technical_checks: { decoded_full_video: true, dimensions_verified: true, captions_checked: true, audio_checked: true, source_licenses_checked: true },
    quality_status: 'passed', quality_score: 9.5, created_at: checkedAt
  };
  await fs.writeFile(path.join(folder, 'video-manifest.json'), JSON.stringify(manifest));
  const fakeFetch = async (_url, request) => request.headers.Range
    ? { status: 206, ok: true, headers: new Headers({ 'content-range': 'bytes 0-1023/9999' }), arrayBuffer: async () => Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]) }
    : { status: 200, ok: true, headers: new Headers() };
  const specification = {
    task_id: 'video-task', kind: 'video', artifact: { path: manifest.video.path, sha256: hash },
    deployed_url: 'https://example.org/player', media_url: 'https://example.org/result.mp4'
  };
  const automatic = await verifyArtifactUse(root, specification, { fetchImpl: fakeFetch });
  assert.equal(automatic.status, 'automated_verified');
  const reviewed = await verifyArtifactUse(root, {
    ...specification, human_confirmation: confirmation,
    human_checks: human(['browser_playback', 'seeking', 'audio'])
  }, { fetchImpl: fakeFetch });
  assert.equal(reviewed.status, 'use_verified');
  const brokenRange = await verifyArtifactUse(root, {
    ...specification, human_confirmation: confirmation,
    human_checks: human(['browser_playback', 'seeking', 'audio'])
  }, { fetchImpl: async () => ({ status: 200, ok: true, headers: new Headers(), arrayBuffer: async () => Buffer.alloc(0) }) });
  assert.equal(brokenRange.status, 'generated');
  assert.equal(brokenRange.result, 'failed');
});

test('a generated DOCX remains unverified until opened and visually compared', async t => {
  const root = await toolkitFixture(t);
  const created = await createResearchProject(root, {
    title: 'Synthetic document', idea: 'Fictional idea', profile: 'generic',
    entry_mode: 'direct_plan', method: 'qualitative', deadline: '2030-10-31',
    institution_guidance: '', sensitive_information: false, apa_paper_type: 'not_applicable'
  });
  const plan = path.join(root, created.project_dir, 'plan.md');
  await fs.writeFile(plan, '# Synthetic plan\n\n## Research question\nFictional data?\n');
  const exported = await exportPlanDocx(root, created.project_dir, path.relative(root, plan));
  const specification = {
    task_id: 'document-task', kind: 'docx', artifact: exported.manifest.docx,
    manifest_path: exported.document_manifest
  };
  assert.equal((await verifyArtifactUse(root, specification)).status, 'automated_verified');
  assert.equal((await verifyArtifactUse(root, {
    ...specification, human_confirmation: confirmation,
    human_checks: human(['opened_in_application', 'layout_reviewed', 'content_compared'])
  })).status, 'use_verified');
});
