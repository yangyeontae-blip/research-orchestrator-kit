import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from './schemas.mjs';
import { inside, isoNow, readJson, sha256Bytes, slash, writeJson, atomicWrite } from './utils.mjs';
import { deduplicateLiterature, normalizeTitle } from './literature.mjs';

// pdfjs-dist 6 uses Promise.withResolvers, which is available in Node 22 but
// not in Node 20. The kit supports Node 20, so install the standards-equivalent
// helper before lazily loading PDF.js. Keeping the import lazy is essential:
// static imports evaluate PDF.js before this compatibility step can run.
function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === 'function') return;
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
  });
}

let pdfjsModule;
async function loadPdfJs() {
  ensurePromiseWithResolvers();
  pdfjsModule ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsModule;
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeTitle(left).split(' ').filter(token => token.length > 2));
  const b = new Set(normalizeTitle(right).split(' ').filter(token => token.length > 2));
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter(token => b.has(token)).length;
  return overlap / Math.min(a.size, b.size);
}

export async function parsePdfFile(pdfPath, outputDir, options = {}) {
  const { getDocument } = await loadPdfJs();
  const bytes = await fs.readFile(pdfPath);
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('File is not a PDF (missing %PDF- signature)');
  const sha256 = sha256Bytes(bytes);
  const targetDir = path.join(outputDir, sha256);
  const jsonPath = path.join(targetDir, 'pages.json');
  const mdPath = path.join(targetDir, 'text.md');
  await fs.mkdir(targetDir, { recursive: true });
  let pages = [];
  if (options.resume !== false) {
    const prior = await fs.readFile(jsonPath, 'utf8').then(JSON.parse, () => null);
    if (prior?.sha256 === sha256 && Array.isArray(prior.pages)) pages = prior.pages;
  }
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false });
  const document = await loadingTask.promise;
  const metadata = await document.getMetadata().catch(() => ({ info: {}, metadata: null }));
  for (let number = pages.length + 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ pdf_page: number, printed_page: null, text });
    await writeJson(jsonPath, { schema_version: 1, sha256, page_count: document.numPages, complete: number === document.numPages, pages });
  }
  await document.cleanup?.();
  await loadingTask.destroy();
  const totalText = pages.reduce((sum, page) => sum + page.text.length, 0);
  const needsOcr = totalText < Math.max(20, pages.length * 20);
  const markdown = [
    `# Parsed PDF: ${path.basename(pdfPath)}`,
    '',
    `- SHA-256: ${sha256}`,
    `- Status: ${needsOcr ? 'needs_ocr' : 'parsed'}`,
    `- Page labels: PDF page numbers only unless a human verifies printed pages.`,
    '',
    ...pages.flatMap(page => [`## PDF ${page.pdf_page}쪽`, '', page.text || '[텍스트 없음]', ''])
  ].join('\n');
  await atomicWrite(mdPath, Buffer.from(markdown, 'utf8'));
  return {
    sha256, page_count: document.numPages, pages, needs_ocr: needsOcr,
    metadata: { title: metadata.info?.Title || null, author: metadata.info?.Author || null },
    json_path: jsonPath, markdown_path: mdPath
  };
}

export async function ingestLiteraturePdf(root, projectDir, pdfPath, options = {}) {
  const project = path.resolve(root, projectDir);
  const manifestPath = path.join(project, 'literature-manifest.json');
  const manifest = await readJson(manifestPath);
  const parsed = await parsePdfFile(path.resolve(pdfPath), path.join(project, 'parsed'), options);
  let item = options.id ? manifest.items.find(entry => entry.id === options.id) : null;
  const inferredTitle = parsed.metadata.title || path.basename(pdfPath, path.extname(pdfPath));
  if (!item) item = manifest.items.find(entry => tokenSimilarity(entry.title, inferredTitle) >= 0.65);
  if (!item) {
    const userItem = deduplicateLiterature([{
      title: inferredTitle, normalized_title: normalizeTitle(inferredTitle), authors: parsed.metadata.author ? [parsed.metadata.author] : [],
      year: null, venue: null, url: null, doi: null, sources: ['user'], decision: 'candidate',
      reason: 'User-owned PDF ingested locally.', verification: 'metadata_only'
    }])[0];
    manifest.items.push(userItem);
    item = userItem;
  }
  const similarity = tokenSimilarity(item.title, inferredTitle);
  item.verification = parsed.needs_ocr ? 'needs_ocr' : (parsed.metadata.title && similarity < 0.35 ? 'metadata_mismatch' : 'pdf_ingested');
  item.pdf = {
    sha256: parsed.sha256,
    file_name: path.basename(pdfPath),
    external: !inside(root, pdfPath),
    page_count: parsed.page_count,
    parsed_path: slash(path.relative(root, parsed.markdown_path)),
    page_label_status: 'pdf_page_only'
  };
  manifest.items = deduplicateLiterature(manifest.items);
  manifest.updated_at = isoNow();
  await new SchemaRegistry(root).assert('literature-manifest', manifest);
  await writeJson(manifestPath, manifest);
  return {
    item_id: item.id, verification: item.verification, needs_ocr: parsed.needs_ocr,
    page_count: parsed.page_count, parsed_path: item.pdf.parsed_path, sha256: parsed.sha256
  };
}
