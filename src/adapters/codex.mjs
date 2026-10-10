export function codexDispatch(task, agentConfig = {}) {
  return {
    provider: 'codex',
    target: agentConfig.target || null,
    message: [
      `Research Orchestrator task ${task.id}`,
      `Workflow: ${task.workflow_id}`,
      `Role: ${task.role}`,
      `Stage: ${task.stage}`,
      `Cycle: ${task.cycle}`,
      `Inputs: ${task.inputs.map(item => `${item.path} (${item.sha256})`).join(', ')}`,
      task.plan ? `Plan: ${task.plan.path} (${task.plan.sha256})` : '',
      task.context ? `Context: ${task.context}` : '',
      'Return a receipt JSON that follows schemas/receipt.schema.json. Do not start the next stage yourself.'
    ].filter(Boolean).join('\n')
  };
}
