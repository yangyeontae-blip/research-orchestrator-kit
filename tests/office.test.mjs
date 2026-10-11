import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readOfficeSnapshot, startOffice } from '../src/office.mjs';

test('pixel office reads only the named research ledger and excludes completed test jobs', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rok-office-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '운영'));
  const file = path.join(root, '운영', '기획팀장 상태.json');
  const ledger = { project_root: root, updated_at: '2026-10-11', tasks: [
    { job_id: 'TEST-1', stage: 'plan', role: 'research', status: 'completed', token: 'demo' },
    { job_id: 'REAL-1', stage: 'study', role: 'study', status: 'completed', token: 'demo' },
    { job_id: 'REAL-1', stage: 'collect', role: 'literature', status: 'running', token: 'demo' }
  ] };
  await fs.writeFile(file, JSON.stringify(ledger));
  const snapshot = await readOfficeSnapshot(root, { legacyRoot: root });
  assert.equal(snapshot.workflow, 'REAL-1');
  assert.equal(snapshot.current_stage, 'literature');
  assert.equal(snapshot.tasks.length, 2);
  assert.equal(snapshot.stages.find(item => item.id === 'literature').status, 'running');
  assert.doesNotMatch(JSON.stringify(snapshot), /"token":"demo"|TEST-1|기획팀장 상태\.json/);

  const { server, url } = await startOffice(root, { legacyRoot: root });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /다른 AI 세션 탐색 없음/);
  const live = await fetch(url + 'status');
  assert.equal(live.status, 200);
  assert.equal((await live.json()).workflow, 'REAL-1');
  const outside = await fetch(new URL('/status', url));
  assert.equal(outside.status, 404);

  ledger.tasks.at(-1).status = 'completed';
  await fs.writeFile(file, JSON.stringify(ledger));
  const idle = await (await fetch(url + 'status')).json();
  assert.equal(idle.workflow, null);
  assert.equal(idle.tasks.length, 0);
});
