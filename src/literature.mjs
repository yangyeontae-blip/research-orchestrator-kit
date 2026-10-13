import {searchKci} from './kci.mjs';
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
    let response;
    try { response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs || 15000), headers: { 'User-Agent': 'research-orchestrator-kit (mailto:research-orchestrator-kit@users.noreply.github.com)' } }); }
    catch(error) { if(attempt===retries)throw error;await sleep(Math.min(250*(2**attempt),2000));continue; }
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
      sources: ['openalex'], oa_locations: (row.locations || [row.best_oa_location]).filter(x => x?.is_oa && x.pdf_url).map(x => ({url:x.pdf_url, landing_url:x.landing_page_url || null, license:x.license || null, version:x.version || null, source:'openalex'}))
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
      existing.oa_locations = [...(existing.oa_locations || []), ...(candidate.oa_locations || [])].filter((v,i,a)=>a.findIndex(x=>x.url===v.url)===i);
      if (candidate.authors.length > existing.authors.length) existing.authors = candidate.authors;
    } else {
      merged.push({ ...candidate });
    }
  }
  return merged.map(item => ({
    id: item.id || itemId(item), doi: item.doi || null, title: item.title,
    normalized_title: item.normalized_title || normalizeTitle(item.title), authors: item.authors || [],
    year: item.year || null, venue: item.venue || null, url: item.url || null,
    sources: item.sources, ...(item.oa_locations?.length ? {oa_locations:item.oa_locations} : {}), decision: item.decision || 'candidate',
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
  const rows = Math.max(1,Math.min(options.rows || 20,50));
  const encoded = encodeURIComponent(query.trim());
  // A second OpenAlex request restricted to open access finds full texts that relevance ranking alone often misses.
  const providers=['crossref','openalex','openalex_oa',...(options.kci?['kci']:[])];
  const requests=[
    fetchJson(`https://api.crossref.org/works?query.bibliographic=${encoded}&rows=${rows}`, options),
    fetchJson(`https://api.openalex.org/works?search=${encoded}&per-page=${rows}`, options),
    fetchJson(`https://api.openalex.org/works?search=${encoded}&filter=open_access.is_oa:true&per-page=${rows}`, options)
  ];
  if(options.kci)requests.push(searchKci(query,{fetchImpl:options.fetchImpl,rows}));
  const responses=await Promise.allSettled(requests);
  const failures = responses.flatMap((r,i)=>r.status==='rejected'?[{provider:providers[i],reason:r.reason.message}]:[]);
  if(failures.length===providers.length)throw new Error('All literature providers failed: '+failures.map(f=>f.reason).join('; '));
  const value = i => responses[i]?.status === 'fulfilled' ? responses[i].value : null;
  const combined = deduplicateLiterature([...crossrefItems(value(0)), ...openAlexItems(value(1)), ...openAlexItems(value(2)), ...(value(3)||[]).map(r=>({...r,doi:normalizeDoi(r.doi),normalized_title:normalizeTitle(r.title)}))]);
  // When the candidate cap trims the list, keep candidates with a public full text first (stable otherwise).
  const found = [...combined.filter(item => item.oa_locations?.length), ...combined.filter(item => !item.oa_locations?.length)].slice(0, options.maxCandidates || 50);
  const cap=options.maxCandidates ?? 50;
  const merged=deduplicateLiterature([...manifest.items,...found]);
  const previousIds=new Set(manifest.items.map(i=>i.id));
  let remaining=Math.max(0,cap-manifest.items.length);
  manifest.items=merged.filter(i=>previousIds.has(i.id)||remaining-->0);
  manifest.searches.push({ query: query.trim(), searched_at: isoNow(), providers: responses.flatMap((r,i)=>r.status==='fulfilled'?[providers[i]]:[]), failures, result_count: found.length });
  manifest.updated_at = isoNow();
  await new SchemaRegistry(root).assert('literature-manifest', manifest);
  await writeJson(manifestPath, manifest);
  return { manifest_path: path.relative(root, manifestPath).split(path.sep).join('/'), added_or_matched: found.length, total: manifest.items.length, items: found };
}
