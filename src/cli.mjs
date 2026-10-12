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

import {runWorkflow,stopRun,doctor} from './execution.mjs';
import {createBlueprint,previewVideo} from './blueprint.mjs';
import {serveBridge} from './bridge.mjs';
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
const feedbackOption = takeOption('--feedback', null);
const reasonOption = takeOption('--reason', '');
const gapsOption = takeOption('--gaps', '');
const documentOption = takeOption('--document', null);
const jsonOutput = takeFlag('--json');
const rebind = takeFlag('--rebind');
const previousOption=takeOption('--previous',null);
const [command, ...args] = argv;
const leaseHours = Number((await loadConfig(root).catch(() => ({ config: {} }))).config.lease_hours);
const engine = new Engine(root, { leaseMs: leaseHours > 0 ? leaseHours * 60 * 60 * 1000 : undefined });
const inputJson = async file => JSON.parse((await fs.readFile(path.resolve(root, file), 'utf8')).replace(/^\uFEFF/, ''));

async function dispatch(task, options = {}) {
  const { config, source } = await loadConfig(root);
  const agent = config.agents[task.role] || { provider: 'manual' };
  if (agent.provider === 'codex') return { config: source, provider: 'codex', ...codexDispatch(task, { ...agent, root }) };
  if (agent.provider === 'claude') return { config: source, provider: 'claude', ...(await claudeDispatch(root, task, agent)) };
  if (['openai_api', 'anthropic_api'].includes(agent.provider)) {
    if (!options.runApi) return { config: source, provider: agent.provider, requires: 'Use `rok next` for the mandatory per-call confirmation.' };
    const outputDir = `${(await engine.status()).project_dir || 'workspace'}/tasks/${task.id}`;
    return { config: source, provider: agent.provider, ...(await runApiTask(root, task, agent, { confirm: confirmCloudCall, outputDir })) };
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

// Approvals, human use checks, and rework are human decisions: an agent shell without a terminal cannot record them.
async function confirmHuman(lines, phrase) {
  if (!stdin.isTTY) throw new Error('This command records a human decision and must be run by a person in an interactive terminal.');
  stderr.write('\n' + lines.join('\n') + '\n');
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`확인하려면 ${phrase}를 입력하세요: `);
    if (answer.trim() !== phrase) throw new Error('Cancelled: confirmation phrase did not match');
  } finally { rl.close(); }
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

const bindingLine = (label, binding) => `- ${label}: ${binding?.path} (${binding?.sha256})`;

async function approveCommand(kind, file) {
  if (!['collection', 'revision', 'video'].includes(kind)) throw new Error('Approval kind must be collection, revision, or video');
  if (!stdin.isTTY) throw new Error('This command records a human decision and must be run by a person in an interactive terminal.');
  const status = await engine.status();
  const approval = file ? await inputJson(file) : {
    workflow_id: status.workflow_id,
    plan: status.artifacts.plan,
    ...(kind === 'revision' ? { report: status.artifacts.review_report } : {}),
    ...(kind === 'video' ? { storyboard: status.artifacts.video_storyboard, source_map: status.artifacts.video_source_map } : {})
  };
  if (!file && kind === 'revision') {
    const items = (await ask('반영할 항목 ID (쉼표 구분, 모두 반려하려면 빈칸): ')).split(',').map(item => item.trim()).filter(Boolean);
    approval.approved_items = items;
    if (!items.length) approval.decline_all = true;
  }
  const gate = kind === 'collection' ? (await engine.profile(status.profile)).collection_gate || {} : {};
  if (gate.minimum_rubric_total != null && approval.quality?.rubric_total == null) {
    approval.quality = { ...approval.quality, rubric_total: Number(await ask(`사람 평가 루브릭 합계 (최소 ${gate.minimum_rubric_total}): `)) };
  }
  approval.approved_by ||= await ask('승인자 이름 또는 식별자: ');
  if (!approval.approved_by) throw new Error('승인자가 필요합니다');
  await confirmHuman([
    `${kind} 승인`,
    bindingLine('계획서', approval.plan),
    ...(kind === 'revision' ? [bindingLine('검토 보고서', approval.report), `- 반영 항목: ${approval.decline_all ? '없음 (모두 반려, 새 수집 회차)' : approval.approved_items?.join(', ')}`] : []),
    ...(kind === 'video' ? [bindingLine('스토리보드', approval.storyboard), bindingLine('출처 지도', approval.source_map)] : []),
    `- 승인자: ${approval.approved_by}`
  ], 'APPROVE');
  return engine.approve(kind, { ...approval, human_confirmed: true });
}

async function reworkCommand(taskId) {
  const feedback = feedbackOption || (stdin.isTTY ? await ask('무엇을 고쳐야 하나요? ') : '');
  if (!feedback) throw new Error('Rework requires --feedback "..."');
  const status = await engine.status();
  const task = status.tasks.find(item => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (!stdin.isTTY) throw new Error('This command records a human decision and must be run by a person in an interactive terminal.');
  const requestedBy = await ask('요청자 이름 또는 식별자: ');
  await confirmHuman([`${task.stage} 작업 ${taskId}을(를) 다시 작업하도록 돌려보냅니다.`, `- 피드백: ${feedback}`], 'REWORK');
  return engine.rework(taskId, { feedback, requested_by: requestedBy || 'human' });
}

async function collectMoreCommand(file) {
  if (!stdin.isTTY) throw new Error('Supplemental collection is a human decision and requires an interactive terminal.');
  const status = await engine.status();
  const request = file ? await inputJson(file) : {
    plan: status.artifacts.plan,
    report: status.artifacts.review_report,
    gaps: (gapsOption || await ask('부족한 근거·추가 검색 질문 (쉼표 구분): ')).split(',').map(value => value.trim()).filter(Boolean)
  };
  request.requested_by ||= await ask('요청자 이름 또는 식별자: ');
  await confirmHuman([
    '보완 수집 요청', bindingLine('계획서', request.plan), bindingLine('근거 검토 보고서', request.report),
    `- 보완할 근거: ${(request.gaps || []).join('; ')}`, '- 다음 단계: 같은 계획서에 대한 새 수집 승인'
  ], 'COLLECT');
  return engine.collectMore({ ...request, human_confirmed: true });
}

async function finalizeCommand(file) {
  if (!stdin.isTTY) throw new Error('Finalization is a human decision and requires an interactive terminal.');
  const status = await engine.status();
  const project = await projectDir(status);
  const manifestPath = `${project}/document-manifest.json`;
  const qualityPath = `${project}/quality-report.json`;
  const request = file ? await inputJson(file) : {
    plan: status.artifacts.plan,
    report: status.artifacts.review_report,
    quality_report: { path: qualityPath },
    document_manifest: { path: manifestPath },
    document_kind: documentOption || await ask('확인한 최종 문서 형식 (docx/hwpx): '),
    finalized_by: await ask('연구자 이름 또는 식별자: '),
    limitations: await ask('남은 한계·미확인 사항 (없다면 확인 후 "없음"): ')
  };
  if (!file) {
    const researchLabels = [
      ['evidence_reviewed', '주요 주장과 실제 문헌 근거를 대조했는지'],
      ['method_reviewed', '연구질문·자료·분석의 정합성을 검토했는지'],
      ['citations_reviewed', '본문 인용과 참고문헌을 양방향 대조했는지']
    ];
    request.research_checks = [];
    for (const [name, label] of researchLabels) {
      const result = await ask(`${label} (passed/failed): `);
      if (!['passed', 'failed'].includes(result)) throw new Error('검사 결과는 passed 또는 failed여야 합니다');
      const method = await ask('확인 방법: ');
      const evidence = await ask('실제 관찰 내용: ');
      request.research_checks.push({ name, result, method, evidence, checked_at: new Date().toISOString() });
    }
    const labels = [
      ['opened_in_application', '문서를 실제 앱에서 열었는지'],
      ['layout_reviewed', '전체 페이지·표·한글 레이아웃을 확인했는지'],
      ['content_compared', '문서 내용을 승인 원본 Markdown과 대조했는지']
    ];
    request.document_checks = [];
    for (const [name, label] of labels) {
      const result = await ask(`${label} (passed/failed): `);
      if (!['passed', 'failed'].includes(result)) throw new Error('검사 결과는 passed 또는 failed여야 합니다');
      const method = await ask('확인 방법: ');
      const evidence = await ask('실제 관찰 내용: ');
      request.document_checks.push({ name, result, method, evidence, checked_at: new Date().toISOString() });
    }
  }
  await confirmHuman([
    '최종본 확정', bindingLine('계획서', request.plan), bindingLine('검토 보고서', request.report),
    `- 최종 문서: ${request.document_kind}`, `- 남은 한계: ${request.limitations}`, `- 확정자: ${request.finalized_by}`
  ], 'FINALIZE');
  return engine.finalize({ ...request, human_confirmed: true });
}

async function reopenCommand() {
  if (!stdin.isTTY) throw new Error('Reopening a final workflow requires an interactive terminal.');
  const reason = reasonOption || await ask('최종본을 다시 여는 이유: ');
  await confirmHuman([`최종 확정 상태를 해제합니다.`, `- 이유: ${reason}`, '- 기존 확정 기록은 이력에 보존됩니다.'], 'REOPEN');
  return engine.reopen({ human_confirmed: true, reason });
}

function humanStatus(status) {
  const queued = status.tasks.filter(task => task.status === 'queued');
  const failed = status.tasks.filter(task => ['partial', 'failed'].includes(task.status));
  const expired = status.tasks.find(task => task.lease_expired);
  const video = status.branches?.video?.status || 'idle';
  const open = task => task.status === 'completed' && !task.superseded_by && ['plan', 'revise', 'video_render'].includes(task.stage);
  const pendingUse = status.tasks.find(task => open(task) && ['generated', 'automated_verified'].includes(task.completion_level));
  const next = expired ? `응답 기한이 지난 작업: ${expired.stage} (${expired.id}) → rok finish 또는 rok release`
    : pendingUse ? `검증 필요 (${pendingUse.completion_level}): ${pendingUse.stage} (${pendingUse.id}); 미통과면 rok rework ${pendingUse.id}`
    : status.current_stage === 'finalized' ? '최종본 확정됨 (새 근거로 다시 시작하려면 rok reopen)'
    : status.current_stage === 'finalization_stale' ? `최종본 해시 불일치: ${status.finalization?.stale_reason}; rok reopen 필요`
    : status.current_stage === 'collection_approval' && status.supplemental_collection?.status === 'approval_pending' ? `보완 수집 승인 필요: ${status.supplemental_collection.gaps.join('; ')} (rok approve collection)`
    : status.current_stage === 'collection_approval' && status.can_finalize ? '검토·보완본: 추가 수집을 승인하거나 근거와 문서를 확인한 뒤 rok finalize'
    : status.current_stage === 'collection_approval' ? '현재 계획서 수집 승인 필요 (rok approve collection)'
    : status.current_stage === 'revision_approval' ? '근거 반영 승인 또는 부족한 근거에 대한 rok collect-more 요청 필요'
      : queued.length ? `${queued[0].role} 에이전트의 ${queued[0].stage} 작업 전달`
        : failed.length ? `${failed[0].stage} 작업 retry (입력이 바뀌었으면 --rebind)`
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
  if (!queued.length) {
    const pending = status.tasks.find(task => task.status === 'running');
    if (pending) {
      const template = await engine.completionTemplate(pending.id);
      const next = pending.lease_expired ? `rok finish ${pending.id} | rok release ${pending.id} --reason "..."` : `rok finish ${pending.id}`;
      return { action: 'handoff_pending', task: pending, dispatch: await dispatch({ ...pending, token: template.token }), next };
    }
    return { action: 'wait', message: humanStatus(status), status };
  }
  const task = await engine.claim(queued[0].id, claimant);
  try {
    const delivery = await dispatch(task, { runApi: true });
    if (delivery.receipt) {
      const completed = await engine.complete(delivery.receipt);
      return { action: 'api_completed', task: completed, cloud_summary: delivery.summary, status: await engine.status() };
    }
    return { action: 'handoff_ready', task, dispatch: delivery, next: `rok finish ${task.id}` };
  } catch (error) {
    await engine.complete({ schema_version: 1, task_id: task.id, token: task.token, status: 'failed', artifacts: [], reason: error.message }).catch(() => {});
    throw error;
  }
}

async function finishInteractive(taskId) {
  const template = await engine.completionTemplate(taskId);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(`작업 ${taskId} (${template.stage}) 결과를 기록합니다. 실제 생성한 파일만 입력하세요.\n`);
    const status = (await rl.question('상태(completed/partial/failed): ')).trim();
    if (!['completed', 'partial', 'failed'].includes(status)) throw new Error('상태는 completed, partial, failed 중 하나여야 합니다');
    const artifacts = [];
    if (status !== 'failed') {
      for (const kind of template.required_kinds) {
        const file = (await rl.question(`${kind} 파일 경로${status === 'partial' ? ' (없으면 빈칸)' : ''}: `)).trim();
        if (file) artifacts.push({ kind, path: file });
        else if (status === 'completed' && !template.existing_artifacts.some(item => item.kind === kind)) throw new Error(`${kind} 파일이 필요합니다`);
      }
    }
    const reason = status === 'completed' ? '' : (await rl.question('부분 완료·실패 이유: ')).trim();
    if (status !== 'completed' && !reason) throw new Error('부분 완료·실패 이유가 필요합니다');
    return engine.complete({ schema_version: 1, task_id: taskId, token: template.token, status, artifacts, reason });
  } finally { rl.close(); }
}

async function verifyUseInteractive(taskId) {
  const status = await engine.status();
  const task = status.tasks.find(item => item.id === taskId);
  if (!task || !['plan', 'revise', 'video_render'].includes(task.stage)) throw new Error('실사용 검증 가능한 계획서·영상 작업을 선택하세요');
  const kind = task.stage === 'video_render' ? 'video' : 'plan';
  const artifact = task.artifacts.find(item => item.kind === (kind === 'video' ? 'video_file' : 'plan'));
  if (!artifact) throw new Error('검증할 산출물이 없습니다');
  const specification = { task_id: taskId, kind, artifact, project_dir: status.project_dir };
  if (kind === 'video') {
    const urlInput = createInterface({ input: stdin, output: stdout });
    try {
      specification.deployed_url = (await urlInput.question('영상 플레이어 HTTPS 주소: ')).trim();
      specification.media_url = (await urlInput.question('MP4 HTTPS 주소: ')).trim();
    } finally { urlInput.close(); }
  }
  const automatic = await engine.verifyUse(taskId, specification);
  if (automatic.completion_level !== 'automated_verified') return automatic;
  const names = kind === 'plan' ? [
    ['evidence_source_checked', '핵심 인용·근거를 원출처에서 대조'],
    ['method_alignment_reviewed', '연구질문별 자료·분석의 의미상 정합성 검토']
  ] : [
    ['browser_playback', '공개 주소에서 영상 재생'],
    ['seeking', '재생 위치 이동'],
    ['audio', '소리 직접 청취']
  ];
  if (!stdin.isTTY) throw new Error('Human use checks must be recorded by a person in an interactive terminal.');
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write('자동검사 통과. 아래 항목은 직접 확인한 결과만 기록하세요.\n');
    const verified_by = (await rl.question('확인자 이름 또는 식별자: ')).trim();
    if (!verified_by || verified_by.toLowerCase() === String(task.claimant || '').trim().toLowerCase()) throw new Error('작업 담당자와 다른 확인자가 필요합니다');
    const human_checks = [];
    for (const [name, label] of names) {
      const result = (await rl.question(`${label} (passed/failed/skip): `)).trim();
      if (result === 'skip') continue;
      if (!['passed', 'failed'].includes(result)) throw new Error('검사 결과는 passed, failed, skip 중 하나여야 합니다');
      const method = (await rl.question('확인 방법: ')).trim();
      const evidence = (await rl.question('실제 관찰 내용: ')).trim();
      if (!method || !evidence) throw new Error('확인 방법과 관찰 내용이 필요합니다');
      human_checks.push({ name, result, method, evidence, checked_at: new Date().toISOString() });
    }
    return engine.verifyUse(taskId, { ...specification, human_confirmation: { confirmed: true, verified_by, checked_at: new Date().toISOString() }, human_checks });
  } finally { rl.close(); }
}

