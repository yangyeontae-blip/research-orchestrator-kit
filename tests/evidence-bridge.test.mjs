import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { toolkitFixture } from './helpers.mjs';
import { Engine } from '../src/engine.mjs';
import { planSentences, resolveEvidence, correctPages, anchorInPlan, installDesign } from '../src/evidence-bridge.mjs';
import { citationPairs } from '../src/quality.mjs';
import { parseJsonLoose } from '../src/execution.mjs';
import { verifyEvidence } from '../src/evidence.mjs';

const sha = char => char.repeat(64);

test('reviewers cite plan sentences and sources by id; ROK fills in exact text and bindings', () => {
  const sentences = planSentences('# Plan\n\n## Background\n- Structured feedback changes how graduate writers revise drafts.\n| a | b |');
  assert.deepEqual(sentences.map(s => s.id), ['P1']);
  const byId = new Map([['S1', { document: { path: 'a.pdf', sha256: sha('a') }, parsed: { path: 'pages.json', sha256: sha('b') } }]]);
  const { ledger, problems } = resolveEvidence({ claims: [{ id: 'C1', plan_sentence: 'P1', locations: [{ source_id: 'S1', pdf_page: 2, quote: 'q', relation: 'support' }, { source_id: 'S9', pdf_page: 1, quote: 'x', relation: 'support' }] }] }, byId, sha('c'), sentences);
  assert.equal(ledger.plan_sha256, sha('c'));
  assert.equal(ledger.claims[0].claim, sentences[0].text);
  assert.equal(ledger.claims[0].locations.length, 1);
  assert.equal(ledger.claims[0].locations[0].document.sha256, sha('a'));
  assert.match(problems[0], /unknown source S9/);
});

test('a page label is corrected only when the exact quote is on exactly one other page', async t => {
  const root = await toolkitFixture(t);
  await fs.writeFile(path.join(root, 'pages.json'), JSON.stringify({ pages: [
    { pdf_page: 1, text: 'Peer feedback improved revision quality in the sample.' },
    { pdf_page: 2, text: 'Unrelated text.' },
    { pdf_page: 3, text: 'Repeated sentence here. ' }, { pdf_page: 4, text: 'Repeated sentence here.' }
  ] }));
  const location = quote => ({ parsed: { path: 'pages.json' }, pdf_page: 2, quote });
  const ledger = { claims: [{ id: 'C1', locations: [location('peer feedback improved revision quality'), location('Repeated sentence here.'), location('invented sentence')] }] };
  const corrections = await correctPages(root, ledger);
  assert.deepEqual(corrections, [{ claim: 'C1', from: 2, to: 1 }]);
  assert.deepEqual(ledger.claims[0].locations.map(item => item.pdf_page), [1, 2, 2]);
});

test('quote matching tolerates PDF line breaks and hyphenation, but not altered words', async t => {
  const root = await toolkitFixture(t);
  const engine = new Engine(root);
  await fs.writeFile(path.join(root, 'plan.md'), 'Feedback changes revisions.');
  await fs.writeFile(path.join(root, 'doc.pdf'), 'pdf');
  const document = await engine.artifact('doc.pdf');
  await fs.writeFile(path.join(root, 'pages.json'), JSON.stringify({ sha256: document.sha256, pages: [{ pdf_page: 1, printed_page: null, text: 'Students re-\nvised their drafts after\n  structured feedback.' }] }));
  const plan = await engine.artifact('plan.md');
  const parsed = await engine.artifact('pages.json');
  const check = quote => verifyEvidence(root, plan, { plan_sha256: plan.sha256, claims: [{ id: 'C1', claim: 'Feedback changes revisions.', locations: [{ document, parsed, pdf_page: 1, quote, relation: 'support' }] }] });
  assert.equal((await check('Students revised their drafts after structured feedback.')).findings[0].location_check, 'passed');
  assert.equal((await check('Students rewrote their drafts after structured feedback.')).findings[0].location_check, 'failed');
});

