import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const forbiddenExtensions = new Set(['.pdf', '.hwp', '.hwpx', '.doc', '.docx']);
const maximumPublicFileBytes = 1024 * 1024;

function git(root, args, { binary = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: binary ? null : 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) {
    const detail = binary ? result.stderr?.toString('utf8') : result.stderr;
    throw new Error(`git ${args.join(' ')} failed: ${(detail || '').trim()}`);
  }
  return result.stdout;
}

const normalize = value => value.split(path.sep).join('/');
const unique = values => [...new Set(values)];

export function scanText(text, label, options = {}) {
  const allowedEmails = new Set((options.allowedEmails || []).map(value => value.toLowerCase()));
  const allowedIdentifiers = new Set((options.allowedIdentifiers || []).map(value => value.toLowerCase()));
  const findings = [];
  const checks = [
    ['Windows user-home path', new RegExp('(?:[A-Z]:' + '\\\\' + 'Users' + '\\\\' + '|[A-Z]:/Users/)', 'i')],
    ['POSIX user-home path', new RegExp('(?:/' + 'Users/|/' + 'home/)[^/\\s]+/', 'i')],
    ['Codex thread identifier', new RegExp('\\b01[0-9a-z]{6}-[0-9a-z-]{20,}\\b', 'i')],
    ['UUID-like identifier', new RegExp('\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b', 'i')],
    ['Korean mobile number', new RegExp('(?<!\\d)01[016789][ -]?\\d{3,4}[ -]?\\d{4}(?!\\d)')],
    ['GitHub personal access token', new RegExp('(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}')],
    ['AWS access key', new RegExp('AKIA[0-9A-Z]{16}')],
    ['Private key', new RegExp('-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}')],
    ['Assigned secret', /(?:api[_-]?key|secret|token|password|authorization)\s*[=:]\s*["'][^"']{8,}["']/i]
  ];
  for (const [kind, pattern] of checks) {
    if (kind === 'UUID-like identifier') {
      const matches = text.match(new RegExp(pattern.source, 'ig')) || [];
      if (matches.some(value => !allowedIdentifiers.has(value.toLowerCase()))) findings.push(`${label}: ${kind}`);
    } else if (pattern.test(text)) {
      findings.push(`${label}: ${kind}`);
    }
  }
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  for (const email of text.match(emailPattern) || []) {
    if (!allowedEmails.has(email.toLowerCase())) findings.push(`${label}: email address (${email})`);
  }
  return unique(findings);
}

export function validateCommitIdentities(commits, policy) {
  const allowed = new Set((policy.allowed_commit_identities || []).map(item => `${item.name}\u0000${item.email}`));
  return commits
    .filter(item => !allowed.has(`${item.name}\u0000${item.email}`))
    .map(item => `${item.hash}: ${item.role || 'commit'} identity is not allowlisted (${item.name} <${item.email}>)`);
}

function inspectBytes(bytes, label, options, filePolicy = null) {
  const limit = filePolicy?.max_bytes || maximumPublicFileBytes;
  if (bytes.length > limit) return [`${label}: file exceeds allowed ${limit} bytes`];
  if (filePolicy?.sha256) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== filePolicy.sha256) return [`${label}: allowed binary SHA-256 mismatch`];
  }
  if (bytes.includes(0)) return [];
  return scanText(bytes.toString('utf8'), label, options);
}

async function loadPolicy(root) {
  return JSON.parse(await fs.readFile(path.join(root, 'release-policy.json'), 'utf8'));
}

async function auditPublishableTree(root, options) {
  const output = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const files = output.split('\u0000').filter(Boolean);
  const findings = [];
  for (const relative of files) {
    const normalized = normalize(relative);
    const filePolicy = options.allowedBinaries?.get(normalized) || null;
    const extension = path.extname(relative).toLowerCase();
    if (forbiddenExtensions.has(extension)) findings.push(`${normalized}: forbidden source-document extension`);
    const target = path.join(root, relative);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isFile()) continue;
    findings.push(...inspectBytes(await fs.readFile(target), normalized, options, filePolicy));
  }
  return { files: files.length, findings };
}

function auditHistory(root, policy, options) {
  const objects = git(root, ['rev-list', '--objects', '--all']).split(/\r?\n/).filter(Boolean);
  const findings = [];
  const visited = new Set();
  let blobs = 0;
  for (const row of objects) {
    const separator = row.indexOf(' ');
    if (separator < 0) continue;
    const oid = row.slice(0, separator);
    const name = row.slice(separator + 1);
    if (forbiddenExtensions.has(path.extname(name).toLowerCase())) findings.push(`history:${normalize(name)}: forbidden source-document extension`);
    if (visited.has(oid)) continue;
    visited.add(oid);
    if (git(root, ['cat-file', '-t', oid]).trim() !== 'blob') continue;
    blobs += 1;
    const bytes = git(root, ['cat-file', '-p', oid], { binary: true });
    findings.push(...inspectBytes(bytes, `history:${normalize(name)}@${oid.slice(0, 12)}`, options, options.allowedBinaries?.get(normalize(name)) || null));
  }

  const log = git(root, ['log', '--all', '--format=%H%x09%an%x09%ae%x09%cn%x09%ce']).split(/\r?\n/).filter(Boolean);
  const commits = log.map(row => {
    const [hash, authorName, authorEmail, committerName, committerEmail] = row.split('\t');
    return { hash, authorName, authorEmail, committerName, committerEmail };
  });
  const identities = commits.flatMap(item => [
    { hash: item.hash, role: 'author', name: item.authorName, email: item.authorEmail },
    { hash: item.hash, role: 'committer', name: item.committerName, email: item.committerEmail }
  ]);
  findings.push(...validateCommitIdentities(identities, policy));
  for (const commit of commits) {
    const message = git(root, ['show', '-s', '--format=%B', commit.hash]);
    findings.push(...scanText(message, `history:commit-message@${commit.hash.slice(0, 12)}`, options));
  }
  return { blobs, commits: commits.length, findings };
}

export async function auditRepository(root) {
  const resolved = path.resolve(root);
  const policy = await loadPolicy(resolved);
  const options = {
    allowedEmails: policy.allowed_content_emails || [],
    allowedIdentifiers: policy.allowed_content_identifiers || [],
    allowedBinaries: new Map((policy.allowed_binary_files || []).map(item => [normalize(item.path), item]))
  };
  const tree = await auditPublishableTree(resolved, options);
  const history = auditHistory(resolved, policy, options);
  const problems = unique([...tree.findings, ...history.findings]).sort();
  return {
    ok: problems.length === 0,
    scanned_root: '.',
    checks: {
      publishable_files: tree.files,
      historical_blobs: history.blobs,
      commits: history.commits,
      commit_identity_allowlist: true
    },
    problems
  };
}
