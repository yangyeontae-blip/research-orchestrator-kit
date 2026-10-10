import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createResearchProject } from '../src/wizard.mjs';
import { searchLiterature, deduplicateLiterature } from '../src/literature.mjs';
import { Engine } from '../src/engine.mjs';
import { toolkitFixture } from './helpers.mjs';

test('new wizard creates a brief, ledgers, and first direct-plan task', async t => {
  const root = await toolkitFixture(t);
  const result = await createResearchProject(root, {
    title: '합성 질적 연구', idea: '교사의 가상 성찰 기록을 분석한다.', profile: 'apa7',
    entry_mode: 'direct_plan', method: '질적 자문화기술지', deadline: '2030-10-31',
    institution_guidance: '합성 제출 지침', sensitive_information: false, apa_paper_type: 'student'
  });
  assert.equal(result.brief.profile, 'apa7');
  assert.equal(result.first_task.stage, 'plan');
  const status = await new Engine(root).status();
  assert.equal(status.project_dir, 'workspace/합성-질적-연구');
  assert.equal(status.tasks[0].status, 'queued');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, status.project_dir, 'claim-ledger.json'), 'utf8')).claims.length, 0);
});

test('metadata search retries rate limits and deduplicates Crossref/OpenAlex records', async t => {
  const root = await toolkitFixture(t);
  await createResearchProject(root, {
    title: '검색 테스트', idea: '합성 아이디어', profile: 'generic', entry_mode: 'direct_plan',
    method: '질적 면담', deadline: null, institution_guidance: '', sensitive_information: false
  });
  let crossrefCalls = 0;
  const fetchImpl = async url => {
    if (String(url).includes('crossref')) {
      crossrefCalls += 1;
      if (crossrefCalls === 1) return { ok: false, status: 429, statusText: 'rate limit', headers: { get: () => '0' } };
      return { ok: true, json: async () => ({ message: { items: [{ DOI: '10.1000/SYNTHETIC', title: ['Shared title'], author: [{ given: 'Alex', family: 'Kim' }], published: { 'date-parts': [[2029]] }, URL: 'https://doi.org/10.1000/synthetic' }] } }) };
    }
    return { ok: true, json: async () => ({ results: [{ doi: 'https://doi.org/10.1000/synthetic', display_name: 'Shared title', publication_year: 2029, authorships: [{ author: { display_name: 'Alex Kim' } }], id: 'https://openalex.org/W1' }] }) };
  };
  const result = await searchLiterature(root, 'workspace/검색-테스트', 'shared title', { fetchImpl, sleep: async () => {} });
  assert.equal(crossrefCalls, 2);
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0].sources.sort(), ['crossref', 'openalex']);
});

test('deduplication uses title, year, and first author when DOI is absent', () => {
  const common = { title: 'A Study!', normalized_title: 'a study', authors: ['A Kim'], year: 2028, venue: null, url: null, doi: null };
  const result = deduplicateLiterature([{ ...common, sources: ['crossref'] }, { ...common, title: 'A Study', sources: ['openalex'] }]);
  assert.equal(result.length, 1);
});

