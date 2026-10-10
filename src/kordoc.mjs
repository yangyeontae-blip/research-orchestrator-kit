import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from './schemas.mjs';
import { inside, isoNow, readJson, sha256Bytes, slash, writeJson, atomicWrite } from './utils.mjs';
import { deduplicateLiterature, normalizeTitle } from './literature.mjs';

export const KORDOC_VERSION = '4.21.11';
export const KORDOC_FORMATS = new Set(['.hwp', '.hwpx']);

let kordocModule;
async function loadKordoc() {
  kordocModule ??= import('kordoc');
  return kordocModule;
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeTitle(left).split(' ').filter(token => token.length > 2));
  const b = new Set(normalizeTitle(right).split(' ').filter(token => token.length > 2));
  if (!a.size || !b.size) return 0;
  return [...a].filter(token => b.has(token)).length / Math.min(a.size, b.size);
}

export async function parseKoreanOfficeFile(filePath, outputDir, options = {}) {
  const absolutePath = path.resolve(filePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!KORDOC_FORMATS.has(extension)) throw new Error('Supported Korean office formats are .hwp and .hwpx');
  const bytes = await fs.readFile(absolutePath);
  const sha256 = sha256Bytes(bytes);
  const targetDir = path.join(outputDir, sha256);
  const metadataPath = path.join(targetDir, 'document.json');
  const markdownPath = path.join(targetDir, 'text.md');
  await fs.mkdir(targetDir, { recursive: true });
  const prior = options.resume === false ? null : await fs.readFile(metadataPath, 'utf8').then(JSON.parse, () => null);
  if (prior?.sha256 === sha256 && prior?.markdown_path && await fs.access(markdownPath).then(() => true, () => false)) {
    return { ...prior, markdown_path: markdownPath, metadata_path: metadataPath };
  }
  const { parse } = await loadKordoc();
  const result = await (options.parseImpl || parse)(absolutePath);
  if (!result?.success || typeof result.markdown !== 'string') {
    throw new Error(`Kordoc could not parse ${path.basename(absolutePath)}: ${result?.error?.message || result?.error || 'unknown parse failure'}`);
  }
  const metadata = {
    schema_version: 1,
    sha256,
    format: extension.slice(1),
    parser: `kordoc@${KORDOC_VERSION}`,
    source_file: path.basename(absolutePath),
    title: result.metadata?.title || null,
    author: result.metadata?.author || result.metadata?.creator || null,
    page_count: Array.isArray(result.pages) ? result.pages.length : null,
    page_label_status: 'not_available',
    markdown_path: 'text.md',
    parsed_at: isoNow()
  };
  const markdown = [
    `# Parsed ${extension.slice(1).toUpperCase()}: ${path.basename(absolutePath)}`,
    '',
    `- SHA-256: ${sha256}`,
    `- Parser: ${metadata.parser}`,
    '- Page labels: unavailable unless a human verifies the source layout; do not cite generated page numbers as printed pages.',
    '',
    result.markdown.trim(),
    ''
  ].join('\n');
  await atomicWrite(markdownPath, Buffer.from(markdown, 'utf8'));
  await writeJson(metadataPath, metadata);
  return { ...metadata, markdown_path: markdownPath, metadata_path: metadataPath };
}

export async function ingestLiteratureKoreanOffice(root, projectDir, documentPath, options = {}) {
  const project = path.resolve(root, projectDir);
  const manifestPath = path.join(project, 'literature-manifest.json');
  const manifest = await readJson(manifestPath);
  const absoluteDocument = path.resolve(documentPath);
  const parsed = await parseKoreanOfficeFile(absoluteDocument, path.join(project, 'parsed'), options);
  let item = options.id ? manifest.items.find(entry => entry.id === options.id) : null;
  const inferredTitle = parsed.title || path.basename(absoluteDocument, path.extname(absoluteDocument));
  if (!item) item = manifest.items.find(entry => tokenSimilarity(entry.title, inferredTitle) >= 0.65);
  if (!item) {
    const userItem = deduplicateLiterature([{
      title: inferredTitle, normalized_title: normalizeTitle(inferredTitle), authors: parsed.author ? [String(parsed.author)] : [],
      year: null, venue: null, url: null, doi: null, sources: ['user'], decision: 'candidate',
      reason: `User-owned ${parsed.format.toUpperCase()} ingested locally.`, verification: 'metadata_only'
    }])[0];
    manifest.items.push(userItem);
    item = userItem;
  }
  const similarity = tokenSimilarity(item.title, inferredTitle);
  item.verification = parsed.title && similarity < 0.35 ? 'document_mismatch' : `${parsed.format}_ingested`;
  item.document = {
    sha256: parsed.sha256,
    file_name: path.basename(absoluteDocument),
    external: !inside(root, absoluteDocument),
    format: parsed.format,
    parser: parsed.parser,
    parsed_path: slash(path.relative(root, parsed.markdown_path)),
    page_label_status: parsed.page_label_status
  };
  manifest.items = deduplicateLiterature(manifest.items);
  manifest.updated_at = isoNow();
  await new SchemaRegistry(root).assert('literature-manifest', manifest);
  await writeJson(manifestPath, manifest);
  return { item_id: item.id, verification: item.verification, format: parsed.format, parsed_path: item.document.parsed_path, sha256: parsed.sha256 };
}

export async function markdownToHwpx(markdown, options = {}) {
  const { markdownToHwpx: generate } = await loadKordoc();
  const generated = await generate(markdown, options.kordocOptions || {});
  return Buffer.from(generated);
}