async function verifyUseFromFile(taskId, file) {
  const specification = await inputJson(file);
  if (specification.human_confirmation || specification.human_checks?.length) {
    await confirmHuman([
      `실사용 검증 기록: ${taskId}`,
      `- 확인자: ${specification.human_confirmation?.verified_by || '(없음)'}`,
      ...(specification.human_checks || []).map(item => `- ${item.name}: ${item.result} (${item.method})`)
    ], 'VERIFIED');
  }
  return engine.verifyUse(taskId, specification);
}

function usage() {
  return [
    'rok run | resume | stop | doctor | bridge | blueprint --plan file [--previous blueprint.json] | preview video.mp4',
    'rok new [--answers answers.json]',
    'rok next | finish <task-id> | status [--json] | validate [--project dir] [--plan file] | export [--format docx|hwpx] [--plan file] [--output file]',
    'rok literature search --query "..." | rok literature ingest <pdf|hwp|hwpx> [--id literature-id]',
    'rok video request [--audience ... --duration 90 --aspect 16:9 --notes ...]',
    'rok init --profile generic|apa7|jqi | enqueue <request.json> | claim <task-id> | complete <receipt.json>',
    'rok approve <collection|revision|video> [approval.json] | verify-use <task-id> [verification.json]   (interactive terminal only)',
    'rok collect-more [--gaps "..."] | finalize [--document docx|hwpx] | reopen [--reason "..."]   (interactive terminal only)',
    'rok rework <task-id> [--feedback "..."]   (interactive terminal only) | release <task-id> [--reason "..."] | retry <task-id> [--rebind] [--root path]'
  ].join('\n');
}

