import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../../src/engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workDirName = `.research-work/demo-${Date.now()}`;
const engine = new Engine(root, { workDirName });
const rel = value => `examples/synthetic/${value}`;

const state = await engine.init({ profile: 'generic' });
await engine.enqueue({
  schema_version: 1,
  request_id: 'demo-study',
  workflow_id: state.workflow_id,
  stage: 'study',
  inputs: [{ kind: 'study_input', path: rel('inputs/study-session.md') }]
});

let status = await engine.status();
let task = status.tasks.find(item => item.stage === 'study');
let claimed = await engine.claim(task.id, 'demo-study-agent');
await engine.complete({
  schema_version: 1,
  task_id: task.id,
  token: claimed.token,
  status: 'completed',
  handoff_state: 'ready',
  artifacts: [{ kind: 'study_record', path: rel('outputs/study-record.md') }]
});

status = await engine.status();
task = status.tasks.find(item => item.stage === 'plan');
claimed = await engine.claim(task.id, 'demo-research-agent');
await engine.complete({
  schema_version: 1,
  task_id: task.id,
  token: claimed.token,
  status: 'completed',
  artifacts: [{ kind: 'plan', path: rel('outputs/plan-v1.md') }]
});

status = await engine.status();
await engine.approve('collection', {
  schema_version: 1,
  workflow_id: status.workflow_id,
  human_confirmed: true,
  approved_by: 'synthetic-demo',
  plan: status.artifacts.plan
});

status = await engine.status();
task = status.tasks.find(item => item.stage === 'literature');
claimed = await engine.claim(task.id, 'demo-literature-agent');
await engine.complete({
  schema_version: 1,
  task_id: task.id,
  token: claimed.token,
  status: 'completed',
  artifacts: [
    { kind: 'collection_report', path: rel('outputs/collection-report.md') },
    { kind: 'parsed_text', path: rel('outputs/parsed-notes.md') }
  ]
});

status = await engine.status();
task = status.tasks.find(item => item.stage === 'review');
claimed = await engine.claim(task.id, 'demo-research-agent');
await engine.complete({
  schema_version: 1,
  task_id: task.id,
  token: claimed.token,
  status: 'completed',
  artifacts: [{ kind: 'review_report', path: rel('outputs/evidence-review.md') }]
});

status = await engine.status();
await engine.approve('revision', {
  schema_version: 1,
  workflow_id: status.workflow_id,
  human_confirmed: true,
  approved_by: 'synthetic-demo',
  plan: status.artifacts.plan,
  report: status.artifacts.review_report,
  approved_items: ['R1', 'R2']
});

status = await engine.status();
task = status.tasks.find(item => item.stage === 'revise');
claimed = await engine.claim(task.id, 'demo-research-agent');
await engine.complete({
  schema_version: 1,
  task_id: task.id,
  token: claimed.token,
  status: 'completed',
  artifacts: [{ kind: 'plan', path: rel('outputs/plan-v2.md') }]
});

status = await engine.status();
process.stdout.write(JSON.stringify({
  ok: status.current_stage === 'collection_approval' && status.cycle === 2,
  work_state: `${workDirName}/state.json`,
  workflow_id: status.workflow_id,
  current_stage: status.current_stage,
  cycle: status.cycle,
  completed_tasks: status.tasks.filter(item => item.status === 'completed').length
}, null, 2) + '\n');
