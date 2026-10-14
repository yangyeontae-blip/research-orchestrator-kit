import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { toolkitFixture } from './helpers.mjs';
import { Engine } from '../src/engine.mjs';

async function writeReport(root, plan, automated) {
  await fs.writeFile(
    path.join(root, 'quality-report.json'),
    JSON.stringify({
      schema_version: 1,
      project_id: 'synthetic',
      profile: 'generic',
      plan: { path: plan.path, sha256: plan.sha256 },
      automated: { score: 6.3, checks: [], limitations: [], ...automated },
      ai_assessment: null,
      human_assessment: null,
      generated_at: new Date().toISOString()
    })
  );
}

function humanCheck(task, plan) {
  const checked_at = new Date().toISOString();
  return {
    task_id: task.id,
    kind: 'plan',
    artifact: plan,
    human_confirmation: { confirmed: true, verified_by: 'synthetic-reviewer', checked_at },
    human_checks: [
      { name: 'evidence_source_checked', result: 'passed', evidence: 'synthetic', method: 'fixture', checked_at },
      { name: 'method_alignment_reviewed', result: 'passed', evidence: 'synthetic', method: 'fixture', checked_at }
    ]
  };
}

test('a first draft passes use verification on the draft checks before any evidence exists', async (t) => {
  const root = await toolkitFixture(t);
  await fs.writeFile(path.join(root, 'idea.md'), 'synthetic idea');
  await fs.writeFile(path.join(root, 'plan.md'), 'synthetic plan draft');
  const engine = new Engine(root);
  const state = await engine.init({ profile: 'generic' });
  const task = await engine.enqueue({
    request_id: 'p',
    workflow_id: state.workflow_id,
    stage: 'plan',
    inputs: [{ path: 'idea.md' }]
  });
  const claim = await engine.claim(task.id, 'research-agent');
  await engine.complete({
    task_id: task.id,
    token: claim.token,
    status: 'completed',
    artifacts: [{ kind: 'plan', path: 'plan.md' }]
  });
  const plan = (await engine.status()).artifacts.plan || (await engine.status()).tasks[0].artifacts[0];

  await writeReport(root, plan, { hard_checks_passed: false, draft_checks_passed: false });
  assert.equal((await engine.verifyUse(task.id, humanCheck(task, plan))).completion_level, 'generated');

  await writeReport(root, plan, { hard_checks_passed: false, draft_checks_passed: true });
  const verified = await engine.verifyUse(task.id, humanCheck(task, plan));
  assert.equal(verified.completion_level, 'use_verified');
  assert.equal((await engine.status()).current_stage, 'collection_approval');
});

test('a revised plan is held to every check, not the draft subset', async (t) => {
  const root = await toolkitFixture(t);
  await fs.writeFile(path.join(root, 'idea.md'), 'synthetic idea');
  await fs.writeFile(path.join(root, 'plan.md'), 'synthetic plan');
  const engine = new Engine(root);
  const state = await engine.init({ profile: 'generic' });
  const task = await engine.enqueue({
    request_id: 'p',
    workflow_id: state.workflow_id,
    stage: 'plan',
    inputs: [{ path: 'idea.md' }]
  });
  const claim = await engine.claim(task.id, 'research-agent');
  await engine.complete({
    task_id: task.id,
    token: claim.token,
    status: 'completed',
    artifacts: [{ kind: 'plan', path: 'plan.md' }]
  });
  const plan = (await engine.status()).tasks[0].artifacts[0];
  await writeReport(root, plan, { hard_checks_passed: false, draft_checks_passed: true });
  const asRevision = await (
    await import('../src/use-verification.mjs')
  ).verifyArtifactUse(root, { ...humanCheck(task, plan), stage: 'revise' });
  assert.notEqual(asRevision.status, 'use_verified');
});
