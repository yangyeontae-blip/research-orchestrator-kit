#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { Engine } from './engine.mjs';
import { loadConfig } from './config.mjs';
import { codexDispatch } from './adapters/codex.mjs';
import { claudeDispatch } from './adapters/claude.mjs';
import { manualDispatch } from './adapters/manual.mjs';
import { runApiTask } from './adapters/api.mjs';
import { createResearchProject, promptResearchBrief } from './wizard.mjs';
import { searchLiterature } from './literature.mjs';
import { ingestLiteraturePdf } from './pdf.mjs';
import { ingestLiteratureKoreanOffice } from './kordoc.mjs';
import { exportPlanDocx, exportPlanHwpx } from './export.mjs';
import { generateQualityReport, validateStandardArtifacts } from './quality.mjs';

const argv = process.argv.slice(2);
const takeOption = (name, fallback = null) => {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) throw new Error(`${name} requires a value`);
  argv.splice(index, 2);
  return value;
};
const takeFlag = name => {
  const index = argv.indexOf(name);
  if (index < 0) return false;
  argv.splice(index, 1);
  return true;
};

const root = path.resolve(takeOption('--root', process.cwd()));
const profile = takeOption('--profile', null);
const claimant = takeOption('--agent', 'agent');
const answersFile = takeOption('--answers', null);
const projectOption = takeOption('--project', null);
const queryOption = takeOption('--query', null);
const planOption = takeOption('--plan', null);
const outputOption = takeOption('--output', null);
const literatureId = takeOption('--id', null);
const audience = takeOption('--audience', null);
const duration = Number(takeOption('--duration', '90'));
const aspectRatio = takeOption('--aspect', '16:9');
const notes = takeOption('--notes', '');
const formatOption = takeOption('--format', null);
const jsonOutput = takeFlag('--json');
const [command, ...args] = argv;
const engine = new Engine(root);
const inputJson = async file => JSON.parse((await fs.readFile(path.resolve(root, file), 'utf8')).replace(/^\uFEFF/, ''));

async function dispatch(task, options = {}) {
  const { config, source } = await loadConfig(root);
  const agent = config.agents[task.role] || { provider: 'manual' };
  if (agent.provider === 'codex') return { config: source, provider: 'codex', ...codexDispatch(task, agent) };
  if (agent.provider === 'claude') return { config: source, provider: 'claude', ...(await claudeDispatch(root, task, agent)) };
  if (['openai_api', 'anthropic_api'].includes(agent.provider)) {
    if (!options.runApi) return { config: source, provider: agent.provider, requires: 'Use `rok next` for the mandatory per-call confirmation.' };
    return { config: source, provider: agent.provider, ...(await runApiTask(root, task, agent, { confirm: confirmCloudCall })) };
  }
  return { config: source, provider: 'manual', ...manualDispatch(task) };
}

async function confirmCloudCall(summary) {
  stderr.write('\n클라우드 AI 호출 전 확인\n');
  stderr.write(`- 제공자/모델: ${summary.provider} / ${summary.model}\n`);
  for (const file of summary.files) stderr.write(`- 전송: ${file.path} (${file.bytes} bytes, ${file.sha256})\n`);
  stderr.write(`- 합계: ${summary.total_bytes} bytes\n`);
  stderr.write(`- 민감정보 탐지: ${summary.sensitive_findings.length ? JSON.stringify(summary.sensitive_findings) : '없음'}\n`);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question('이 호출만 승인하려면 SEND를 입력하세요: ');
    return answer.trim() === 'SEND';
  } finally { rl.close(); }
}

function humanStatus(status) {
  const queued = status.tasks.filter(task => task.status === 'queued');
  const failed = status.tasks.filter(task => ['partial', 'failed'].includes(task.status));
  const video = status.branches?.video?.status || 'idle';
  const pendingUse = status.tasks.find(task => task.status === 'completed' && ['generated', 'automated_verified'].includes(task.completion_level) && ['plan', 'revise', 'video_render'].includes(task.stage));
  const next = pendingUse ? `검증 필요 (${pendingUse.completion_level}): ${pendingUse.stage} (${pendingUse.id})`
    : status.current_stage === 'collection_approval' ? '계획서 수집 승인 필요'
    : status.current_stage === 'revision_approval' ? '근거 반영 승인 필요'
      : queued.length ? `${queued[0].role} 에이전트의 ${queued[0].stage} 작업 전달`
        : failed.length ? `${failed[0].stage} 작업 retry`
          : '대기 중';
  return [
    `워크플로: ${status.workflow_id}`,
    `프로필: ${status.profile}`,
    `현재 단계: ${status.current_stage} (cycle ${status.cycle})`,
    `영상 가지: ${video}`,
    `다음 행동: ${next}`
  ].join('\n');
}

