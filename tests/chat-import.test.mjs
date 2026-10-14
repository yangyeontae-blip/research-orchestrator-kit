import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { toolkitFixture } from './helpers.mjs';
import { Engine } from '../src/engine.mjs';

test('chat import preserves the plan hash and still requires use verification and collection approval', async (t) => {
  const root = await toolkitFixture(t);
  const folder = path.join(root, 'workspace', 'sample');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'proposal-draft.md');
  const contents = '# Synthetic proposal\n';
  await fs.writeFile(file, contents);
  const sha = createHash('sha256').update(contents).digest('hex');
  const engine = new Engine(root);
  await engine.init({ profile: 'generic' });
  await assert.rejects(engine.importChatPlan('workspace/sample/proposal-draft.md', '0'.repeat(64)), /hash mismatch/i);
  const imported = await engine.importChatPlan('workspace/sample/proposal-draft.md', sha);
  assert.equal(imported.plan.sha256, sha);
  assert.ok(imported.metadata_to_confirm.includes('deadline'));
  const brief = JSON.parse(await fs.readFile(path.join(folder, 'research-brief.json'), 'utf8'));
  assert.equal(brief.deadline, null);
  assert.equal(brief.sensitive_information, true);
  assert.equal((await engine.status()).project_dir, 'workspace/sample');
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
  await assert.rejects(
    engine.approve('collection', { plan: imported.plan, human_confirmed: true }),
    /not waiting for collection approval/
  );

  await fs.writeFile(
    path.join(folder, 'quality-report.json'),
    JSON.stringify({
      schema_version: 1,
      project_id: 'synthetic',
      profile: 'generic',
      plan: { path: imported.plan.path, sha256: imported.plan.sha256 },
      automated: { score: 6.3, checks: [], limitations: [], draft_checks_passed: true, hard_checks_passed: false },
      ai_assessment: null,
      human_assessment: null,
      generated_at: new Date().toISOString()
    })
  );
  const checked_at = new Date().toISOString();
  await engine.verifyUse(imported.task.id, {
    task_id: imported.task.id,
    kind: 'plan',
    artifact: imported.plan,
    human_confirmation: { confirmed: true, verified_by: 'synthetic-reviewer', checked_at },
    human_checks: ['evidence_source_checked', 'method_alignment_reviewed'].map((name) => ({
      name,
      result: 'passed',
      method: 'synthetic fixture',
      evidence: 'fixture checked',
      checked_at
    }))
  });
  assert.equal((await engine.status()).current_stage, 'collection_approval');
  await fs.writeFile(file, contents + 'changed');
  await assert.rejects(engine.approve('collection', { plan: imported.plan, human_confirmed: true }), /hash mismatch/i);
});

test('chat import rejects paths outside the chat draft location and occupied workflows', async (t) => {
  const root = await toolkitFixture(t);
  const engine = new Engine(root);
  await engine.init({ profile: 'generic' });
  await assert.rejects(engine.importChatPlan('other.md', '0'.repeat(64)), /Chat plan must be/);
  await assert.rejects(engine.importChatPlan('workspace/sample/proposal-draft.md', 'bad'), /expected SHA-256/);
});
