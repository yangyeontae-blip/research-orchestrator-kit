import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolkitFixture, sourceRoot } from './helpers.mjs';
import { createResearchProject } from '../src/wizard.mjs';

test('run scope approval cannot be recorded from a non-interactive shell', async (t) => {
  const root = await toolkitFixture(t);
  await createResearchProject(root, {
    title: 'Synthetic scope',
    idea: 'Synthetic research only',
    profile: 'generic',
    entry_mode: 'direct_plan',
    method: 'synthetic',
    deadline: null,
    institution_guidance: 'Synthetic',
    sensitive_information: false
  });
  const run = spawnSync(process.execPath, [path.join(sourceRoot, 'src', 'cli.mjs'), 'authorize', '--root', root], {
    cwd: root,
    encoding: 'utf8',
    input: 'claude_cli\n\nRUN\n'
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /interactive terminal/);
  await assert.rejects(fs.access(path.join(root, '.research-work', 'run-scope.json')));
});

test('blueprint rendering cannot be approved from a non-interactive shell', async (t) => {
  const root = await toolkitFixture(t);
  await fs.writeFile(path.join(root, 'blueprint.json'), '{}');
  const run = spawnSync(
    process.execPath,
    [path.join(sourceRoot, 'src', 'cli.mjs'), 'render', 'blueprint.json', '--root', root],
    { cwd: root, encoding: 'utf8', input: 'RENDER\n' }
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /interactive terminal/);
});
