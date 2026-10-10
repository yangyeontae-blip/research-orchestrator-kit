import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const args = isWindows ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json'] : ['pack', '--dry-run', '--json'];
const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || 'npm pack --dry-run failed');
const report = JSON.parse(result.stdout)[0];
const files = report.files.map(item => item.path.replace(/\\/g, '/'));
const required = ['package.json', 'src/cli.mjs', 'profiles/apa7.json', 'profiles/jqi.json', 'schemas/research-brief.schema.json', 'README.md', 'LICENSE'];
const forbidden = [/^tests\//, /^\.github\//, /^workspace\//, /^\.research-work\//, /\.(?:pdf|hwp|hwpx|doc|docx|mp4)$/i, /^config\.local\.json$/];
const missing = required.filter(file => !files.includes(file));
const leaked = files.filter(file => forbidden.some(pattern => pattern.test(file)));
if (missing.length || leaked.length) {
  process.stderr.write(JSON.stringify({ ok: false, missing, leaked }, null, 2) + '\n');
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true, name: report.name, version: report.version, files: files.length, unpacked_size: report.unpackedSize }, null, 2) + '\n');
