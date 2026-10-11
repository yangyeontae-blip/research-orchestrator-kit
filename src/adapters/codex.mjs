import { buildHandoff } from '../handoff.mjs';

export function codexDispatch(task, agentConfig = {}) {
  const handoff = buildHandoff(task);
  return {
    provider: 'codex',
    target: agentConfig.target || null,
    message: [
      `Research Orchestrator task ${task.id}`,
      `Workflow: ${task.workflow_id}`,
      `Role: ${task.role}`,
      `Stage: ${task.stage}`,
      `Cycle: ${task.cycle}`,
      `Goal: ${handoff.goal}`,
      `User decisions: ${handoff.user_decisions.length ? handoff.user_decisions.join(' | ') : 'None recorded'}`,
      `Input versions: ${handoff.input_versions.map(item => `${item.path} (${item.sha256})`).join(', ')}`,
      `Unresolved: ${handoff.unresolved.length ? handoff.unresolved.join(' | ') : 'None recorded'}`,
      `Next action: ${handoff.next_action}`,
      `Completion conditions: ${handoff.completion_conditions.join(' | ')}`,
      task.plan ? `Plan: ${task.plan.path} (${task.plan.sha256})` : '',
      task.context ? `Context: ${task.context}` : '',
      'Return a receipt JSON that follows schemas/receipt.schema.json. Do not start the next stage yourself.'
    ].filter(Boolean).join('\n')
  };
}
