// Fault-injection evaluation of ROK's mechanical evidence check (src/evidence.mjs + correctPages).
// No model is called. A seeded generator builds synthetic parsed PDFs and claim ledgers, injects known citation faults,
// and measures how many ROK catches against two baselines:
//   B0  "no check"      – a ledger is accepted as written (what an unguarded LLM pipeline does)
//   B1  "naive match"   – accept when the quote is an exact substring of the cited page
// Usage: node scripts/eval-evidence.mjs [--seed 20261013] [--per-case 20] [--json out.json]
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine.mjs';
import { verifyEvidence } from '../src/evidence.mjs';
import { correctPages } from '../src/evidence-bridge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const seed = Number(arg('seed', 20261013));
const perCase = Number(arg('per-case', 20));
const jsonOut = arg('json', null);

function rng(state) { return () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = rng(seed);
const pick = list => list[Math.floor(random() * list.length)];
const WORDS = 'students revision feedback drafts writers learning structured reflection narrative classroom assessment interview coding theme sample cohort measure outcome pattern context practice support method evidence analysis response teacher rubric'.split(' ');
const sentence = () => `${Array.from({ length: 9 + Math.floor(random() * 4) }, () => pick(WORDS)).join(' ')}.`;

// Each case: valid = the ledger is honest, so a correct checker must accept it.
const CASES = [
  { id: 'valid_exact', valid: true },
  { id: 'valid_linebreak', valid: true },
  { id: 'fabricated_quote', valid: false },
  { id: 'altered_word', valid: false },
  { id: 'wrong_page', valid: false, recoverable: true },
  { id: 'hash_mismatch', valid: false },
  { id: 'claim_not_in_plan', valid: false },
  { id: 'empty_quote', valid: false },
  { id: 'bad_relation', valid: false }
];

const base = await fs.mkdtemp(path.join(os.tmpdir(), 'rok-eval-'));
for (const directory of ['profiles', 'schemas', 'prompts']) await fs.cp(path.join(root, directory), path.join(base, directory), { recursive: true });
const engine = new Engine(base);

async function build(kind, index) {
  const name = `${kind}-${index}`;
  const pages = [1, 2, 3].map(n => ({ pdf_page: n, printed_page: null, text: `${sentence()} ${sentence()} ${sentence()}` }));
  const target = pages[1];
  let quote = target.text.split('. ')[1].replace(/\.$/, '') + '.';
  quote = quote.trim();
  if (kind === 'valid_linebreak') {
    const word = quote.split(' ').find(w => w.length >= 7);
    target.text = target.text.replace(word, `${word.slice(0, 3)}-\n${word.slice(3)}`).replace(/ /g, ' \n  ');
  }
  let citedPage = 2;
  if (kind === 'fabricated_quote') quote = `${pick(WORDS)} ${pick(WORDS)} was never printed in this paper ${index}.`;
  if (kind === 'altered_word') { const words = quote.split(' '); words[3] = 'invented'; quote = words.join(' '); }
  if (kind === 'wrong_page') citedPage = 3;
  if (kind === 'empty_quote') quote = '  ';
  const claim = `Claim ${name}: ${sentence()}`;
  await fs.writeFile(path.join(base, `plan-${name}.md`), kind === 'claim_not_in_plan' ? 'Unrelated plan text.' : claim);
  await fs.writeFile(path.join(base, `doc-${name}.pdf`), `synthetic pdf ${name}`);
  const document = await engine.artifact(`doc-${name}.pdf`);
  const parsedHash = kind === 'hash_mismatch' ? 'f'.repeat(64) : document.sha256;
  await fs.writeFile(path.join(base, `pages-${name}.json`), JSON.stringify({ sha256: parsedHash, pages }));
  const parsed = await engine.artifact(`pages-${name}.json`);
  const plan = await engine.artifact(`plan-${name}.md`);
  const ledger = { plan_sha256: plan.sha256, claims: [{ id: 'C1', claim, locations: [{ document, parsed, pdf_page: citedPage, quote, relation: kind === 'bad_relation' ? 'proves' : 'support' }] }] };
  return { plan, ledger, pages, quote, citedPage };
}

const normalize = value => String(value || '').trim();
const rows = [];
for (const spec of CASES) {
  const tally = { id: spec.id, valid: spec.valid, n: perCase, rok_accept: 0, b0_accept: 0, b1_accept: 0, recovered: 0 };
  for (let i = 0; i < perCase; i++) {
    const item = await build(spec.id, i);
    let result;
    try { result = await verifyEvidence(base, item.plan, structuredClone(item.ledger)); } catch { result = { findings: [{ location_check: 'failed' }] }; }
    if (result.findings[0].location_check === 'passed') tally.rok_accept++;
    tally.b0_accept++;
    const page = item.pages.find(p => p.pdf_page === item.citedPage);
    if (normalize(item.quote) && page.text.includes(item.quote)) tally.b1_accept++;
    if (spec.recoverable) {
      const copy = structuredClone(item.ledger);
      copy.claims[0].locations[0].parsed = { path: copy.claims[0].locations[0].parsed.path };
      const corrections = await correctPages(base, copy);
      if (corrections.length && copy.claims[0].locations[0].pdf_page === 2) tally.recovered++;
    }
  }
  rows.push(tally);
}
await fs.rm(base, { recursive: true, force: true });

const pct = (a, b) => b ? `${(100 * a / b).toFixed(0)}%` : 'n/a';
const sum = (filter, key) => rows.filter(filter).reduce((s, r) => s + r[key], 0);
const invalidN = sum(r => !r.valid, 'n'), validN = sum(r => r.valid, 'n');
const summary = {
  seed, per_case: perCase, invalid_cases: invalidN, valid_cases: validN,
  detection: { rok: pct(invalidN - sum(r => !r.valid, 'rok_accept'), invalidN), b0_no_check: pct(invalidN - sum(r => !r.valid, 'b0_accept'), invalidN), b1_naive_match: pct(invalidN - sum(r => !r.valid, 'b1_accept'), invalidN) },
  false_reject: { rok: pct(validN - sum(r => r.valid, 'rok_accept'), validN), b0_no_check: pct(validN - sum(r => r.valid, 'b0_accept'), validN), b1_naive_match: pct(validN - sum(r => r.valid, 'b1_accept'), validN) },
  wrong_page_recovered: pct(sum(r => r.id === 'wrong_page', 'recovered'), sum(r => r.id === 'wrong_page', 'n'))
};

const lines = ['| case | ledger | n | ROK accepts | B0 no check accepts | B1 naive match accepts |', '|---|---|---|---|---|---|'];
for (const r of rows) lines.push(`| ${r.id} | ${r.valid ? 'honest' : 'faulty'} | ${r.n} | ${r.rok_accept} | ${r.b0_accept} | ${r.b1_accept} |`);
process.stdout.write(`${lines.join('\n')}\n\n${JSON.stringify(summary, null, 2)}\n`);
if (jsonOut) await fs.writeFile(path.resolve(jsonOut), JSON.stringify({ summary, rows }, null, 2) + '\n');

// Regression guard: the mechanical check must catch every injected fault and reject no honest ledger.
const missed = sum(r => !r.valid, 'rok_accept'), wrongReject = validN - sum(r => r.valid, 'rok_accept');
if (missed || wrongReject) { process.stderr.write(`Evidence evaluation failed: ${missed} faults accepted, ${wrongReject} honest ledgers rejected.\n`); process.exitCode = 1; }
