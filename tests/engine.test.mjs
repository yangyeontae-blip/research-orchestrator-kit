import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
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
  await fs.cp(path.join(sourceRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true });
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
  await verifyPlanUse(engine, task.id, engine.root);
  return engine.status();
}

async function verifyPlanUse(engine, taskId, root) {
  const pending = (await engine.status()).tasks.find(item => item.id === taskId);
  assert.equal(pending.completion_level, 'generated');
  const plan = pending.artifacts.find(item => item.kind === 'plan');
  await fs.writeFile(path.join(root, 'quality-report.json'), JSON.stringify({
    schema_version: 1, project_id: 'synthetic', profile: (await engine.status()).profile, plan: { path: plan.path, sha256: plan.sha256 },
    automated: { score: 10, hard_checks_passed: true, checks: [], limitations: [] },
    ai_assessment: null, human_assessment: null, generated_at: new Date().toISOString()
  }));
  const automated = await engine.verifyUse(taskId, { task_id: taskId, kind: 'plan', artifact: plan });
  assert.equal(automated.completion_level, 'automated_verified');
  const checked_at = new Date().toISOString();
  await assert.rejects(engine.verifyUse(taskId, {
    task_id: taskId, kind: 'plan', artifact: plan,
    human_confirmation: { confirmed: true, verified_by: pending.claimant, checked_at },
    human_checks: [
      { name: 'evidence_source_checked', result: 'passed', evidence: 'Synthetic sources reviewed', method: 'fixture inspection', checked_at },
      { name: 'method_alignment_reviewed', result: 'passed', evidence: 'Synthetic alignment reviewed', method: 'fixture inspection', checked_at }
    ]
  }), /Independent use reviewer/);
  await engine.verifyUse(taskId, {
    task_id: taskId, kind: 'plan', artifact: plan,
    human_confirmation: { confirmed: true, verified_by: 'synthetic-test-reviewer', checked_at },
    human_checks: [
      { name: 'evidence_source_checked', result: 'passed', evidence: 'Synthetic fixture sources reviewed', method: 'fixture inspection', checked_at },
      { name: 'method_alignment_reviewed', result: 'passed', evidence: 'Synthetic question/data/method alignment reviewed', method: 'fixture inspection', checked_at }
    ]
  });
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

test('a legacy request key remains idempotent without accepting changed context', async t => {
  const { root, engine, state } = await fixture(t);
  const request = { request_id: 'legacy-plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'input.md' }], context: 'old context' };
  const task = await engine.enqueue(request);
  const stateFile = path.join(root, '.research-work', 'state.json');
  const stored = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  const old = stored.tasks.find(item => item.id === task.id);
  old.key = createHash('sha256').update(JSON.stringify({
    workflow_id: state.workflow_id, requestId: request.request_id, stage: request.stage,
    inputs: old.inputs, plan: null, report: null, cycle: old.cycle
  })).digest('hex');
  await fs.writeFile(stateFile, JSON.stringify(stored));
  assert.equal((await engine.enqueue(request)).id, task.id);
  await assert.rejects(engine.enqueue({ ...request, context: 'changed' }), /different content/);
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
  await verifyPlanUse(engine, revision.task.id, engine.root);
  status = await engine.status();
  assert.equal(status.current_stage, 'collection_approval');
  assert.equal(status.cycle, 2);
  assert.equal(status.approvals.collection, null);
  assert.equal(status.approvals.revision, null);
});

test('a focused supplemental collection keeps earlier literature and returns to evidence review', async t => {
  const { root, engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  ({ status } = await approveAndRunLiterature(engine, status));
  const review = status.tasks.find(item => item.stage === 'review');
  const claimed = await engine.claim(review.id, 'research-agent');
  await engine.complete({ task_id: review.id, token: claimed.token, status: 'completed', artifacts: [{ kind: 'review_report', path: 'review.md' }] });
  status = await engine.status();
  const request = { plan: status.artifacts.plan, report: status.artifacts.review_report, gaps: ['자료 분석의 반례'] };
  await assert.rejects(engine.collectMore(request), /confirmation/);
  await assert.rejects(engine.collectMore({ ...request, human_confirmed: true, gaps: [] }), /at least one/);
  await engine.collectMore({ ...request, human_confirmed: true, requested_by: 'researcher' });
  status = await engine.status();
  assert.equal(status.current_stage, 'collection_approval');
  assert.equal(status.supplemental_collection.gaps[0], '자료 분석의 반례');
  const approved = await engine.approve('collection', { human_confirmed: true, plan: status.artifacts.plan });
  assert.match(approved.task.context, /자료 분석의 반례/);
  assert.ok(approved.task.inputs.some(item => item.sha256 === status.artifacts.review_report.sha256));
  assert.deepEqual((await engine.collectionGate()).gaps, ['자료 분석의 반례']);
  await fs.writeFile(path.join(root, 'parsed2.md'), 'synthetic additional parsed text');
  const literatureClaim = await engine.claim(approved.task.id, 'literature-agent');
  await engine.complete({ task_id: approved.task.id, token: literatureClaim.token, status: 'completed', artifacts: [
    { kind: 'collection_report', path: 'collection.md' }, { kind: 'parsed_text', path: 'parsed2.md' }
  ] });
  status = await engine.status();
  const nextReview = status.tasks.filter(item => item.stage === 'review').at(-1);
  assert.ok(nextReview.inputs.some(item => item.path === 'parsed.md'));
  assert.ok(nextReview.inputs.some(item => item.path === 'parsed2.md'));
  assert.match(nextReview.context, /자료 분석의 반례/);
});

test('a revised plan needs current evidence, document review, and researcher confirmation before finalization', async t => {
  const { root, engine, state } = await fixture(t);
  let status = await draftPlan(engine, state);
  ({ status } = await approveAndRunLiterature(engine, status));
  const review = status.tasks.find(item => item.stage === 'review');
  let claimed = await engine.claim(review.id, 'research-agent');
  await engine.complete({ task_id: review.id, token: claimed.token, status: 'completed', artifacts: [{ kind: 'review_report', path: 'review.md' }] });
  status = await engine.status();
  const approved = await engine.approve('revision', {
    human_confirmed: true, plan: status.artifacts.plan, report: status.artifacts.review_report, approved_items: ['R1']
  });
  claimed = await engine.claim(approved.task.id, 'research-agent');
  await engine.complete({ task_id: approved.task.id, token: claimed.token, status: 'completed', artifacts: [{ kind: 'plan', path: 'plan-v2.md' }] });
  await verifyPlanUse(engine, approved.task.id, root);
  status = await engine.status();
  const plan = status.artifacts.plan;
  const report = status.artifacts.review_report;
  const qualityPath = path.join(root, 'quality-report.json');
  const qualityData = JSON.parse(await fs.readFile(qualityPath, 'utf8'));
  qualityData.automated.checks = ['evidence_status', 'method_alignment', 'citation_reference'].map(id => ({ id, label: id, passed: true, evidence: 'synthetic checked fixture', source: 'automated' }));
  await fs.writeFile(qualityPath, JSON.stringify(qualityData));
  const quality = await engine.artifact({ path: 'quality-report.json' });
  await fs.writeFile(path.join(root, 'plan-v2.docx'), Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')]));
  const document = await engine.artifact({ path: 'plan-v2.docx' });
  await fs.writeFile(path.join(root, 'document-manifest.json'), JSON.stringify({
    schema_version: 1, project_id: 'synthetic', profile: 'generic', markdown: { path: plan.path, sha256: plan.sha256 },
    docx: { path: document.path, sha256: document.sha256 },
    quality_report: { path: quality.path, sha256: quality.sha256 },
    generated_at: new Date().toISOString(), visual_verification: 'not_completed'
  }));
  const manifest = await engine.artifact({ path: 'document-manifest.json' });
  const checked_at = new Date().toISOString();
  const decision = {
    plan, report, quality_report: quality, document_manifest: manifest, document_kind: 'docx',
    finalized_by: 'researcher', limitations: '후속 연구에서 다른 학교 맥락을 검토해야 함',
    research_checks: ['evidence_reviewed', 'method_reviewed', 'citations_reviewed'].map(name => ({
      name, result: 'passed', method: 'synthetic fixture comparison', evidence: `${name} checked`, checked_at
    })),
    document_checks: ['opened_in_application', 'layout_reviewed', 'content_compared'].map(name => ({
      name, result: 'passed', method: 'synthetic fixture inspection', evidence: `${name} checked`, checked_at
    }))
  };
  await assert.rejects(engine.finalize(decision), /confirmation/);
  await assert.rejects(engine.finalize({ ...decision, human_confirmed: true, research_checks: [] }), /Researcher must record/);
  await assert.rejects(engine.finalize({ ...decision, human_confirmed: true, document_checks: [] }), /Open the exported document/);
  const final = await engine.finalize({ ...decision, human_confirmed: true });
  assert.equal(final.plan.sha256, plan.sha256);
  assert.equal((await engine.status()).current_stage, 'finalized');
  await fs.writeFile(path.join(root, 'plan-v2.md'), 'changed after finalization');
  assert.equal((await engine.status()).current_stage, 'finalization_stale');
  await assert.rejects(engine.reopen({ human_confirmed: true }), /reason/);
  const reopened = await engine.reopen({ human_confirmed: true, reason: 'New evidence' });
  assert.equal(reopened.current_stage, 'plan');
  assert.equal((await engine.status()).finalization, null);
});

async function writeQualityReport(engine, plan, automated) {
  const status = await engine.status();
  await fs.writeFile(path.join(engine.root, 'quality-report.json'), JSON.stringify({
    schema_version: 1, project_id: 'synthetic', profile: status.profile, plan: { path: plan.path, sha256: plan.sha256 },
    automated: { checks: [], limitations: [], ...automated },
    ai_assessment: null, human_assessment: null, generated_at: new Date().toISOString()
  }));
}

test('JQI collection gate reads scores from the hash-bound quality report, not the approver', async t => {
  const { engine, state } = await fixture(t, 'jqi');
  const status = await draftPlan(engine, state, { supportArtifacts: true });
  await writeQualityReport(engine, status.artifacts.plan, { score: 9.0, hard_checks_passed: true });
  await assert.rejects(engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: { score: 10, rubric_total: 8, hard_checks_passed: true }
  }), /greater than 9/);
  await writeQualityReport(engine, { path: 'plan.md', sha256: 'f'.repeat(64) }, { score: 10, hard_checks_passed: true });
  await assert.rejects(engine.approve('collection', {
    workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan, quality: { rubric_total: 8 }
  }), /another plan hash/);
  await writeQualityReport(engine, status.artifacts.plan, { score: 10, hard_checks_passed: true });
  await assert.rejects(engine.approve('collection', {
    workflow_id: state.workflow_id, human_confirmed: true, plan: status.artifacts.plan, quality: { rubric_total: 7 }
  }), /Rubric total/);
  const result = await engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: { rubric_total: 8 }
  });
  assert.equal(result.task.stage, 'literature');
  assert.equal(result.approval.quality.score, 10);
  assert.equal(result.approval.quality.report.path, 'quality-report.json');
});

test('APA 7 profile requires support artifacts and completed hard checks', async t => {
  const { engine, state } = await fixture(t, 'apa7');
  const status = await draftPlan(engine, state, { supportArtifacts: true });
  await writeQualityReport(engine, status.artifacts.plan, { score: 8, hard_checks_passed: false });
  await assert.rejects(engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan,
    quality: { hard_checks_passed: true }
  }), /Hard checks/);
  await writeQualityReport(engine, status.artifacts.plan, { score: 10, hard_checks_passed: true });
  const result = await engine.approve('collection', {
    workflow_id: state.workflow_id,
    human_confirmed: true,
    plan: status.artifacts.plan
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
