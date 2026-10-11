import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Engine } from '../src/engine.mjs';
import { toolkitFixture } from './helpers.mjs';

async function planReady(t) {
  const root = await toolkitFixture(t);
  await fs.mkdir(path.join(root, 'workspace', 'video'), { recursive: true });
  for (const [name, body] of [['input.md', 'idea'], ['plan.md', '# Plan'], ['storyboard.md', '# Storyboard'], ['source-map.md', '# Source map']]) {
    await fs.writeFile(path.join(root, 'workspace', 'video', name), body);
  }
  const engine = new Engine(root);
  const state = await engine.init({ profile: 'generic', project_dir: 'workspace/video' });
  await engine.enqueue({ request_id: 'plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'workspace/video/input.md' }] });
  const planTask = (await engine.status()).tasks[0];
  const claim = await engine.claim(planTask.id, 'research');
  await engine.complete({ task_id: planTask.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'plan', path: 'workspace/video/plan.md' }] });
  const plan = (await engine.status()).tasks.find(item => item.id === planTask.id).artifacts.find(item => item.kind === 'plan');
  await fs.writeFile(path.join(root, 'workspace', 'video', 'quality-report.json'), JSON.stringify({ schema_version: 1, project_id: 'synthetic', profile: 'generic', plan: { path: plan.path, sha256: plan.sha256 },
    automated: { score: 10, hard_checks_passed: true, checks: [], limitations: [] },
    ai_assessment: null, human_assessment: null, generated_at: new Date().toISOString() }));
  const automatic = await engine.verifyUse(planTask.id, { task_id: planTask.id, kind: 'plan', artifact: plan });
  assert.equal(automatic.completion_level, 'automated_verified');
  const checked_at = new Date().toISOString();
  await engine.verifyUse(planTask.id, {
    task_id: planTask.id, kind: 'plan', artifact: plan,
    human_confirmation: { confirmed: true, verified_by: 'synthetic-test-reviewer', checked_at },
    human_checks: [
      { name: 'evidence_source_checked', result: 'passed', evidence: 'Synthetic source checked', method: 'fixture inspection', checked_at },
      { name: 'method_alignment_reviewed', result: 'passed', evidence: 'Synthetic method alignment checked', method: 'fixture inspection', checked_at }
    ]
  });
  return { root, engine };
}

test('video branch requires an explicit request and storyboard approval bound to hashes', async t => {
  const { root, engine } = await planReady(t);
  await assert.rejects(engine.requestVideo({}), /explicit human request/);
  const requested = await engine.requestVideo({ human_requested: true, duration_seconds: 75 });
  assert.equal(requested.stage, 'video_storyboard');
  let status = await engine.status();
  assert.equal(status.current_stage, 'collection_approval');
  let claim = await engine.claim(requested.id, 'video');
  await engine.complete({
    task_id: requested.id, token: claim.token, status: 'completed',
    artifacts: [
      { kind: 'video_storyboard', path: 'workspace/video/storyboard.md' },
      { kind: 'video_source_map', path: 'workspace/video/source-map.md' }
    ]
  });
  status = await engine.status();
  assert.equal(status.branches.video.status, 'storyboard_approval');
  await assert.rejects(engine.approve('video', {
    human_confirmed: false, plan: status.artifacts.plan,
    storyboard: status.artifacts.video_storyboard, source_map: status.artifacts.video_source_map
  }), /confirmation/);
  const approved = await engine.approve('video', {
    human_confirmed: true, plan: status.artifacts.plan,
    storyboard: status.artifacts.video_storyboard, source_map: status.artifacts.video_source_map
  });
  assert.equal(approved.task.stage, 'video_render');
  await fs.writeFile(path.join(root, 'workspace', 'video', 'result.mp4'), Buffer.from('synthetic mp4 bytes'));
  claim = await engine.claim(approved.task.id, 'video');
  const videoBinding = await engine.artifact({ path: 'workspace/video/result.mp4', kind: 'video_file' });
  const manifest = {
    schema_version: 1,
    plan_sha256: status.artifacts.plan.sha256,
    storyboard_sha256: status.artifacts.video_storyboard.sha256,
    source_map_sha256: status.artifacts.video_source_map.sha256,
    video: { path: videoBinding.path, sha256: videoBinding.sha256, duration_seconds: 75, width: 1920, height: 1080, fps: 30, video_codec: 'h264', audio_codec: 'aac' },
    technical_checks: { decoded_full_video: true, dimensions_verified: true, captions_checked: true, audio_checked: true, source_licenses_checked: true },
    quality_status: 'review_candidate', quality_score: null, created_at: new Date().toISOString()
  };
  await fs.writeFile(path.join(root, 'workspace', 'video', 'video-manifest.json'), JSON.stringify(manifest, null, 2));
  await engine.complete({
    task_id: approved.task.id, token: claim.token, status: 'completed',
    artifacts: [videoBinding, { kind: 'video_manifest', path: 'workspace/video/video-manifest.json' }]
  });
  status = await engine.status();
  assert.equal(status.branches.video.status, 'use_verification');
  assert.equal(status.tasks.find(item => item.id === approved.task.id).completion_level, 'generated');
  assert.equal(status.current_stage, 'collection_approval');
});

test('a new plan hash invalidates an earlier video approval', async t => {
  const { root, engine } = await planReady(t);
  const requested = await engine.requestVideo({ human_requested: true });
  let claim = await engine.claim(requested.id, 'video');
  await engine.complete({ task_id: requested.id, token: claim.token, status: 'completed', artifacts: [
    { kind: 'video_storyboard', path: 'workspace/video/storyboard.md' }, { kind: 'video_source_map', path: 'workspace/video/source-map.md' }
  ] });
  let status = await engine.status();
  const approved = await engine.approve('video', { human_confirmed: true, plan: status.artifacts.plan, storyboard: status.artifacts.video_storyboard, source_map: status.artifacts.video_source_map });
  await fs.appendFile(path.join(root, 'workspace', 'video', 'plan.md'), '\nchanged');
  await assert.rejects(engine.claim(approved.task.id, 'video'), /hash mismatch/);
});

