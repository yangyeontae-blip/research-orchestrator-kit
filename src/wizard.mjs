import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Engine } from './engine.mjs';
import { SchemaRegistry } from './schemas.mjs';
import { isoNow, slugify, writeJson } from './utils.mjs';

const choices = {
  profile: ['apa7', 'jqi', 'generic'],
  entry_mode: ['study_then_plan', 'direct_plan'],
  apa_paper_type: ['student', 'professional', 'not_applicable']
};

function normalizeAnswers(value) {
  const answers = { ...value };
  if (!choices.profile.includes(answers.profile)) throw new Error('profile must be apa7, jqi, or generic');
  if (!choices.entry_mode.includes(answers.entry_mode)) throw new Error('entry_mode must be study_then_plan or direct_plan');
  answers.apa_paper_type = answers.profile === 'apa7' ? (answers.apa_paper_type || 'student') : 'not_applicable';
  if (!choices.apa_paper_type.includes(answers.apa_paper_type)) throw new Error('Invalid APA paper type');
  if (!answers.title?.trim() || !answers.idea?.trim() || !answers.method?.trim()) throw new Error('title, idea, and method are required');
  answers.deadline = answers.deadline?.trim() || null;
  answers.institution_guidance = answers.institution_guidance?.trim() || '';
  answers.sensitive_information = answers.sensitive_information === true || /^(y|yes|예)$/i.test(String(answers.sensitive_information));
  return answers;
}

export async function promptResearchBrief(options = {}) {
  const rl = options.readline || createInterface({ input, output });
  const own = !options.readline;
  try {
    const ask = async (question, fallback = '') => (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;
    const profile = await ask('형식(apa7/jqi/generic)', 'generic');
    return normalizeAnswers({
      title: await ask('연구 제목 또는 짧은 이름'),
      idea: await ask('연구 아이디어'),
      profile,
      entry_mode: await ask('시작 방식(study_then_plan/direct_plan)', 'direct_plan'),
      method: await ask('연구방법', '질적 연구'),
      deadline: await ask('마감일(YYYY-MM-DD, 없으면 빈칸)'),
      institution_guidance: await ask('제출기관 또는 지도교수 지침(없으면 빈칸)'),
      sensitive_information: await ask('민감정보가 포함됩니까?(yes/no)', 'no'),
      apa_paper_type: profile === 'apa7' ? await ask('APA 원고 유형(student/professional)', 'student') : 'not_applicable'
    });
  } finally {
    if (own) rl.close();
  }
}

export async function createResearchProject(root, rawAnswers, options = {}) {
  const answers = normalizeAnswers(rawAnswers);
  const projectId = options.projectId || slugify(answers.title);
  const projectDir = path.join(root, 'workspace', projectId);
  await fs.mkdir(path.join(root, 'workspace'), { recursive: true });
  await fs.mkdir(projectDir, { recursive: false }).catch(error => {
    if (error.code === 'EEXIST') throw new Error(`Project already exists: workspace/${projectId}`);
    throw error;
  });
  const engine = options.engine || new Engine(root);
  const state = await engine.init({ profile: answers.profile, project_dir: `workspace/${projectId}` });
  const brief = {
    schema_version: 1,
    project_id: projectId,
    workflow_id: state.workflow_id,
    title: answers.title.trim(),
    idea: answers.idea.trim(),
    profile: answers.profile,
    entry_mode: answers.entry_mode,
    method: answers.method.trim(),
    deadline: answers.deadline,
    institution_guidance: answers.institution_guidance,
    sensitive_information: answers.sensitive_information,
    apa_paper_type: answers.apa_paper_type,
    created_at: isoNow()
  };
  await new SchemaRegistry(root).assert('research-brief', brief);
  const briefPath = path.join(projectDir, 'research-brief.json');
  await writeJson(briefPath, brief);
  await writeJson(path.join(projectDir, 'literature-manifest.json'), {
    schema_version: 1, project_id: projectId, searches: [], items: [], updated_at: isoNow()
  });
  await writeJson(path.join(projectDir, 'claim-ledger.json'), {
    schema_version: 1, project_id: projectId, plan_sha256: null, claims: [], updated_at: isoNow()
  });
  const inputName = answers.entry_mode === 'study_then_plan' ? 'study-input.md' : 'research-idea.md';
  const inputPath = path.join(projectDir, inputName);
  await fs.writeFile(inputPath, [
    `# ${brief.title}`,
    '',
    '## 연구 아이디어',
    brief.idea,
    '',
    '## 연구방법',
    brief.method,
    '',
    '## 제출 조건',
    brief.institution_guidance || '미정',
    '',
    `- 마감일: ${brief.deadline || '미정'}`,
    `- 민감정보 포함 가능성: ${brief.sensitive_information ? '있음' : '없음'}`,
    `- 계획서 프로필: ${brief.profile}`,
    `- APA 원고 유형: ${brief.apa_paper_type}`,
    ''
  ].join('\n'), 'utf8');
  const relative = path.relative(root, inputPath).split(path.sep).join('/');
  const task = await engine.enqueue({
    schema_version: 1,
    request_id: `${projectId}-${answers.entry_mode === 'study_then_plan' ? 'study' : 'plan'}-1`,
    workflow_id: state.workflow_id,
    stage: answers.entry_mode === 'study_then_plan' ? 'study' : 'plan',
    inputs: [{ kind: answers.entry_mode === 'study_then_plan' ? 'study_input' : 'research_idea', path: relative }],
    context: `Research brief: workspace/${projectId}/research-brief.json`
  });
  return { brief, project_dir: `workspace/${projectId}`, first_task: task };
}