test('design phrases are pinned to plan text, or to the first sentence of the matching section', async t => {
  const root = await toolkitFixture(t);
  await fs.mkdir(path.join(root, 'workspace/p'), { recursive: true });
  await fs.writeFile(path.join(root, 'workspace/p/research-brief.json'), JSON.stringify({ project_id: 'p' }));
  const text = '# Plan\n\n## Research Questions\n- How do writers use structured peer feedback?\n\n## Data\n- Synthetic drafts with three peer reviews each.\n\n## Analysis\n- Thematic coding of feedback and revision pairs.\n';
  await fs.writeFile(path.join(root, 'workspace/p/plan.md'), text);
  const plan = await new Engine(root).artifact('workspace/p/plan.md');
  assert.equal(anchorInPlan('writers use structured peer feedback how', text).anchored, true);
  await installDesign(root, 'workspace/p', plan, JSON.stringify({ links: [{ question: 'How do writers use structured peer feedback?', data_source: 'drafts with three peer reviews', analysis: 'an entirely different summary of procedures', rationale: 'r' }] }));
  const design = JSON.parse(await fs.readFile(path.join(root, 'workspace/p/research-design.json'), 'utf8'));
  assert.equal(design.plan_sha256, plan.sha256);
  for (const field of ['question', 'data_source', 'analysis']) assert.ok(text.includes(design.links[0][field]), field);
  assert.match(design.links[0].rationale, /연구자가 확인/);
});

test('citation pairs recognize narrative, two-author, and grouped citations', () => {
  const pairs = citationPairs('Jiao & Wang (2026) found X. Nair et al. (2024) disagree (Kim, 2021; Lee et al., 2020). 김철수(2019) 참조.\n\n## References\nJiao, Y. (2026). A.\nNair, I. (2024). B.\nKim, A. (2021). C.\nLee, B. (2020). D.\n김철수 (2019). E.');
  assert.deepEqual(pairs.missingReferences, []);
  assert.deepEqual(pairs.uncitedReferences, []);
  assert.equal(pairs.citations.length, 5);
});

test('model files wrapped in Markdown still parse as JSON, and pure Markdown is named as the wrong format', () => {
  assert.equal(parseJsonLoose('# Evidence\n```json\n{"claims":[1]}\n```').claims.length, 1);
  assert.throws(() => parseJsonLoose('# only prose', 'evidence_companion'), /evidence_companion must be JSON/);
});

test('nested design tables are found, a missing one is rebuilt from plan sections, and spaced reference headings count', async t => {
  const root = await toolkitFixture(t);
  await fs.mkdir(path.join(root, 'workspace/p'), { recursive: true });
  await fs.writeFile(path.join(root, 'workspace/p/research-brief.json'), JSON.stringify({ project_id: 'p' }));
  const text = '# 계획\n\n## 연구 질문\n- 동료 피드백은 수정 결정을 어떻게 바꾸는가?\n\n## 자료 원천\n- 합성 초안과 피드백 세트를 사용한다.\n\n## 분석 방법\n- 피드백과 수정 쌍을 주제별로 코딩한다.\n\n## 참고 문헌\nKim, A. (2021). T.\n';
  await fs.writeFile(path.join(root, 'workspace/p/plan.md'), text);
  const plan = await new Engine(root).artifact('workspace/p/plan.md');
  assert.equal(await installDesign(root, 'workspace/p', plan, JSON.stringify({ hash: 'x', design_format: { links: [{ question: '동료 피드백은 수정 결정을 어떻게 바꾸는가?', data_source: '합성 초안', analysis: '코딩', rationale: 'r' }] } })), 1);
  assert.equal(await installDesign(root, 'workspace/p', plan, JSON.stringify({ unrelated: true })), 1);
  const design = JSON.parse(await fs.readFile(path.join(root, 'workspace/p/research-design.json'), 'utf8'));
  for (const field of ['question', 'data_source', 'analysis']) assert.ok(text.includes(design.links[0][field]), field);
  assert.deepEqual(citationPairs('본문 (Kim, 2021).\n\n## 참고 문헌\nKim, A. (2021). T.\n').missingReferences, []);
});

test('a reference heading with a trailing note still separates the reference list', () => {
  const pairs = citationPairs('Hattie & Timperley (2007) frame feedback.\n\n## 참고 문헌(계획에 사용된 근거)\n\nHattie, J., & Timperley, H. (2007). The power of feedback.\n');
  assert.deepEqual(pairs.references, ['hattie|2007']);
  assert.deepEqual(pairs.missingReferences, []);
});
