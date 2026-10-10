import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(t, profile = 'generic') {
  const testBase = path.join(os.tmpdir(), 'research-orchestrator-kit-tests');
  await fs.mkdir(testBase, { recursive: true });
  const root = await fs.mkdtemp(path.join(testBase, 'research-orchestrator-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(testBase));
    assert.ok(path.basename(root).startsWith('research-orchestrator-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, 'profiles'));
  await fs.copyFile(path.join(sourceRoot, 'profiles', 'generic.json'), path.join(root, 'profiles', 'generic.json'));
  await fs.copyFile(path.join(sourceRoot, 'profiles', 'apa7.json'), path.join(root, 'profiles', 'apa7.json'));
  await fs.copyFile(path.join(sourceRoot, 'profiles', 'jqi.json'), path.join(root, 'profiles', 'jqi.json'));
  await fs.writeFile(path.join(root, 'input.md'), 'synthetic study input');
  await fs.writeFile(path.join(root, 'record.md'), 'synthetic study record');
  await fs.writeFile(path.join(root, 'plan.md'), 'synthetic plan v1');
  await fs.writeFile(path.join(root, 'quality.md'), 'synthetic quality review');
  await fs.writeFile(path.join(root, 'handoff.md'), 'synthetic literature handoff');
  await fs.writeFile(path.join(root, 'collection.md'), 'synthetic collection report');
  await fs.writeFile(path.join(root, 'parsed.md'), 'synthetic parsed notes');
  await fs.writeFile(path.join(root, 'review.md'), 'synthetic evidence review');
  await fs.writeFile(path.join(root, 'plan-v2.md'), 'synthetic plan v2');
  const engine = new Engine(root);
  const state = await engine.init({ profile });
  return { root, engine, state };
}

async function draftPlan(engine, state, { supportArtifacts = false } = {}) {
  await engine.enqueue({ request_id: 'start-plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  let status = await engine.status();
  const task = status.tasks.find(item => item.stage === 'plan');
  const claim = await engine.claim(task.id, 'researcher');
  const artifacts = [{ kind: 'plan', path: 'plan.md' }];
  if (supportArtifacts) artifacts.push({ kind: 'quality_review', path: 'quality.md' }, { kind: 'literature_handoff', path: 'handoff.md' });
  await engine.complete({ task_id: task.id, token: claim.token, status: 'completed', artifacts });
  return engine.status();
}

async function approveAndRunLiterature(engine, status, receiptStatus = 'completed') {
  await engine.approve('collection', {
    workflow_id: status.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: status.profile === 'jqi' ? { score: 9.1, rubric_total: 8, hard_checks_passed: true } : undefined
  });
  status = await engine.status();
  const task = status.tasks.find(item => item.stage === 'literature');
  const claim = await engine.claim(task.id, 'literature-agent');
  const artifacts = receiptStatus === 'partial'
    ? [{ kind: 'collection_report', path: 'collection.md' }]
    : [{ kind: 'collection_report', path: 'collection.md' }, { kind: 'parsed_text', path: 'parsed.md' }];
  await engine.complete({ task_id: task.id, token: claim.token, status: receiptStatus, reason: receiptStatus === 'partial' ? 'one parser failed' : undefined, artifacts });
  return { status: await engine.status(), task };
}

test('init and enqueue are idempotent, but request ids cannot be reused with different content', async t => {
  const { engine, state } = await fixture(t);
  const request = { request_id: 'study-1', workflow_id: state.workflow_id, stage: 'study', inputs: [{ path: 'input.md' }] };
  const first = await engine.enqueue(request);
  const second = await engine.enqueue(request);
  assert.equal(first.id, second.id);
  await assert.rejects(engine.enqueue({ ...request, stage: 'plan' }), /different content/);
});

test('claim is exclusive and does not expose the token in status', async t => {
  const { engine, state } = await fixture(t);
  const task = await engine.enqueue({ request_id: 'study-1', workflow_id: state.workflow_id, stage: 'study', inputs: [{ path: 'input.md' }] });
  const claim = await engine.claim(task.id, 'study-agent');
  assert.ok(claim.token);
  await assert.rejects(engine.claim(task.id, 'second-agent'), /not available/);
  assert.equal((await engine.status()).tasks[0].token, undefined);
});

test('collection approval is bound to the exact plan hash', async t => {
  const { root, engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  const approved = await engine.approve('collection', { workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan });
  await fs.writeFile(path.join(root, 'plan.md'), 'changed after approval');
  await assert.rejects(engine.claim(approved.task.id, 'literature-agent'), /hash mismatch/);
});

test('revision cannot start without approval bound to the current report', async t => {
  const { engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  ({ status } = await approveAndRunLiterature(engine, status));
  const reviewTask = status.tasks.find(item => item.stage === 'review');
  const claim = await engine.claim(reviewTask.id, 'research-agent');
  await engine.complete({ task_id: reviewTask.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'review_report', path: 'review.md' }] });
  status = await engine.status();
  await assert.rejects(engine.approve('revision', { workflow_id: state.workflow_id, human_confirmed: false, plan: status.artifacts.plan, report: status.artifacts.review_report, approved_items: ['R1'] }), /confirmation/);
  await assert.rejects(engine.approve('revision', { workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan, report: status.artifacts.review_report, approved_items: [] }), /at least one/);
});

test('changing a review report invalidates revision approval', async t => {
  const { root, engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  ({ status } = await approveAndRunLiterature(engine, status));
  const reviewTask = status.tasks.find(item => item.stage === 'review');
  const claim = await engine.claim(reviewTask.id, 'research-agent');
  await engine.complete({ task_id: reviewTask.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'review_report', path: 'review.md' }] });
  status = await engine.status();
  await fs.writeFile(path.join(root, 'review.md'), 'changed evidence review');
  await assert.rejects(engine.approve('revision', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    report: status.artifacts.review_report,
    approved_items: ['R1']
  }), /hash mismatch/);
});

test('partial literature results survive retry and only then create review', async t => {
  const { engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  let literature;
  ({ status, task: literature } = await approveAndRunLiterature(engine, status, 'partial'));
  assert.equal(status.tasks.some(item => item.stage === 'review'), false);
  assert.equal(status.tasks.find(item => item.id === literature.id).artifacts.length, 1);
  await engine.retry(literature.id);
  const claim = await engine.claim(literature.id, 'literature-agent');
  await engine.complete({ task_id: literature.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'parsed_text', path: 'parsed.md' }] });
  status = await engine.status();
  assert.equal(status.tasks.find(item => item.id === literature.id).artifacts.length, 2);
  assert.equal(status.tasks.filter(item => item.stage === 'review').length, 1);
});

test('the synthetic lifecycle stops at the new plan collection gate', async t => {
  const { engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  ({ status } = await approveAndRunLiterature(engine, status));
  const reviewTask = status.tasks.find(item => item.stage === 'review');
  let claim = await engine.claim(reviewTask.id, 'research-agent');
  await engine.complete({ task_id: reviewTask.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'review_report', path: 'review.md' }] });
  status = await engine.status();
  const revision = await engine.approve('revision', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    report: status.artifacts.review_report,
    approved_items: ['R1']
  });
  claim = await engine.claim(revision.task.id, 'research-agent');
  await engine.complete({ task_id: revision.task.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'plan', path: 'plan-v2.md' }] });
  status = await engine.status();
  assert.equal(status.current_stage, 'collection_approval');
  assert.equal(status.cycle, 2);
  assert.equal(status.approvals.collection, null);
  assert.equal(status.approvals.revision, null);
});

