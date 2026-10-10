import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testFiles = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => path.join(root, 'tests', name));

const checks = [
  ['tests', ['--test', ...testFiles]],
  ['full-history audit', [path.join(root, 'scripts', 'audit-public.mjs')]],
  ['v0.1 synthetic lifecycle', [path.join(root, 'examples', 'synthetic', 'run-demo.mjs')]],
  ['v0.2 synthetic cases', [path.join(root, 'examples', 'synthetic-v2', 'run-demo.mjs')]],
  ['npm package allowlist', [path.join(root, 'scripts', 'check-package.mjs')]]
];

for (const [label, args] of checks) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) {
    process.stderr.write(`Release verification could not start ${label}: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write('\nRelease verification passed: tests, full-history privacy audit, synthetic cases, and npm package allowlist.\n');
