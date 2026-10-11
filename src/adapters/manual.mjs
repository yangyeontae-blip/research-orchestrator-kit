import { buildHandoff } from '../handoff.mjs';
export function manualDispatch(task) {
  return {
    provider: 'manual',
    instruction: `Give task ${task.id} (token ${task.token}) to the ${task.role} agent. Record actual files with rok finish ${task.id}, or submit a receipt JSON.`,
    handoff: buildHandoff(task)
  };
}
