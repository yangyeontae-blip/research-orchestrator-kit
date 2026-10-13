import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');

test('AGENTS.md defines one chat path with steps 0-4 and the workspace save location', async () => {
  const agents = await read('AGENTS.md');
  for (const step of ['0단계', '1단계', '2단계', '3단계', '4단계']) {
    assert.equal(agents.split(`### ${step}.`).length - 1, 1, `${step} must appear exactly once`);
  }
  assert.equal(agents.split('## 새 연구 아이디어의 기본 대화 경로').length - 1, 0, 'the duplicate chat-path section must not return');
  assert.ok(agents.includes('workspace/<주제요약>/proposal-draft.md'));
  assert.ok(!agents.includes('proposals/'), 'AGENTS.md must not point at the old proposals/ location');
});

test('the chat path keeps its safety rules: write check, explicit agreement, no invented evidence', async () => {
  const agents = await read('AGENTS.md');
  assert.match(agents, /workspace\/\.write-check/);
  assert.match(agents, /동의 전에는 4단계로 가지 않는다/);
  assert.match(agents, /저장했다고 쓰지 않는다|저장 성공이나 파일 링크를 주장하지 않는다/);
  assert.match(agents, /\[미확인: 문헌 확인 필요\]/);
  assert.match(agents, /부록 1\. 합의 사항/);
});

test('README and README.en describe the same save location and link to files that exist', async () => {
  const readme = await read('README.md');
  const english = await read('README.en.md');
  assert.ok(readme.includes('workspace/<주제요약>/proposal-draft.md'));
  assert.ok(english.includes('workspace/<topic>/proposal-draft.md'));
  assert.ok(!readme.includes('proposals/') && !english.includes('proposals/'));
  for (const target of ['docs/CODEX-TODO.md', 'docs/CHAT-REPRODUCTION-2026-10-13.md', 'docs/CHAT-SELF-EVALUATION.md', '.codex/config.toml']) {
    await fs.access(path.join(root, target));
    assert.ok(readme.includes(target), `README.md should link ${target}`);
  }
});

test('README does not claim a successful file save that has no recorded run', async () => {
  const readme = await read('README.md');
  assert.match(readme, /저장 성공 기록은 아직 없으며/);
});
