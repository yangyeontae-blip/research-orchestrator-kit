import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { parsePdfFile, ingestLiteraturePdf } from '../src/pdf.mjs';
import { createResearchProject } from '../src/wizard.mjs';
import { toolkitFixture, makePdf } from './helpers.mjs';

test('PDF parser rejects non-PDF data and tracks PDF page numbers', async t => {
  const root = await toolkitFixture(t);
  const invalid = path.join(root, 'bad.pdf');
  await fs.writeFile(invalid, 'not a pdf');
  await assert.rejects(parsePdfFile(invalid, path.join(root, 'out')), /not a PDF/);
  const valid = path.join(root, 'valid.pdf');
  await fs.writeFile(valid, makePdf('Evidence on page one'));
  const parsed = await parsePdfFile(valid, path.join(root, 'out'));
  assert.equal(parsed.page_count, 1);
  assert.match(parsed.pages[0].text, /Evidence/);
  assert.match(await fs.readFile(parsed.markdown_path, 'utf8'), /PDF 1쪽/);
});

test('textless PDFs are marked needs_ocr and partial page results can be reused', async t => {
  const root = await toolkitFixture(t);
  const scanned = path.join(root, 'scan.pdf');
  await fs.writeFile(scanned, makePdf(null));
  const first = await parsePdfFile(scanned, path.join(root, 'parsed'));
  assert.equal(first.needs_ocr, true);
  const second = await parsePdfFile(scanned, path.join(root, 'parsed'));
  assert.equal(second.sha256, first.sha256);
  assert.equal(second.pages.length, 1);
});

test('PDF ingest detects bibliographic mismatch without claiming original verification', async t => {
  const root = await toolkitFixture(t);
  await createResearchProject(root, {
    title: 'PDF 연구', idea: '합성', profile: 'generic', entry_mode: 'direct_plan', method: '질적',
    deadline: null, institution_guidance: '', sensitive_information: false
  });
  const manifestPath = path.join(root, 'workspace', 'pdf-연구', 'literature-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.items.push({
    id: 'lit-1', doi: null, title: 'Completely Different Bibliography', normalized_title: 'completely different bibliography',
    authors: ['A Researcher'], year: 2027, venue: null, url: null, sources: ['user'], decision: 'selected',
    reason: 'Synthetic test selection.', verification: 'metadata_only'
  });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const pdf = path.join(root, 'owned.pdf');
  await fs.writeFile(pdf, makePdf('Some extractable evidence', { title: 'Unrelated Source' }));
  const result = await ingestLiteraturePdf(root, 'workspace/pdf-연구', pdf, { id: 'lit-1' });
  assert.equal(result.verification, 'metadata_mismatch');
});

