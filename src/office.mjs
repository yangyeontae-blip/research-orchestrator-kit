import * as fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { Engine } from './engine.mjs';

const MAIN_STAGES = ['study', 'plan', 'collection_approval', 'literature', 'review', 'revision_approval', 'revise'];
const LABELS = {
  study: '공부', plan: '연구 초안', collection_approval: '수집 승인', literature: '문헌 수집·파싱',
  review: '근거 검토', revision_approval: '반영 승인', revise: '보완본',
  video_storyboard: '영상 구성', video_render: '영상 제작'
};
const PUBLIC_STATUSES = new Set(['queued', 'running', 'completed', 'partial', 'failed', 'waiting', 'reserved', 'sent']);
const stageFor = stage => ({ collect: 'literature', parse: 'literature', revision: 'revise' })[stage] || stage;
const visibleTask = task => ({
  stage: stageFor(task.stage), role: task.role, status: PUBLIC_STATUSES.has(task.status) ? task.status : 'unknown',
  completion_level: task.completion_level || null, updated_at: task.completed_at || task.claimed_at || task.created_at || null
});

function snapshotFromTasks(tasks, currentStage, options = {}) {
  const latest = new Map();
  for (const task of tasks) latest.set(stageFor(task.stage), task);
  const currentIndex = MAIN_STAGES.indexOf(currentStage);
  return {
    source: options.source,
    title: options.title,
    profile: options.profile || null,
    workflow: options.workflow || null,
    current_stage: currentStage,
    updated_at: options.updated_at || null,
    stages: MAIN_STAGES.map((stage, index) => {
      const task = latest.get(stage);
      const status = task?.status || (stage === currentStage ? 'waiting' : currentIndex > index ? 'completed' : 'not_started');
      return { id: stage, label: LABELS[stage], status, completion_level: task?.completion_level || null };
    }),
    tasks: tasks.slice(-12).map(visibleTask),
    video: options.video || 'idle',
    note: options.note || '파일 원장 상태만 표시합니다. 채팅 활동·연구 결과의 완료를 추정하지 않습니다.'
  };
}

export async function readOfficeSnapshot(root, options = {}) {
  if (options.legacyRoot) {
    const project = path.resolve(options.legacyRoot);
    const ledger = JSON.parse(await fs.readFile(path.join(project, '운영', '기획팀장 상태.json'), 'utf8'));
    if (path.resolve(ledger.project_root || '') !== project) throw new Error('Legacy ledger belongs to another project');
    const jobs = new Map();
    for (const task of ledger.tasks || []) {
      const key = String(task.job_id || task.id || 'unknown');
      if (!jobs.has(key)) jobs.set(key, []);
      jobs.get(key).push(task);
    }
    const candidates = [...jobs.entries()].filter(([id, tasks]) =>
      !id.startsWith('TEST-') && tasks.some(task => !['completed', 'stopped', 'cancelled'].includes(task.status)));
    candidates.sort((a, b) => String(b[1].at(-1)?.created_at || '').localeCompare(String(a[1].at(-1)?.created_at || '')));
    const selected = candidates[0];
    const tasks = selected?.[1] || [];
    const active = tasks.find(task => ['running', 'queued', 'reserved', 'sent', 'waiting', 'partial', 'failed'].includes(task.status));
    const current = stageFor(active?.stage || (tasks.at(-1)?.stage || 'study'));
    return snapshotFromTasks(tasks, current, {
      source: '이 연구 프로젝트의 기획팀장 원장만', title: '기획팀장 연구 작업실',
      workflow: selected?.[0] || null, updated_at: ledger.updated_at,
      note: selected ? '선택된 실제 작업의 원장 단계입니다. 채팅 실행 여부는 별도 확인이 필요합니다.'
        : '현재 진행 중인 실제 연구 작업이 없습니다. 완료된 TEST와 다른 AI 채팅은 표시하지 않습니다.'
    });
  }
  let state;
  try { state = await new Engine(root).status(); }
  catch (error) {
    if (/not initialized/i.test(error.message)) return snapshotFromTasks([], 'study', {
      source: '이 저장소의 .research-work/state.json만', title: 'Research Orchestrator Kit',
      note: '아직 연구가 시작되지 않았습니다. rok new로 연구 아이디어를 등록하세요.'
    });
    throw error;
  }
  let title = 'Research Orchestrator Kit';
  if (state.project_dir) {
    const brief = path.resolve(root, state.project_dir, 'research-brief.json');
    try { title = JSON.parse(await fs.readFile(brief, 'utf8')).title || title; }
    catch { /* A missing brief must not hide workflow status. */ }
  }
  const currentStage = state.current_stage.replace(/_(?:use_verification|partial|failed)$/, '');
  return snapshotFromTasks(state.tasks, currentStage, {
    source: '이 저장소의 .research-work/state.json만', title, profile: state.profile,
    workflow: state.workflow_id, updated_at: state.updated_at,
    video: state.branches?.video?.status || 'idle'
  });
}

