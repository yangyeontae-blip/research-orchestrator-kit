import * as fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Bytes } from './utils.mjs';

const allowedTextExtensions = new Set(['.md', '.txt', '.json', '.csv', '.tsv']);
const forbiddenCloudExtensions = new Set(['.pdf', '.doc', '.docx', '.hwp', '.hwpx']);

// One table drives both detection and redaction so the two cannot drift apart.
const SENSITIVE_PATTERNS = [
  { type: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, mask: '[이메일 가림]' },
  { type: 'korean_phone', pattern: /(?<!\d)01[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)/g, mask: '[전화번호 가림]' },
  // Hyphenated landlines only (02-123-4567, 031-123-4567); unhyphenated digit runs are too ambiguous.
  { type: 'korean_landline', pattern: /(?<!\d)0(?:2|[3-6][1-5])-\d{3,4}-\d{4}(?!\d)/g, mask: '[전화번호 가림]' },
  { type: 'resident_number_like', pattern: /(?<!\d)\d{6}[ -]?[1-4]\d{6}(?!\d)/g, mask: '[식별번호 가림]' },
  { type: 'card_number_like', pattern: /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}(?!\d)/g, mask: '[카드번호 가림]' },
  { type: 'local_user_path', pattern: /(?:[A-Z]:[\\/]Users[\\/]|\/(?:Users|home)\/)[^\s/\\]+/gi, mask: '[경로 가림]' },
  { type: 'api_key_like', pattern: /(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}/g, mask: '[키 가림]', severity: 'high' },
  {
    type: 'api_key_like',
    pattern:
      /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}\b|\bgh[ousr]_[A-Za-z0-9]{30,}/g,
    mask: '[키 가림]',
    severity: 'high'
  },
  {
    type: 'private_key_block',
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
    mask: '[키 가림]',
    severity: 'high'
  }
];

export function detectSensitiveText(text) {
  const findings = [];
  for (const { type, pattern, severity } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && !findings.some((item) => item.type === type))
      findings.push({ type, severity: severity || 'review' });
    pattern.lastIndex = 0;
  }
  return findings;
}

// Published papers routinely print author e-mail addresses; mask identifiers instead of refusing public literature.
export function redactSensitiveText(text) {
  let count = 0;
  let result = text;
  for (const { pattern, mask } of SENSITIVE_PATTERNS)
    result = result.replace(pattern, () => {
      count += 1;
      return mask;
    });
  return { text: result, redactions: count };
}
export async function prepareCloudFiles(root, bindings, options = {}) {
  const files = [];
  const findings = [];
  const maxBytes = options.maxBytes || 1024 * 1024;
  for (const binding of bindings || []) {
    const target = path.resolve(root, binding.path);
    const extension = path.extname(target).toLowerCase();
    if (forbiddenCloudExtensions.has(extension))
      throw new Error(`Cloud transmission blocked for source-document type: ${extension}`);
    if (!allowedTextExtensions.has(extension))
      throw new Error(`Cloud transmission blocked for unsupported file type: ${extension || '(none)'}`);
    const bytes = await fs.readFile(target);
    if (bytes.length > maxBytes)
      throw new Error(`Cloud transmission blocked: ${binding.path} exceeds ${maxBytes} bytes`);
    const text = bytes.toString('utf8');
    const localFindings = detectSensitiveText(text).map((item) => ({ ...item, path: binding.path }));
    findings.push(...localFindings);
    files.push({ path: binding.path, bytes: bytes.length, sha256: sha256Bytes(bytes), text });
  }
  return { files, findings, total_bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}
