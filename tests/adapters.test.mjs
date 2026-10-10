import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { codexDispatch } from '../src/adapters/codex.mjs';
import { claudeDispatch } from '../src/adapters/claude.mjs';

const task = {
  id: 'task-example', workflow_id: 'workflow-example', role: 'research', stage: 'plan', cycle: 1,
  inputs: [{ path: 'workspace/input.md', sha256: 'a'.repeat(64) }], plan: null, context: 'Synthetic task'
};

test('Codex adapter returns a target and a self-contained message', () => {
  const result = codexDispatch(task, { target: 'replace-me' });
  assert.equal(result.target, 'replace-me');
  assert.match(result.message, /task-example/);
  assert.match(result.message, /receipt JSON/);
});

test('Claude adapter writes a portable request file inside the project', async t => {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const testBase = path.join(os.tmpdir(), 'research-orchestrator-kit-tests');
  await fs.mkdir(testBase, { recursive: true });
  const root = await fs.mkdtemp(path.join(testBase, 'research-adapter-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await claudeDispatch(root, task, { inbox: '.research-work/claude' });
  const body = JSON.parse(await fs.readFile(path.join(root, result.handoff_file), 'utf8'));
  assert.equal(body.task_id, task.id);
  await assert.rejects(claudeDispatch(root, task, { inbox: '../outside' }), /inside the project root/);
});
