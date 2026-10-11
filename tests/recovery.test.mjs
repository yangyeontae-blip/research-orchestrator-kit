import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Engine } from '../src/engine.mjs';
import { toolkitFixture } from './helpers.mjs';

async function setup(t, options = {}) {
  const root = await toolkitFixture(t);
  for (const [file, text] of Object.entries({
    'input.md': 'synthetic idea', 'plan.md': 'synthetic plan v1', 'plan-v2.md': 'synthetic plan v2',
    'collection.md': 'synthetic collection', 'parsed.md': 'synthetic parsed', 'review.md': 'synthetic review'
  })) await fs.writeFile(path.join(root, file), text);
  const engine = new Engine(root, options);
  const state = await engine.init({ profile: 'generic' });
  return { root, engine, state };
}

async function runTask(engine, stage, artifacts, claimant = `${stage}-agent`) {
  const task = (await engine.status()).tasks.find(item => item.stage === stage && item.status === 'queued');
  const claim = await engine.claim(task.id, claimant);
  return engine.complete({ task_id: task.id, token: claim.token, status: 'completed', artifacts });
}

async function verifyPlan(engine, taskId) {
  const task = (await engine.status()).tasks.find(item => item.id === taskId);
  const plan = task.artifacts.find(item => item.kind === 'plan');
  await fs.writeFile(path.join(engine.root, 'quality-report.json'), JSON.stringify({
    schema_version: 1, project_id: 'synthetic', profile: 'generic', plan: { path: plan.path, sha256: plan.sha256 },
    automated: { score: 10, hard_checks_passed: true, checks: [], limitations: [] },
    ai_assessment: null, human_assessment: null, generated_at: new Date().toISOString()
  }));
  const checked_at = new Date().toISOString();
  return engine.verifyUse(taskId, {
    task_id: taskId, kind: 'plan', artifact: plan,
    human_confirmation: { confirmed: true, verified_by: 'independent-reviewer', checked_at },
    human_checks: [
      { name: 'evidence_source_checked', result: 'passed', evidence: 'synthetic', method: 'fixture', checked_at },
      { name: 'method_alignment_reviewed', result: 'passed', evidence: 'synthetic', method: 'fixture', checked_at }
    ]
  });
}

test('a failed receipt is accepted after an input changed, and retry --rebind re-hashes free inputs', async t => {
  const { root, engine, state } = await setup(t);
  const task = await engine.enqueue({ request_id: 'p', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  const claim = await engine.claim(task.id, 'agent');
  await fs.writeFile(path.join(root, 'input.md'), 'synthetic idea, edited');
  await assert.rejects(engine.complete({ task_id: task.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'plan', path: 'plan.md' }] }), /hash mismatch/);
  const failed = await engine.complete({ task_id: task.id, token: claim.token, status: 'failed', reason: 'input changed', artifacts: [] });
  assert.equal(failed.status, 'failed');
  assert.match(failed.binding_warning, /hash mismatch/);
  await engine.retry(task.id);
  await assert.rejects(engine.claim(task.id, 'agent'), /hash mismatch/);
  // A queued task with a stale input is not a dead end either.
  const rebound = await engine.retry(task.id, { rebind: true });
  assert.equal(rebound.status, 'queued');
  await runTask(engine, 'plan', [{ kind: 'plan', path: 'plan.md' }]);
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
});

test('rebinding never refreshes an approval-bound plan', async t => {
  const { root, engine, state } = await setup(t);
  await engine.enqueue({ request_id: 'p', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  const done = await runTask(engine, 'plan', [{ kind: 'plan', path: 'plan.md' }]);
  await verifyPlan(engine, done.id);
  const status = await engine.status();
  const approved = await engine.approve('collection', { workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan });
  await fs.writeFile(path.join(root, 'plan.md'), 'plan edited after approval');
  await assert.rejects(engine.retry(approved.task.id, { rebind: true }), /approved plan changed/);
});

test('retry --rebind refreshes changed inputs of a failed task', async t => {
  const { root, engine, state } = await setup(t);
  const task = await engine.enqueue({ request_id: 'p', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  const claim = await engine.claim(task.id, 'agent');
  await fs.writeFile(path.join(root, 'input.md'), 'synthetic idea, edited');
  await engine.complete({ task_id: task.id, token: claim.token, status: 'failed', reason: 'input changed', artifacts: [] });
  const retried = await engine.retry(task.id, { rebind: true });
  assert.notEqual(retried.inputs[0].sha256, task.inputs[0].sha256);
  assert.equal(retried.attempts.at(-1).inputs[0].sha256, task.inputs[0].sha256);
  await runTask(engine, 'plan', [{ kind: 'plan', path: 'plan.md' }]);
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
});

test('release frees a role held by an abandoned task', async t => {
  const { engine, state } = await setup(t, { leaseMs: 1 });
  const first = await engine.enqueue({ request_id: 's1', workflow_id: state.workflow_id, stage: 'study', inputs: [{ path: 'input.md' }] });
  const claim = await engine.claim(first.id, 'agent');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await engine.status()).tasks[0].lease_expired, true);
  const released = await engine.release(first.id, 'agent window closed');
  assert.equal(released.status, 'failed');
  assert.equal(released.reason, 'agent window closed');
  assert.equal((await engine.status()).current_stage, 'study_failed');
  // The abandoned agent's token is no longer valid.
  await assert.rejects(engine.complete({ task_id: first.id, token: claim.token, status: 'completed', artifacts: [] }), /token/);
  await engine.retry(first.id);
  const reclaimed = await engine.claim(first.id, 'agent');
  assert.equal(reclaimed.status, 'running');
});

test('an expired lease is failed when another task needs the role', async t => {
  const { root, engine, state } = await setup(t, { leaseMs: 1 });
  const first = await engine.enqueue({ request_id: 's1', workflow_id: state.workflow_id, stage: 'study', inputs: [{ path: 'input.md' }] });
  await engine.claim(first.id, 'agent');
  await new Promise(resolve => setTimeout(resolve, 5));
  const stateFile = path.join(root, '.research-work', 'state.json');
  const raw = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  raw.tasks.push({ ...raw.tasks[0], id: 'second', key: 'second-key', request_id: 's2', status: 'queued', token: null, lease_expires_at: null });
  await fs.writeFile(stateFile, JSON.stringify(raw));
  const claimed = await engine.claim('second', 'agent');
  assert.equal(claimed.status, 'running');
  const expired = (await engine.status()).tasks.find(item => item.id === first.id);
  assert.equal(expired.status, 'failed');
  assert.match(expired.reason, /Lease expired/);
});

test('a lock left by a dead process is removed; a fresh live lock is respected', async t => {
  const { root, engine } = await setup(t);
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const lockPath = path.join(root, '.research-work', 'state.lock');
  await fs.writeFile(lockPath, JSON.stringify({ pid: Number(child.stdout), host: os.hostname(), at: new Date().toISOString() }));
  await engine.init({ profile: 'generic' });
  await assert.rejects(fs.access(lockPath));
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid + 0, host: 'another-host', at: new Date().toISOString() }));
  const old = new Date(Date.now() - 10 * 60 * 1000);
  await fs.utimes(lockPath, old, old);
  await engine.init({ profile: 'generic' });
  await assert.rejects(fs.access(lockPath));
});

