import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { toolkitFixture } from './helpers.mjs';
import { createBlueprint } from '../src/blueprint.mjs';

async function blueprintOf(root, text) {
  await fs.writeFile(path.join(root, 'plan.md'), text);
  const created = await createBlueprint(root, 'plan.md');
  return { created, blueprint: JSON.parse(await fs.readFile(path.join(root, created.blueprint.path), 'utf8')) };
}

test('blueprint recognizes common English plan headings', async t => {
  const root = await toolkitFixture(t);
  const { created } = await blueprintOf(root, [
    '# Plan', '## Background and Rationale', 'Why.', '## Aims', 'Aim.', '## Research Questions', 'RQ.',
    '## Conceptual Framework', 'Frame.', '## Data and Materials', 'Data.', '## Methodology', 'Method.',
    '## Ethical Considerations', 'Consent.', '## Expected Outcomes', 'Outcome.', '## Scope and Boundaries', 'Scope.'
  ].join('\n'));
  assert.deepEqual(created.missing, []);
});

test('blueprint recognizes Korean headings without confusing 연구문제 with 문제의식', async t => {
  const root = await toolkitFixture(t);
  const { created, blueprint } = await blueprintOf(root, [
    '# 계획서', '## 연구문제', '질문.', '## 자료수집', '자료.', '## 분석방법', '분석.', '## 연구윤리', '동의.'
  ].join('\n'));
  assert.ok(created.missing.includes('problem'));
  assert.equal(blueprint.sections.find(s => s.id === 'questions').text, '질문.');
  const withProblem = await blueprintOf(root, ['# 계획서', '## 문제와 목적', '배경.', '## 연구문제', '질문.'].join('\n'));
  assert.ok(!withProblem.created.missing.includes('problem'));
  assert.equal(withProblem.blueprint.sections.find(s => s.id === 'problem').text, '배경.');
});

test('a missing plan section stays unconfirmed instead of being filled in', async t => {
  const root = await toolkitFixture(t);
  const { blueprint } = await blueprintOf(root, '# Plan\n\n## Research Questions\nRQ.\n');
  const ethics = blueprint.sections.find(s => s.id === 'ethics');
  assert.equal(ethics.status, 'unconfirmed');
  assert.equal(ethics.source, null);
});

test('a blueprint section keeps its subsections', async t => {
  const root = await toolkitFixture(t);
  const { blueprint } = await blueprintOf(root, ['# 계획', '## 자료 원천', '### 합성 자료의 구성', '합성 초안 세 편을 사용한다.', '## 분석 방법', '코딩한다.'].join('\n'));
  const data = blueprint.sections.find(s => s.id === 'data');
  assert.match(data.text, /합성 초안 세 편/);
  assert.doesNotMatch(data.text, /코딩한다/);
});
