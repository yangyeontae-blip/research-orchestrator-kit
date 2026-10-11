import { buildHandoff } from '../handoff.mjs';
export function manualDispatch(task) {
  return {
    provider: 'manual',
    instruction: `Give task ${task.id} to the ${task.role} agent and complete it with a receipt JSON.`,
    handoff: buildHandoff(task)
  };
}
