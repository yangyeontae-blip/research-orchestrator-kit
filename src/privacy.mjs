import * as fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Bytes } from './utils.mjs';

const allowedTextExtensions = new Set(['.md', '.txt', '.json', '.csv', '.tsv']);
const forbiddenCloudExtensions = new Set(['.pdf', '.doc', '.docx', '.hwp', '.hwpx']);

export function detectSensitiveText(text) {
  const findings = [];
  const patterns = [
    ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ['korean_phone', /(?<!\d)01[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)/],
    ['resident_number_like', /(?<!\d)\d{6}[ -]?[1-4]\d{6}(?!\d)/],
    ['local_user_path', /(?:[A-Z]:[\\/]Users[\\/]|\/(?:Users|home)\/)[^\s/\\]+/i],
    ['api_key_like', /(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}/]
  ];
  for (const [type, pattern] of patterns) if (pattern.test(text)) findings.push({ type, severity: type === 'api_key_like' ? 'high' : 'review' });
  return findings;
}

export async function prepareCloudFiles(root, bindings, options = {}) {
  const files = [];
  const findings = [];
  const maxBytes = options.maxBytes || 1024 * 1024;
  for (const binding of bindings || []) {
    const target = path.resolve(root, binding.path);
    const extension = path.extname(target).toLowerCase();
    if (forbiddenCloudExtensions.has(extension)) throw new Error(`Cloud transmission blocked for source-document type: ${extension}`);
    if (!allowedTextExtensions.has(extension)) throw new Error(`Cloud transmission blocked for unsupported file type: ${extension || '(none)'}`);
    const bytes = await fs.readFile(target);
    if (bytes.length > maxBytes) throw new Error(`Cloud transmission blocked: ${binding.path} exceeds ${maxBytes} bytes`);
    const text = bytes.toString('utf8');
    const localFindings = detectSensitiveText(text).map(item => ({ ...item, path: binding.path }));
    findings.push(...localFindings);
    files.push({ path: binding.path, bytes: bytes.length, sha256: sha256Bytes(bytes), text });
  }
  return { files, findings, total_bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

