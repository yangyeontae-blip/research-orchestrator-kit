import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createResearchProject } from '../src/wizard.mjs';
import { generateQualityReport, validateStandardArtifacts } from '../src/quality.mjs';
import { exportPlanDocx } from '../src/export.mjs';
import { toolkitFixture, zipEntry } from './helpers.mjs';

async function setup(t, profile = 'apa7') {
  const root = await toolkitFixture(t);
  const created = await createResearchProject(root, {
    title: `${profile} 합성 사례`, idea: '가상 기록의 변화 과정을 탐구한다.', profile,
    entry_mode: 'direct_plan', method: profile === 'generic' ? '설문 연구' : '질적 연구',
    deadline: '2030-10-31', institution_guidance: '합성 지침', sensitive_information: true,
    apa_paper_type: profile === 'apa7' ? 'student' : 'not_applicable'
  });
  const project = created.project_dir;
  const plan = path.join(project, 'plan.md').replace(/\\/g, '/');
  const body = `# 합성 연구\n\n## 연구문제\n가상 기록은 어떻게 변화하는가?\n\n## 자료수집\n익명화된 가상 기록을 사용한다.\n\n## 분석방법\n주제분석을 한다.\n\n## 연구윤리\n동의와 익명화를 확인한다.\n\n## 추진 일정\n2030년 10월까지 수행한다.\n\n## 참고문헌\nKim, A. (2029). Synthetic study.\n`;
  await fs.writeFile(path.join(root, plan), body);
  const ledgerPath = path.join(root, project, 'claim-ledger.json');
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  ledger.claims.push({ id: 'C1', claim: '합성 주장', plan_location: '연구문제', literature_ids: [], verification_status: 'unverified', evidence_locations: [], notes: '합성' });
  await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  return { root, project, plan };
}

test('quality report separates automated, AI, and human assessments', async t => {
  const { root, project, plan } = await setup(t);
  const result = await generateQualityReport(root, project, plan);
  assert.equal(result.report.ai_assessment, null);
  assert.equal(result.report.human_assessment, null);
  assert.equal(result.report.automated.hard_checks_passed, false);
  assert.ok(result.report.automated.checks.some(item => item.id === 'evidence_status' && !item.passed));
});

test('DOCX export records Markdown and DOCX hashes and contains core OOXML', async t => {
  const { root, project, plan } = await setup(t);
  await generateQualityReport(root, project, plan);
  const result = await exportPlanDocx(root, project, plan);
  const bytes = await fs.readFile(path.join(root, result.docx_path));
  assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
  const documentXml = zipEntry(bytes, 'word/document.xml');
  assert.ok(documentXml);
  assert.match(documentXml.toString('utf8'), /연구문제/);
  assert.equal(result.manifest.markdown.sha256.length, 64);
  assert.equal((await validateStandardArtifacts(root, project)).ok, true);
  await fs.appendFile(path.join(root, plan), '\n변경');
  assert.equal((await validateStandardArtifacts(root, project)).ok, false);
});

