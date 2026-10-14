// Worker response schema and native Codex/Claude CLI discovery, kept apart from the run loop in execution.mjs.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execute } from './process.mjs';

const schema = {
  type: 'object',
  properties: {
    handoff_state: { enum: ['ready', 'hold', 'none'] },
    status: { enum: ['completed', 'partial', 'failed'] },
    reason: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, kind: { type: 'string' }, content: { type: 'string' } },
        required: ['name', 'kind', 'content'],
        additionalProperties: false
      }
    }
  },
  required: ['status', 'reason', 'files', 'handoff_state'],
  additionalProperties: false
};
const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false
  );
// Workers must label files with the exact artifact kinds the stage needs; free-form kinds made real runs fail late.
export function responseSchema(kinds) {
  const unique = [...new Set(kinds)];
  return {
    ...schema,
    properties: {
      ...schema.properties,
      files: {
        ...schema.properties.files,
        items: {
          ...schema.properties.files.items,
          properties: { ...schema.properties.files.items.properties, kind: { enum: [...unique, 'supporting_note'] } }
        }
      }
    }
  };
}
// npm global installs on Windows are .cmd shims; spawning them needs a shell, so resolve the real target instead.
export async function resolveShim(shim) {
  const text = await fs.readFile(shim, 'utf8').catch(() => '');
  for (const [, target] of text.matchAll(/"%dp0%\\([^"%]+\.(?:exe|js|cjs|mjs))"/gi)) {
    const file = path.join(path.dirname(shim), ...target.split(/[\\/]+/));
    if (!(await exists(file))) continue;
    return /\.exe$/i.test(file) ? { file, prefix: [] } : { file: process.execPath, prefix: [file] };
  }
  return null;
}
export async function nativeCommand(provider, { env = process.env, where } = {}) {
  const name = provider === 'codex_cli' ? 'codex' : 'claude';
  const override = env[name === 'codex' ? 'ROK_CODEX_BIN' : 'ROK_CLAUDE_BIN'];
  if (override) {
    if (!(await exists(override))) throw new Error(`Configured ${name} executable not found`);
    return /\.(c|m)?js$/i.test(override)
      ? { file: process.execPath, prefix: [override] }
      : { file: override, prefix: [] };
  }
  if (process.platform !== 'win32' && !where) return { file: name, prefix: [] };
  const paths = (
    where
      ? await where(name)
      : (await execute('where.exe', [name], { timeout: 10000 }).catch(() => '')).trim().split(/\r?\n/)
  ).filter(Boolean);
  const exe = paths.find((p) => p.toLowerCase().endsWith('.exe'));
  if (exe) return { file: exe, prefix: [] };
  for (const shim of paths.filter((p) => /\.cmd$/i.test(p))) {
    const resolved = await resolveShim(shim);
    if (resolved) return resolved;
  }
  if (name === 'claude') {
    for (const shim of paths) {
      const script = path.join(path.dirname(shim), 'node_modules/@anthropic-ai/claude-code/cli.js');
      if (await exists(script)) return { file: process.execPath, prefix: [script] };
    }
  }
  throw new Error(
    `Native CLI executable not found: ${name}. Set ${name === 'codex' ? 'ROK_CODEX_BIN' : 'ROK_CLAUDE_BIN'} to its executable path.`
  );
}
