import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, validateCommitIdentities } from '../src/audit.mjs';

test('privacy audit detects local paths, thread ids, and contact details', () => {
  const sample = [
    'C:' + '\\' + 'Users' + '\\' + 'Example' + '\\' + 'Desktop',
    '01' + 'a11e1b-f1cb-7000-b6bd-9ea57f6c698e',
    'person' + '@' + 'example.com',
    '010' + '-1234-' + '5678'
  ].join('\n');
  const findings = scanText(sample, 'sample');
  assert.ok(findings.some(item => item.includes('user-home')));
  assert.ok(findings.some(item => item.includes('thread identifier')));
  assert.ok(findings.some(item => item.includes('email address')));
  assert.ok(findings.some(item => item.includes('mobile number')));
});

test('privacy audit accepts only explicitly allowed public email addresses', () => {
  const allowed = 'project' + '@' + 'users.noreply.github.com';
  assert.deepEqual(scanText(allowed, 'sample', { allowedEmails: [allowed] }), []);
  assert.equal(scanText('private' + '@' + 'example.com', 'sample', { allowedEmails: [allowed] }).length, 1);
});

test('privacy audit accepts an explicitly allowlisted public attachment identifier only', () => {
  const identifier = ['b8319cdc', '7627', '4e11', 'ad3a', '8f9683e45a45'].join('-');
  assert.deepEqual(scanText(identifier, 'sample', { allowedIdentifiers: [identifier] }), []);
  const anotherIdentifier = ['d0c3580a', '7cbc', '4ab1', 'ad04', '42d4e35166bc'].join('-');
  assert.equal(scanText(anotherIdentifier, 'sample', { allowedIdentifiers: [identifier] }).length, 1);
});

test('commit identity audit rejects identities outside the release policy', () => {
  const projectEmail = 'project' + '@' + 'users.noreply.github.com';
  const privateEmail = 'private' + '@' + 'example.com';
  const policy = { allowed_commit_identities: [{ name: 'Project', email: projectEmail }] };
  const accepted = [
    { hash: 'a', role: 'author', name: 'Project', email: projectEmail },
    { hash: 'a', role: 'committer', name: 'Project', email: projectEmail }
  ];
  assert.deepEqual(validateCommitIdentities(accepted, policy), []);
  assert.equal(validateCommitIdentities([{ hash: 'b', role: 'committer', name: 'Personal Name', email: privateEmail }], policy).length, 1);
});

test('privacy audit detects representative secret formats', () => {
  const findings = scanText('to' + 'ken=' + '"' + '1234567890abcdef' + '"\n' + '-----BEGIN ' + 'PRIVATE KEY-----', 'sample');
  assert.ok(findings.some(item => item.includes('Assigned secret')));
  assert.ok(findings.some(item => item.includes('Private key')));
});
