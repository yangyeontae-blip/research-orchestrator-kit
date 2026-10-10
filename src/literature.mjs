import path from 'node:path';
import { createHash } from 'node:crypto';
import { SchemaRegistry } from './schemas.mjs';
import { exists, isoNow, readJson, writeJson } from './utils.mjs';

export const normalizeDoi = value => String(value || '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '') || null;
export const normalizeTitle = value => String(value || '').normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const first = value => Array.isArray(value) ? value[0] : value;
const itemId = item => `lit-${createHash('sha256').update(`${item.doi || ''}|${item.normalized_title}|${item.year || ''}`).digest('hex').slice(0, 12)}`;

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const retries = options.retries ?? 3;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(url, { headers: { 'User-Agent': 'research-orchestrator-kit/0.2 (mailto:research-orchestrator-kit@users.noreply.github.com)' } });
    if (response.ok) return response.json();
    last = new Error(`Literature API ${response.status}: ${response.statusText}`);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === retries) throw last;
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : Math.min(250 * (2 ** attempt), 2000));
  }
  throw last;
}

function crossrefItems(data) {
  return (data?.message?.items || []).map(row => {
    const authors = (row.author || []).map(author => [author.given, author.family].filter(Boolean).join(' ')).filter(Boolean);
    const title = first(row.title) || '';
    return {
      doi: normalizeDoi(row.DOI), title, normalized_title: normalizeTitle(title), authors,
      year: row.published?.['date-parts']?.[0]?.[0] || row.issued?.['date-parts']?.[0]?.[0] || null,
      venue: first(row['container-title']) || null, url: row.URL || null, sources: ['crossref']
    };
  }).filter(item => item.title);
}

function openAlexItems(data) {
  return (data?.results || []).map(row => {
    const authors = (row.authorships || []).map(item => item.author?.display_name).filter(Boolean);
    const title = row.display_name || row.title || '';
    return {
      doi: normalizeDoi(row.doi), title, normalized_title: normalizeTitle(title), authors,
      year: row.publication_year || null,
      venue: row.primary_location?.source?.display_name || null,
      url: row.doi || row.primary_location?.landing_page_url || row.id || null,
      sources: ['openalex']
    };
  }).filter(item => item.title);
}

function sameWork(left, right) {
  if (left.doi && right.doi) return left.doi === right.doi;
  const authorA = normalizeTitle(left.authors?.[0] || '');
  const authorB = normalizeTitle(right.authors?.[0] || '');
  return left.normalized_title && left.normalized_title === right.normalized_title && left.year === right.year && authorA === authorB;
}

export function deduplicateLiterature(items) {
  const merged = [];
  for (const candidate of items) {
    const existing = merged.find(item => sameWork(item, candidate));
    if (existing) {
      existing.sources = [...new Set([...existing.sources, ...candidate.sources])];
      existing.doi ||= candidate.doi;
      existing.url ||= candidate.url;
      existing.venue ||= candidate.venue;
      if (candidate.authors.length > existing.authors.length) existing.authors = candidate.authors;
    } else {
      merged.push({ ...candidate });
    }
  }
  return merged.map(item => ({
    id: item.id || itemId(item), doi: item.doi || null, title: item.title,
    normalized_title: item.normalized_title || normalizeTitle(item.title), authors: item.authors || [],
    year: item.year || null, venue: item.venue || null, url: item.url || null,
    sources: item.sources, decision: item.decision || 'candidate',
    reason: item.reason || 'Metadata search result; selection decision pending.',
    verification: item.verification || 'metadata_only', ...(item.pdf ? { pdf: item.pdf } : {}),
    ...(item.document ? { document: item.document } : {})
  }));
}

export async function searchLiterature(root, projectDir, query, options = {}) {
  if (!query?.trim()) throw new Error('A literature search query is required');
  const manifestPath = path.resolve(root, projectDir, 'literature-manifest.json');
  const manifest = await exists(manifestPath) ? await readJson(manifestPath) : {
    schema_version: 1, project_id: path.basename(path.resolve(root, projectDir)), searches: [], items: [], updated_at: isoNow()
  };
  const rows = options.rows || 20;
  const encoded = encodeURIComponent(query.trim());
  const [crossref, openalex] = await Promise.all([
    fetchJson(`https://api.crossref.org/works?query.bibliographic=${encoded}&rows=${rows}`, options),
    fetchJson(`https://api.openalex.org/works?search=${encoded}&per-page=${rows}`, options)
  ]);
  const found = deduplicateLiterature([...crossrefItems(crossref), ...openAlexItems(openalex)]);
  manifest.items = deduplicateLiterature([...manifest.items, ...found]);
  manifest.searches.push({ query: query.trim(), searched_at: isoNow(), providers: ['crossref', 'openalex'], result_count: found.length });
  manifest.updated_at = isoNow();
  await new SchemaRegistry(root).assert('literature-manifest', manifest);
  await writeJson(manifestPath, manifest);
  return { manifest_path: path.relative(root, manifestPath).split(path.sep).join('/'), added_or_matched: found.length, total: manifest.items.length, items: found };
}
