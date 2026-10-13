// Connects model-written evidence to exact file bindings. Models cite a short source id, a PDF page and a quote;
// ROK fills in the document and parsed-page hashes, so a model never has to copy (or invent) a SHA-256.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Engine } from './engine.mjs';
import { readJson, writeJson, isoNow } from './utils.mjs';
import { planSections } from './blueprint.mjs';

const slash = value => value.split(path.sep).join('/');

export const EVIDENCE_FORMAT = {
  plan_sha256: 'leave empty; ROK fills it in',
  claims: [{
    id: 'C1',
    plan_sentence: 'P12 (an id from plan_sentences; ROK copies that sentence as the claim)',
    locations: [{ source_id: 'S1', pdf_page: 3, quote: 'a sentence copied verbatim from that PDF page', relation: 'support | contradiction | context' }]
  }]
};

export const DESIGN_FORMAT = {
  links: [{ question: 'research question text copied verbatim from the plan', data_source: 'data source phrase copied verbatim from the plan', analysis: 'analysis phrase copied verbatim from the plan', rationale: 'why this data and analysis answer the question' }]
};

async function acquisitionRecords(root, project) {
  const log = await readJson(path.join(root, project, 'acquisition-log.json')).catch(() => ({ items: [] }));
  return log.items.filter(item => item.file && item.parsed && item.pages && item.identity_checked);
}

async function manifestItems(root, project) {
  const manifest = await readJson(path.join(root, project, 'literature-manifest.json')).catch(() => ({ items: [] }));
  return new Map(manifest.items.map(item => [item.id, item]));
}

// Assigns S1, S2, ... to collected papers that were parsed and matched by title.
export async function evidenceSources(root, project, texts) {
  if (!project) return { sources: [], byId: new Map() };
  const records = await acquisitionRecords(root, project);
  const items = await manifestItems(root, project);
  const sources = [];
  for (const text of texts) {
    const record = records.find(item => item.parsed.path === text.source.path);
    if (!record) continue;
    const meta = items.get(record.id) || {};
    const source = { source_id: `S${sources.length + 1}`, input: text.name, literature_id: record.id, title: meta.title || null, authors: (meta.authors || []).slice(0, 3), year: meta.year || null, document: record.file, parsed: record.pages };
    text.source_id = source.source_id;
    sources.push(source);
  }
  return { sources, byId: new Map(sources.map(item => [item.source_id, item])) };
}

// Numbers the plan's sentences so a reviewer can point at one instead of paraphrasing it.
export function planSentences(text) {
  const sentences = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*(#|\|)/.test(line)) continue;
    const body = line.replace(/^\s*([-*]|\d+[.)])\s+/, '').trim();
    for (const part of body.split(/(?<=[.?!다])\s+(?=\S)/)) if (part.trim().length >= 20) sentences.push({ id: `P${sentences.length + 1}`, text: part.trim() });
  }
  return sentences;
}

// Corrects a page label only when the exact quote occurs on exactly one other page of the same parsed document.
export async function correctPages(root, ledger) {
  const norm = value => String(value || '').normalize('NFKC').replace(/­/g, '').replace(/(\w)-\s+(\w)/g, '$1$2').replace(/\s+/g, ' ').trim().toLowerCase();
  const corrections = [];
  const cache = new Map();
  for (const claim of ledger.claims) for (const location of claim.locations) {
    if (!cache.has(location.parsed.path)) cache.set(location.parsed.path, (await readJson(path.join(root, location.parsed.path))).pages);
    const pages = cache.get(location.parsed.path);
    const quote = norm(location.quote);
    if (!quote || norm(pages.find(page => page.pdf_page === location.pdf_page)?.text).includes(quote)) continue;
    const hits = pages.filter(page => norm(page.text).includes(quote));
    if (hits.length === 1) { corrections.push({ claim: claim.id, from: location.pdf_page, to: hits[0].pdf_page }); location.pdf_page = hits[0].pdf_page; location.printed_page = undefined; delete location.printed_page; }
  }
  return corrections;
}

