import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createResearchProject } from '../src/wizard.mjs';
import { exportPlanHwpx } from '../src/export.mjs';
import { ingestLiteratureKoreanOffice, markdownToHwpx, parseKoreanOfficeFile } from '../src/kordoc.mjs';
import { toolkitFixture } from './helpers.mjs';

async function createProject(t) {
  const root = await toolkitFixture(t);
  const created = await createResearchProject(root, {
    title: '한글 문서 합성 사례', idea: '가상 문서의 연구 활용을 점검한다.', profile: 'jqi',
    entry_mode: 'direct_plan', method: '질적 연구', deadline: null, institution_guidance: '', sensitive_information: false
  });
  const plan = path.join(created.project_dir, 'plan.md');
  await fs.writeFile(path.join(root, plan), '# 한글 연구계획서\n\n## 연구문제\n합성 문서는 어떻게 읽는가?\n');
  return { root, project: created.project_dir, plan };
}

test('Kordoc HWPX parsing records local provenance without inventing printed pages', async t => {
  const { root, project } = await createProject(t);
  const source = path.join(root, 'owned.hwpx');
  await fs.writeFile(source, await markdownToHwpx('# 합성 문헌\n\n한글 원문 확인용 문장입니다.'));
  const result = await ingestLiteratureKoreanOffice(root, project, source);
  assert.equal(result.format, 'hwpx');
  assert.equal(result.verification, 'hwpx_ingested');
  const manifest = JSON.parse(await fs.readFile(path.join(root, project, 'literature-manifest.json'), 'utf8'));
  const item = manifest.items.find(entry => entry.id === result.item_id);
  assert.equal(item.document.page_label_status, 'not_available');
  assert.match(await fs.readFile(path.join(root, item.document.parsed_path), 'utf8'), /한글 원문/);
});

test('HWP routes through the same parser contract and rejects unsupported extensions', async t => {
  const root = await toolkitFixture(t);
  const source = path.join(root, 'sample.hwp');
  await fs.writeFile(source, 'synthetic binary placeholder');
  const parsed = await parseKoreanOfficeFile(source, path.join(root, 'parsed'), {
    parseImpl: async () => ({ success: true, markdown: '# 모의 HWP\n\n본문', metadata: { title: '모의 HWP' } })
  });
  assert.equal(parsed.format, 'hwp');
  await assert.rejects(parseKoreanOfficeFile(path.join(root, 'bad.docx'), path.join(root, 'parsed')), /Supported Korean office/);
});

test('HWPX export binds the canonical Markdown hash and round-trip parses the file', async t => {
  const { root, project, plan } = await createProject(t);
  const result = await exportPlanHwpx(root, project, plan);
  const bytes = await fs.readFile(path.join(root, result.hwpx_path));
  assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
  assert.equal(result.manifest.hwpx.generator, 'kordoc@4.21.11');
  assert.equal(result.manifest.hwpx.roundtrip_status, 'parsed');
  assert.equal(result.manifest.markdown.sha256.length, 64);
});