test('a plan can be sent back for rework before use verification, and later rounds get fresh request ids', async t => {
  const { engine, state } = await setup(t);
  await engine.enqueue({ request_id: 'p', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  const done = await runTask(engine, 'plan', [{ kind: 'plan', path: 'plan.md' }]);
  await assert.rejects(engine.rework(done.id, {}), /feedback/);
  const rework = await engine.rework(done.id, { feedback: 'Narrow the research question', requested_by: 'pi' });
  assert.equal(rework.stage, 'plan');
  assert.equal(rework.rework_of, done.id);
  assert.match(rework.context, /Narrow the research question/);
  assert.ok(rework.inputs.some(item => item.path === 'plan.md'));
  assert.equal((await engine.status()).current_stage, 'plan');
  await assert.rejects(engine.rework(done.id, { feedback: 'again' }), /already sent back/);
  const second = await runTask(engine, 'plan', [{ kind: 'plan', path: 'plan-v2.md' }]);
  await verifyPlan(engine, second.id);
  let status = await engine.status();
  assert.equal(status.current_stage, 'collection_approval');
  assert.equal(status.artifacts.plan.path, 'plan-v2.md');

  await engine.approve('collection', { workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan });
  await runTask(engine, 'literature', [{ kind: 'collection_report', path: 'collection.md' }, { kind: 'parsed_text', path: 'parsed.md' }]);
  const review = await runTask(engine, 'review', [{ kind: 'review_report', path: 'review.md' }]);
  assert.equal((await engine.status()).current_stage, 'revision_approval');

  const reviewAgain = await engine.rework(review.id, { feedback: 'Check section 3 sources' });
  assert.equal(reviewAgain.stage, 'review');
  await fs.writeFile(path.join(engine.root, 'review.md'), 'synthetic review, second pass');
  const review2 = await runTask(engine, 'review', [{ kind: 'review_report', path: 'review.md' }]);
  status = await engine.status();
  assert.equal(status.current_stage, 'revision_approval');
  assert.equal(status.artifacts.review_report.sha256, review2.artifacts[0].sha256);

  await assert.rejects(engine.approve('revision', {
    workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan, report: status.artifacts.review_report, approved_items: []
  }), /decline_all/);
  const declined = await engine.approve('revision', {
    workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan, report: status.artifacts.review_report,
    approved_items: [], decline_all: true
  });
  assert.equal(declined.task, null);
  status = await engine.status();
  assert.equal(status.current_stage, 'collection_approval');
  assert.equal(status.cycle, 2);
  const second_round = await engine.approve('collection', { workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan });
  assert.equal(second_round.task.stage, 'literature');
});

test('literature commands are refused until collection is approved for the current plan', async t => {
  const { root, engine, state } = await setup(t);
  await assert.rejects(engine.collectionGate(), /approved, open literature task/);
  await engine.enqueue({ request_id: 'p', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  const done = await runTask(engine, 'plan', [{ kind: 'plan', path: 'plan.md' }]);
  await verifyPlan(engine, done.id);
  await assert.rejects(engine.collectionGate(), /current stage: collection_approval/);
  const status = await engine.status();
  await engine.approve('collection', { workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan });
  assert.equal((await engine.collectionGate()).plan_sha256, status.artifacts.plan.sha256);
  await fs.writeFile(path.join(root, 'plan.md'), 'plan edited after approval');
  await assert.rejects(engine.collectionGate(), /hash mismatch/);
});

test('bundled profiles and schemas are used when the project root has none', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'rok-bare-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await fs.writeFile(path.join(base, 'idea.md'), 'synthetic idea');
  const engine = new Engine(base);
  const state = await engine.init({ profile: 'apa7' });
  assert.equal(state.profile, 'apa7');
  const task = await engine.enqueue({ request_id: 'p', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'idea.md' }] });
  assert.equal(task.stage, 'plan');
});