export function resolveEvidence(ledger, byId, planSha, sentences = []) {
  const problems = [];
  const bySentence = new Map(sentences.map(item => [item.id, item.text]));
  const claims = (ledger.claims || []).map(claim => ({
    id: String(claim.id || ''), claim: bySentence.get(String(claim.plan_sentence || '').split(/\s/)[0]) || String(claim.claim || ''),
    locations: (claim.locations || []).flatMap(location => {
      const source = byId.get(location.source_id);
      if (!source) { problems.push(`${claim.id}: unknown source ${location.source_id}`); return []; }
      return [{ document: { path: source.document.path, sha256: source.document.sha256 }, parsed: { path: source.parsed.path, sha256: source.parsed.sha256 }, pdf_page: Number(location.pdf_page), quote: String(location.quote || ''), relation: location.relation, ...(location.printed_page != null ? { printed_page: location.printed_page } : {}) }];
    })
  }));
  return { ledger: { plan_sha256: planSha, claims }, problems };
}

// Pins a model's summary phrase to the plan line it most likely came from, so mechanical checks compare exact plan
// text. A line is used only when it contains at least `threshold` of the phrase's words; otherwise the phrase stays
// as written and the check fails visibly.
export function anchorInPlan(phrase, planText, threshold = 0.6) {
  const clean = value => String(value || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  const words = value => clean(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2);
  if (clean(planText).toLowerCase().includes(clean(phrase).toLowerCase())) return { text: phrase, anchored: false, overlap: 1 };
  const wanted = [...new Set(words(phrase))];
  if (!wanted.length) return { text: phrase, anchored: false, overlap: 0 };
  let best = null;
  for (const line of String(planText).split(/\r?\n/)) {
    const body = line.replace(/^\s*([-*]|\d+[.)])\s+/, '').trim();
    if (!body || /^#/.test(body)) continue;
    const have = new Set(words(body));
    const overlap = wanted.filter(word => have.has(word)).length / wanted.length;
    if (!best || overlap > best.overlap) best = { text: body, overlap };
  }
  return best && best.overlap >= threshold ? { text: best.text, anchored: true, overlap: Number(best.overlap.toFixed(2)) } : { text: phrase, anchored: false, overlap: best ? Number(best.overlap.toFixed(2)) : 0 };
}

// Writes the plan-bound design table a model returned for a plan or revision.
export async function installDesign(root, project, plan, content) {
  const raw = JSON.parse(content);
  const brief = await readJson(path.join(root, project, 'research-brief.json'));
  const planText = await fs.readFile(path.join(root, plan.path), 'utf8');
  const sections = new Map(planSections(planText).map(section => [section.id, section]));
  // Prefer the model's phrase pinned to a plan line; otherwise quote the first sentence of the matching plan section.
  const firstSentence = id => {
    const section = sections.get(id);
    if (!section?.source) return null;
    const line = section.text.split(/\r?\n/).map(item => item.replace(/^\s*([-*]|\d+[.)])\s+/, '').trim()).find(item => item.length >= 10 && !/^#/.test(item));
    return line ? line.split(/(?<=[.?!다])\s+/)[0] : null;
  };
  const pin = (value, fallback) => {
    const pinned = anchorInPlan(String(value || ''), planText);
    if (planText.includes(pinned.text)) return { text: pinned.text, from_section: false };
    const sentence = fallback && firstSentence(fallback);
    return sentence ? { text: sentence, from_section: true } : { text: pinned.text, from_section: false };
  };
  // Models sometimes nest the table ({"design_format": {"links": [...]}}); take the first "links" array found.
  const findLinks = value => {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value.links)) return value.links;
    for (const child of Object.values(value)) { const found = findLinks(child); if (found) return found; }
    return null;
  };
  let links = findLinks(raw) || [];
  if (!links.length && sections.get('questions')?.source) {
    // No usable table: one row per plan research question, quoting the plan's data and analysis sections.
    const questions = sections.get('questions').text.split(/\r?\n/).map(item => item.replace(/^\s*([-*]|\d+[.)])\s+/, '').replace(/^\*\*[^*]+\*\*\s*/, '').trim()).filter(item => /[?？]$/.test(item));
    links = questions.map(question => ({ question, data_source: '', analysis: '', rationale: '계획서의 연구문제·자료·분석 절에서 ROK가 구성한 행' }));
  }
  const design = { schema_version: 1, project_id: brief.project_id, plan_sha256: plan.sha256, links: links.map(link => {
    const question = pin(link.question, 'questions'), data = pin(link.data_source, 'data'), analysis = pin(link.analysis, 'analysis');
    const note = data.from_section || analysis.from_section ? ' (자료·분석 문구 일부는 계획서 해당 절의 첫 문장에서 가져옴; 의미상 대응은 연구자가 확인)' : '';
    return { question: question.text, data_source: data.text, analysis: analysis.text, rationale: String(link.rationale || '') + note };
  }) };
  await writeJson(path.join(root, project, 'research-design.json'), design);
  return design.links.length;
}