try {
  let result;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    stdout.write(usage() + '\n');
    process.exit(0);
  } else if(command==='run'||command==='resume') result=await runWorkflow(root,{resume:command==='resume'});
  else if(command==='stop')result=await stopRun(root);
  else if(command==='doctor')result=await doctor(root);
  else if(command==='bridge'){await serveBridge(root);process.exit(0);}
  else if(command==='blueprint'){const status=await engine.status();result=await createBlueprint(root,planOption||status.artifacts.plan?.path,{previous:previousOption});}
  else if(command==='preview'){const preview=await previewVideo(root,args[0]);stdout.write(preview.url+'\n');await new Promise(()=>{});}
  else if (command === 'new') {
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
  else if (command === 'finish') result = await finishInteractive(args[0]);
  else if (command === 'approve') result = await approveCommand(args[0], args[1]);
  else if (command === 'verify-use') result = args[1] ? await verifyUseFromFile(args[0], args[1]) : await verifyUseInteractive(args[0]);
  else if (command === 'status') result = await engine.status();
  else if (command === 'retry') result = await engine.retry(args[0], { rebind });
  else if (command === 'release') result = await engine.release(args[0], reasonOption);
  else if (command === 'rework') result = await reworkCommand(args[0]);
  else if (command === 'collect-more') result = await collectMoreCommand(args[0]);
  else if (command === 'finalize') result = await finalizeCommand(args[0]);
  else if (command === 'reopen') result = await reopenCommand();
  else if (command === 'literature' && args[0] === 'search') {
    await engine.collectionGate();
    const status = await engine.status();
    result = await searchLiterature(root, await projectDir(status), queryOption || args.slice(1).join(' '));
  } else if (command === 'literature' && args[0] === 'ingest') {
    await engine.collectionGate();
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
