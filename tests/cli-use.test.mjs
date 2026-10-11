import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Engine } from '../src/engine.mjs';
import { toolkitFixture, sourceRoot } from './helpers.mjs';

test('CLI holds the collection gate until a separate reviewer verifies the plan', async t => {
  const root = await toolkitFixture(t);
  const project = path.join(root, 'workspace', 'cli');
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'input.md'), 'Synthetic idea');
  await fs.writeFile(path.join(project, 'plan.md'), '# Synthetic plan');
  const engine = new Engine(root);
  const state = await engine.init({ profile: 'generic', project_dir: 'workspace/cli' });
  const task = await engine.enqueue({ request_id: 'cli-plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'workspace/cli/input.md' }] });
  const claim = await engine.claim(task.id, 'research-agent');
  await engine.complete({ task_id: task.id, token: claim.token, status: 'completed', artifacts: [{ kind: 'plan', path: 'workspace/cli/plan.md' }] });
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
  const plan = (await engine.status()).tasks.find(item => item.id === task.id).artifacts[0];
  await fs.writeFile(path.join(project, 'quality-report.json'), JSON.stringify({
    schema_version: 1, project_id: 'synthetic', profile: 'generic', plan: { path: plan.path, sha256: plan.sha256 },
    automated: { score: 10, hard_checks_passed: true, checks: [], limitations: [] },
    ai_assessment: null, human_assessment: null, generated_at: new Date().toISOString()
  }));
  const cli = path.join(sourceRoot, 'src', 'cli.mjs');
  const run = file => spawnSync(process.execPath, [cli, 'verify-use', task.id, file, '--root', root], { cwd: root, encoding: 'utf8' });
  await fs.writeFile(path.join(project, 'automatic.json'), JSON.stringify({ task_id: task.id, kind: 'plan', artifact: plan }));
  const automatic = run('workspace/cli/automatic.json');
  assert.equal(automatic.status, 0, automatic.stderr);
  assert.equal(JSON.parse(automatic.stdout).completion_level, 'automated_verified');
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
  const checked_at = new Date().toISOString();
  await fs.writeFile(path.join(project, 'reviewed.json'), JSON.stringify({
    task_id: task.id, kind: 'plan', artifact: plan,
    human_confirmation: { confirmed: true, verified_by: 'independent-reviewer', checked_at },
    human_checks: [
      { name: 'evidence_source_checked', result: 'passed', evidence: 'Synthetic source inspected', method: 'fixture comparison', checked_at },
      { name: 'method_alignment_reviewed', result: 'passed', evidence: 'Synthetic method inspected', method: 'fixture comparison', checked_at }
    ]
  }));
  const reviewed = run('workspace/cli/reviewed.json');
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.equal(JSON.parse(reviewed.stdout).completion_level, 'use_verified');
  assert.equal((await engine.status()).current_stage, 'collection_approval');
});