export function officeHtml(prefix) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ROK 픽셀 작업실</title><style>
  :root{font-family:system-ui,sans-serif;color:#e9f1f5;background:#101927}*{box-sizing:border-box}
  body{max-width:1120px;margin:0 auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px;align-items:start}
  h1{font-size:30px;margin:0 0 7px}small,.muted{color:#aab9c7}.tag{padding:5px 10px;border:2px solid #55c7b2;background:#19363c;color:#a7fff0;font-size:12px}
  .room{margin:22px 0;padding:18px;border:4px solid #7685a4;background:linear-gradient(#22324a 48%,#303b49 48%);box-shadow:8px 8px 0 #05090f}
  .roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.role{min-height:120px;padding:12px;border:3px solid #7f93a7;background:#1b2637;box-shadow:4px 4px 0 #10151e}
  .avatar{display:block;width:28px;height:28px;margin-bottom:13px;border:5px solid #f2ce81;background:#73546a;box-shadow:4px 0 #27354a,-4px 0 #27354a}.role b{display:block}.role span{font-size:13px;color:#d1dce7}
  .flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}.stage{padding:15px;border:2px solid #6e8497;background:#1a2839;min-height:84px}
  .stage strong{display:block;margin-bottom:8px}.stage em{font-style:normal;font-size:13px;color:#aab9c7}.stage.completed{border-color:#55c7b2}.stage.running{border-color:#f8ca6d}.stage.failed,.stage.partial{border-color:#ef8181}.stage.waiting{border-color:#8eb6ff}
  ul{padding-left:20px}li{margin:6px 0}.warn{background:#283140;border-left:4px solid #f8ca6d;padding:12px}footer{margin-top:28px;color:#aab9c7;font-size:13px}
  </style></head><body><header><div><h1>ROK 픽셀 작업실</h1><div id="title" class="muted">원장을 읽는 중</div></div><div class="tag">이 오케스트레이션 전용</div></header>
  <section class="room"><div class="roles" id="roles"></div></section><h2>연구 흐름</h2><div class="flow" id="flow"></div>
  <h2>최근 인계</h2><ul id="tasks"></ul><p class="warn" id="note"></p><footer><span id="source"></span> · 2초마다 원장 갱신 · 읽기 전용 · 다른 AI 세션 탐색 없음</footer>
  <script>const prefix=${JSON.stringify(prefix)};const roles=[['orchestrator','기획팀장'],['study','공부'],['research','연구'],['literature','문헌'],['video','영상']];
  const names={queued:'대기',running:'진행',completed:'작업 제출',partial:'부분 완료',failed:'오류',waiting:'승인·응답 대기',reserved:'예약',sent:'전달',not_started:'시작 전',unknown:'확인 필요'};
  function node(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e}
  async function refresh(){try{const r=await fetch(prefix+'status',{cache:'no-store'});if(!r.ok)throw Error('원장 읽기 실패');const s=await r.json();
    document.getElementById('title').textContent=s.title+(s.profile?' · '+s.profile:'');document.getElementById('source').textContent=s.source;
    const room=document.getElementById('roles');room.replaceChildren();for(const [id,label] of roles){const task=[...s.tasks].reverse().find(t=>t.role===id);const box=node('div','role');box.append(node('i','avatar'),node('b','',label),node('span','',task?(names[task.status]||task.status):'대기'));room.append(box)}
    const flow=document.getElementById('flow');flow.replaceChildren();for(const stage of s.stages){const box=node('div','stage '+stage.status);box.append(node('strong','',stage.label),node('em','',names[stage.status]||stage.status));flow.append(box)}
    const list=document.getElementById('tasks');list.replaceChildren();for(const task of s.tasks.slice(-7).reverse())list.append(node('li','',(names[task.status]||task.status)+' · '+(task.role||'?')+' · '+(task.stage||'?')+(task.completion_level?' · '+task.completion_level:'')));
    if(!s.tasks.length)list.append(node('li','','등록된 진행 작업 없음'));document.getElementById('note').textContent=s.note;
  }catch(e){document.getElementById('note').textContent='원장을 읽지 못했습니다: '+e.message}}
  refresh();setInterval(refresh,2000);</script></body></html>`;
}

export async function startOffice(root, options = {}) {
  const secret = options.secret || randomBytes(20).toString('hex');
  if (!/^[a-f0-9]{40}$/.test(secret)) throw new Error('Office secret must be 40 hex characters');
  const prefix = `/${secret}/`;
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'");
    const host = request.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host) || !request.url?.startsWith(prefix)) {
      response.writeHead(404).end(); return;
    }
    try {
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      if (request.url === prefix) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(officeHtml(prefix)); return;
      }
      if (request.url === prefix + 'status') {
        const snapshot = await readOfficeSnapshot(root, options);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(snapshot)); return;
      }
      response.writeHead(404).end();
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: '원장을 읽지 못했습니다.' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` };
}