async function projectDir(status = null) {
  if (projectOption) return projectOption.replace(/\\/g, '/');
  const current = status || await engine.status();
  if (current.project_dir) return current.project_dir;
  throw new Error('Project directory is unknown. Pass --project workspace/<project-id>.');
}

async function nextAction() {
  const status = await engine.status();
  const queued = status.tasks.filter(task => task.status === 'queued').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (!queued.length) return { action: 'wait', message: humanStatus(status), status };
  const task = await engine.claim(queued[0].id, claimant);
  try {
    const delivery = await dispatch(task, { runApi: true });
    if (delivery.receipt) {
      const completed = await engine.complete(delivery.receipt);
      return { action: 'api_completed', task: completed, cloud_summary: delivery.summary, status: await engine.status() };
    }
    return { action: 'dispatched', task, dispatch: delivery };
  } catch (error) {
    await engine.complete({ schema_version: 1, task_id: task.id, token: task.token, status: 'failed', artifacts: [], reason: error.message }).catch(() => {});
    throw error;
  }
}

function usage() {
  return [
    'rok new [--answers answers.json]',
    'rok next | status [--json] | validate [--project dir] [--plan file] | export [--format docx|hwpx] [--plan file] [--output file]',
    'rok literature search --query "..." | rok literature ingest <pdf|hwp|hwpx> [--id literature-id]',
    'rok video request [--audience ... --duration 90 --aspect 16:9 --notes ...]',
    'rok init --profile generic|apa7|jqi | enqueue <request.json> | claim <task-id> | complete <receipt.json>',
    'rok verify-use <task-id> <verification.json> | approve <collection|revision|video> <approval.json> | retry <task-id> [--root path]'
  ].join('\n');
}

try {
  let result;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    stdout.write(usage() + '\n');
    process.exit(0);
  } else if (command === 'new') {
    const answers = answersFile ? await inputJson(answersFile) : await promptResearchBrief();
    result = await createResearchProject(root, answers);
  } else if (command === 'next') result = await nextAction();
  else if (command === 'init') {
    if (!profile) throw new Error('Select a research-plan profile explicitly: --profile generic|apa7|jqi');
    result = await engine.init({ profile });
  } else if (command === 'enqueue') result = await engine.enqueue(await inputJson(args[0]));
  else if (command === 'claim') {
    const task = await engine.claim(args[0], claimant);
    result = { task, dispatch: await dispatch(task), token: task.token };
  } else if (command === 'complete') result = await engine.complete(await inputJson(args[0]));
  else if (command === 'approve') result = await engine.approve(args[0], await inputJson(args[1]));
  else if (command === 'verify-use') result = await engine.verifyUse(args[0], await inputJson(args[1]));
  else if (command === 'status') result = await engine.status();
  else if (command === 'retry') result = await engine.retry(args[0]);
  else if (command === 'literature' && args[0] === 'search') {
    const status = await engine.status();
    result = await searchLiterature(root, await projectDir(status), queryOption || args.slice(1).join(' '));
  } else if (command === 'literature' && args[0] === 'ingest') {
    const status = await engine.status();
    const extension = path.extname(args[1] || '').toLowerCase();
    if (extension === '.pdf') result = await ingestLiteraturePdf(root, await projectDir(status), args[1], { id: literatureId });
    else if (['.hwp', '.hwpx'].includes(extension)) result = await ingestLiteratureKoreanOffice(root, await projectDir(status), args[1], { id: literatureId });
    else throw new Error('Literature ingest supports .pdf, .hwp, and .hwpx files.');
  } else if (command === 'validate') {
    const status = await engine.status();
    const project = await projectDir(status);
    const plan = planOption || status.artifacts.plan?.path;
    if (plan) await generateQualityReport(root, project, plan);
    result = await validateStandardArtifacts(root, project);
  } else if (command === 'export') {
    const status = await engine.status();
    const plan = planOption || status.artifacts.plan?.path;
    if (!plan) throw new Error('No current plan found. Pass --plan.');
    const format = (formatOption || 'docx').toLowerCase();
    if (format === 'docx') result = await exportPlanDocx(root, await projectDir(status), plan, { output: outputOption });
    else if (format === 'hwpx') result = await exportPlanHwpx(root, await projectDir(status), plan, { output: outputOption });
    else throw new Error('Export format must be docx or hwpx.');
  } else if (command === 'video' && args[0] === 'request') {
    const status = await engine.status();
    result = await engine.requestVideo({
      human_requested: true, plan: status.artifacts.plan,
      audience: audience || 'research audience', duration_seconds: duration, aspect_ratio: aspectRatio, notes
    });
  } else throw new Error(usage());

  if (command === 'status' && stdout.isTTY && !jsonOutput) stdout.write(humanStatus(result) + '\n');
  else stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  stderr.write(JSON.stringify({ ok: false, error: error.message }, null, 2) + '\n');
  process.exitCode = 1;
}
