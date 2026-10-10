import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateQualityReport, validateStandardArtifacts } from '../../src/quality.mjs';
import { exportPlanDocx } from '../../src/export.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const demoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rok-v02-demo-'));
try {
  await fs.cp(path.join(sourceRoot, 'schemas'), path.join(demoRoot, 'schemas'), { recursive: true });
  await fs.cp(path.join(sourceRoot, 'profiles'), path.join(demoRoot, 'profiles'), { recursive: true });
  const scenarios = ['apa7-autoethnography', 'jqi-interview', 'generic-quantitative'];
  const results = [];
  for (const name of scenarios) {
    const projectDir = `workspace/${name}`;
    await fs.cp(path.join(sourceRoot, 'examples', 'synthetic-v2', name), path.join(demoRoot, projectDir), { recursive: true });
    const plan = `${projectDir}/plan.md`;
    const quality = await generateQualityReport(demoRoot, projectDir, plan);
    const exported = await exportPlanDocx(demoRoot, projectDir, plan);
    const validation = await validateStandardArtifacts(demoRoot, projectDir);
    results.push({ name, validation: validation.ok, automated_score: quality.report.automated.score, docx: exported.docx_path });
  }
  if (!results.every(item => item.validation)) process.exitCode = 1;
  process.stdout.write(JSON.stringify({ ok: results.every(item => item.validation), scenarios: results }, null, 2) + '\n');
} finally {
  await fs.rm(demoRoot, { recursive: true, force: true });
}

