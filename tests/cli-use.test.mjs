import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
  // Human checks are refused from a non-interactive shell such as an agent's tool call.
  const reviewed = run('workspace/cli/reviewed.json');
  assert.notEqual(reviewed.status, 0);
  assert.match(reviewed.stderr, /interactive terminal/);
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
  await engine.verifyUse(task.id, JSON.parse(await fs.readFile(path.join(project, 'reviewed.json'), 'utf8')));
  assert.equal((await engine.status()).current_stage, 'collection_approval');

  await fs.writeFile(path.join(project, 'approval.json'), JSON.stringify({ workflow_id: state.workflow_id, human_confirmed: true, approved_by: 'pi', plan }));
  const cliRun = (...rest) => spawnSync(process.execPath, [cli, ...rest, '--root', root], { cwd: root, encoding: 'utf8' });
  const approve = cliRun('approve', 'collection', 'workspace/cli/approval.json');
  assert.notEqual(approve.status, 0);
  assert.match(approve.stderr, /interactive terminal/);
  const rework = cliRun('rework', task.id, '--feedback', 'tighten scope');
  assert.notEqual(rework.status, 0);
  assert.match(rework.stderr, /interactive terminal/);
  const search = cliRun('literature', 'search', '--query', 'synthetic');
  assert.notEqual(search.status, 0);
  assert.match(search.stderr, /approved, open literature task/);
  assert.equal((await engine.status()).current_stage, 'collection_approval');
});

test('CLI next recovers a running handoff with its completion action', async t => {
  const root = await toolkitFixture(t);
  const project = path.join(root, 'workspace', 'resume');
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'input.md'), 'Synthetic study idea');
  const engine = new Engine(root);
  const state = await engine.init({ profile: 'generic', project_dir: 'workspace/resume' });
  const task = await engine.enqueue({ request_id: 'resume-plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'workspace/resume/input.md' }] });
  await engine.claim(task.id, 'research-agent');
  const run = spawnSync(process.execPath, [path.join(sourceRoot, 'src', 'cli.mjs'), 'next', '--root', root], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.action, 'handoff_pending');
  assert.equal(result.next, `rok finish ${task.id}`);
  assert.match(JSON.stringify(result.dispatch), new RegExp(task.id));
  assert.equal((await engine.status()).tasks.find(item => item.id === task.id).status, 'running');
});

test('CLI finish records a real plan through guided prompts', async t => {
  const root = await toolkitFixture(t);
  const project = path.join(root, 'workspace', 'guided');
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'input.md'), 'Synthetic idea');
  await fs.writeFile(path.join(project, 'plan.md'), '# Synthetic plan');
  const engine = new Engine(root);
  const state = await engine.init({ profile: 'generic', project_dir: 'workspace/guided' });
  const task = await engine.enqueue({ request_id: 'guided-plan', workflow_id: state.workflow_id, stage: 'plan', inputs: [{ path: 'workspace/guided/input.md' }] });
  await engine.claim(task.id, 'research-agent');
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(sourceRoot, 'src', 'cli.mjs'), 'finish', task.id, '--root', root], { cwd: root, stdio: 'pipe' });
    let stdout = '', stderr = '', sentStatus = false, sentPlan = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('guided finish timed out')) }, 10000);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (!sentStatus && stdout.includes('상태(completed/partial/failed):')) { sentStatus = true; child.stdin.write('completed\n'); }
      if (!sentPlan && stdout.includes('plan 파일 경로')) { sentPlan = true; child.stdin.write('workspace/guided/plan.md\n'); }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}: ${stderr} ${stdout}`)); });
  });
  assert.match(output, /"status": "completed"/);
  assert.equal((await engine.status()).current_stage, 'plan_use_verification');
});
