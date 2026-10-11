import { buildHandoff } from '../handoff.mjs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export async function claudeDispatch(root, task, agentConfig = {}) {
  const relativeInbox = agentConfig.inbox || '.research-work/claude';
  const inbox = path.resolve(root, relativeInbox);
  const relative = path.relative(root, inbox);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Claude inbox must stay inside the project root');
  await fs.mkdir(inbox, { recursive: true });
  const target = path.join(inbox, `${task.id}.request.json`);
  const payload = {
    schema_version: 1,
    task_id: task.id,
    workflow_id: task.workflow_id,
    role: task.role,
    stage: task.stage,
    cycle: task.cycle,
    inputs: task.inputs,
    plan: task.plan,
    context: task.context,
    handoff: buildHandoff(task),
    receipt_schema: 'schemas/receipt.schema.json'
  };
  await fs.writeFile(target, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { provider: 'claude', handoff_file: path.relative(root, target).split(path.sep).join('/') };
}