test('JQI profile requires its plan artifacts and toolkit gate scores', async t => {
  const { engine, state } = await fixture(t, 'jqi');
  let status = await draftPlan(engine, state, { supportArtifacts: true });
  await assert.rejects(engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: { score: 9.0, rubric_total: 8, hard_checks_passed: true }
  }), /greater than 9/);
  const result = await engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: { score: 9.1, rubric_total: 8, hard_checks_passed: true }
  });
  assert.equal(result.task.stage, 'literature');
});

test('APA 7 profile requires support artifacts and completed hard checks', async t => {
  const { engine, state } = await fixture(t, 'apa7');
  const status = await draftPlan(engine, state, { supportArtifacts: true });
  await assert.rejects(engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan
  }), /Hard checks/);
  const result = await engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: { hard_checks_passed: true }
  });
  assert.equal(result.task.stage, 'literature');
});

test('JQI plan completion requires quality review and literature handoff artifacts', async t => {
  const { engine, state } = await fixture(t, 'jqi');
  await engine.enqueue({ request_id: 'jqi-plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }] });
  const task = (await engine.status()).tasks[0];
  const claim = await engine.claim(task.id, 'research-agent');
  await assert.rejects(engine.complete({
    task_id: task.id,
    token: claim.token,
    status: 'completed',
    artifacts: [{ kind: 'plan', path: 'plan.md' }]
  }), /quality_review/);
});

test('artifacts outside the project root are rejected on every platform', async t => {
  const { root, engine } = await fixture(t);
  const outside = path.join(path.dirname(root), `outside-artifact-${Date.now()}.md`);
  await fs.writeFile(outside, 'outside');
  t.after(() => fs.unlink(outside).catch(() => {}));
  await assert.rejects(engine.artifact(outside), /inside the project root/);
});
