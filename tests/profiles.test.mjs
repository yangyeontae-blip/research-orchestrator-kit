import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('JQI profile identifies its official source and excludes the third-party template', async () => {
  const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles', 'jqi.json'), 'utf8'));
  assert.equal(profile.legal_scope.bundled_template, false);
  assert.equal(profile.legal_scope.affiliated_with_journal, false);
  assert.match(profile.official_source.url, /^https:\/\/www\.kaqi\.or\.kr\//);
  assert.match(profile.official_source.checked_at, /^\d{4}-\d{2}-\d{2}$/);
});

test('APA 7 profile separates official style rules from toolkit proposal structure', async () => {
  const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles', 'apa7.json'), 'utf8'));
  assert.equal(profile.legal_scope.bundled_manual, false);
  assert.equal(profile.legal_scope.bundled_sample_paper, false);
  assert.equal(profile.legal_scope.affiliated_with_apa, false);
  assert.match(profile.scope.proposal_structure, /does not prescribe one universal/i);
  assert.match(profile.scope.precedence, /override/i);
  assert.ok(profile.official_sources.every(source => /^https:\/\/apastyle\.apa\.org\//.test(source.url)));
  assert.ok(profile.toolkit_proposal_requirements.required_sections.length >= 5);
});

test('all profiles use schema version one and declare required workflow artifacts', async () => {
  for (const name of ['generic', 'apa7', 'jqi']) {
    const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles', `${name}.json`), 'utf8'));
    assert.equal(profile.schema_version, 1);
    for (const stage of ['study', 'plan', 'literature', 'review', 'revise', 'video_storyboard', 'video_render']) {
      assert.ok(Array.isArray(profile.required_artifacts[stage]), `${name}:${stage}`);
    }
  }
});
