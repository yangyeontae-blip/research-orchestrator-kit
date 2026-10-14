import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Engine } from './engine.mjs';
import { SchemaRegistry } from './schemas.mjs';
import { readJson } from './utils.mjs';
export async function verifyEvidence(root, planBinding, ledger) {
  await new SchemaRegistry(root).assert('evidence-companion', ledger);
  const engine = new Engine(root),
    plan = await engine.artifact(planBinding);
  if (ledger.plan_sha256 !== plan.sha256) throw new Error('Evidence ledger belongs to another plan');
  const text = await fs.readFile(path.join(root, plan.path), 'utf8');
  const findings = [];
  for (const claim of ledger.claims || []) {
    const checks = [];
    if (!text.includes(claim.claim)) checks.push('claim_not_in_plan');
    for (const location of claim.locations || []) {
      try {
        const document = await engine.artifact(location.document);
        const parsed = await engine.artifact(location.parsed);
        const pages = await readJson(path.join(root, parsed.path));
        if (pages.sha256 !== document.sha256) throw new Error('Parsed source hash mismatch');
        const page = pages.pages.find((p) => p.pdf_page === location.pdf_page);
        // PDF text breaks lines and hyphenates words; compare with whitespace and soft hyphens normalized, nothing looser.
        const norm = (value) =>
          String(value || '')
            .normalize('NFKC')
            .replace(/­/g, '')
            .replace(/(\w)-\s+(\w)/g, '$1$2')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        if (!location.quote?.trim() || !page || !norm(page.text).includes(norm(location.quote)))
          throw new Error('Quote absent from specified page');
        if (!['support', 'contradiction', 'context'].includes(location.relation))
          throw new Error('Evidence relation required');
        if (location.printed_page != null && location.printed_page !== page.printed_page)
          throw new Error('Printed page unconfirmed');
      } catch (e) {
        checks.push(e.message);
      }
    }
    findings.push({
      id: claim.id,
      location_check: checks.length ? 'failed' : claim.locations?.length ? 'passed' : 'unverified',
      problems: checks,
      semantic_review: claim.semantic_review || { status: 'not_run' },
      human_review: {
        status: 'not_run',
        reason: 'Requires a separate trusted human confirmation; ledger assertions are not proof'
      }
    });
  }
  // Conservative paragraph inventory; not a claim that every scholarly claim was semantically identified.
  const uncovered = text
    .split(/\r?\n\s*\r?\n/)
    .filter((p) => !/^#/.test(p) && p.trim().length > 40 && !(ledger.claims || []).some((c) => p.includes(c.claim)))
    .map((p) => ({ excerpt: p.slice(0, 180), status: 'needs_claim_inventory_review' }));
  return {
    plan,
    findings,
    uncovered,
    coverage_method: 'paragraph heuristic; independent semantic inventory required',
    semantic_verified: false,
    human_verified: false
  };
}