// Carries verified review evidence into the revised plan's claim ledger. Only claims that still appear verbatim in the
// revision and whose quotes were found on the cited page count; their papers are marked selected for that reason.
export async function installRevisionLedger(root, project, plan, review) {
  const engine = new Engine(root);
  const evidence = (review.artifacts || []).find(item => item.kind === 'evidence_companion');
  const checks = (review.artifacts || []).find(item => item.kind === 'evidence_checks');
  if (!evidence || !checks) return { carried: 0 };
  const ledger = await readJson(path.join(root, (await engine.artifact(evidence)).path));
  const checked = await readJson(path.join(root, (await engine.artifact(checks)).path));
  const passed = new Set(checked.findings.filter(item => item.location_check === 'passed').map(item => item.id));
  const text = await fs.readFile(path.join(root, plan.path), 'utf8');
  const records = await acquisitionRecords(root, project);
  const literatureId = location => records.find(item => item.file.sha256 === location.document.sha256)?.id;
  const claims = ledger.claims.filter(claim => passed.has(claim.id)).map(claim => ({ claim, anchor: anchorInPlan(claim.claim, text, 0.5) })).filter(({ claim, anchor }) => text.includes(claim.claim) || anchor.anchored).map(({ claim, anchor }) => ({
    id: claim.id, claim: claim.claim, plan_location: text.includes(claim.claim) ? claim.claim : anchor.text,
    literature_ids: [...new Set(claim.locations.map(literatureId).filter(Boolean))],
    verification_status: 'parsed_verified',
    evidence_locations: claim.locations.map(location => `PDF ${location.pdf_page}쪽: "${location.quote.slice(0, 120)}"`),
    notes: (text.includes(claim.claim) ? '' : `Plan sentence matched by word overlap (${anchor.overlap}) after revision. `) + 'Quote found on the cited PDF page of the parsed text; original-document comparison by the researcher is still pending.'
  })).filter(claim => claim.literature_ids.length);
  const brief = await readJson(path.join(root, project, 'research-brief.json'));
  await writeJson(path.join(root, project, 'claim-ledger.json'), { schema_version: 1, project_id: brief.project_id, plan_sha256: plan.sha256, claims, updated_at: isoNow() });
  const selected = new Set(claims.flatMap(claim => claim.literature_ids));
  if (selected.size) {
    const manifestPath = path.join(root, project, 'literature-manifest.json');
    const manifest = await readJson(manifestPath);
    for (const item of manifest.items) if (selected.has(item.id) && item.decision !== 'selected') { item.decision = 'selected'; item.reason = 'Cited with a quote verified on the PDF page in the reviewed revision'; }
    manifest.updated_at = isoNow();
    await writeJson(manifestPath, manifest);
  }
  return { carried: claims.length, selected: selected.size, ledger: slash(path.join(project, 'claim-ledger.json')) };
}

// The revision worker sees which review claims were verified, with enough bibliographic data to cite them.
export async function verifiedEvidence(root, status) {
  const review = [...status.tasks].reverse().find(task => task.stage === 'review' && task.status === 'completed');
  const project = status.project_dir;
  if (!review || !project) return [];
  const evidence = (review.artifacts || []).find(item => item.kind === 'evidence_companion');
  const checks = (review.artifacts || []).find(item => item.kind === 'evidence_checks');
  if (!evidence || !checks) return [];
  const ledger = await readJson(path.join(root, evidence.path));
  const checked = await readJson(path.join(root, checks.path));
  const passed = new Set(checked.findings.filter(item => item.location_check === 'passed').map(item => item.id));
  const records = await acquisitionRecords(root, project);
  const items = await manifestItems(root, project);
  return ledger.claims.filter(claim => passed.has(claim.id)).map(claim => ({
    claim: claim.claim,
    sources: claim.locations.map(location => {
      const meta = items.get(records.find(item => item.file.sha256 === location.document.sha256)?.id) || {};
      return { title: meta.title || null, authors: (meta.authors || []).slice(0, 3), year: meta.year || null, pdf_page: location.pdf_page, relation: location.relation };
    })
  }));
}
