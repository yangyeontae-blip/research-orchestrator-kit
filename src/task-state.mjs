// Pure helpers over the workflow state and task records; none of them touch the file system.
const now = () => new Date().toISOString();

export const leaseExpired = (task) =>
  task.status === 'running' && Boolean(task.lease_expires_at) && Date.parse(task.lease_expires_at) <= Date.now();

export function assertRoleFree(state, task) {
  const busy = state.tasks.find((item) => item.id !== task.id && item.role === task.role && item.status === 'running');
  if (busy) throw new Error(`Role is busy: ${task.role} (task ${busy.id}; finish it or run rok release ${busy.id})`);
}

export function expireLeases(state, role) {
  for (const task of state.tasks) {
    if (task.role === role && leaseExpired(task))
      failTask(state, task, `Lease expired at ${task.lease_expires_at} without a receipt`, 'lease_expired');
  }
}

export function failTask(state, task, reason, event) {
  task.status = 'failed';
  task.reason = reason;
  task.token = null;
  task.completed_at = now();
  if (task.branch === 'video')
    state.branches.video = { ...state.branches.video, status: `${task.stage}_failed`, task_id: task.id };
  else state.current_stage = `${task.stage}_failed`;
  state.errors.push({ task_id: task.id, stage: task.stage, status: 'failed', reason, at: now() });
  state.history.push({ event, task_id: task.id, stage: task.stage, at: now() });
}

export function findArtifact(task, kind) {
  const artifact = (task.artifacts || []).find((item) => item.kind === kind);
  if (!artifact) throw new Error(`${task.stage} completion requires artifact kind: ${kind}`);
  return artifact;
}

export function mergeArtifacts(current, incoming) {
  const merged = [...current];
  for (const item of incoming) {
    const index = merged.findIndex((existing) => existing.kind === item.kind && existing.path === item.path);
    if (index >= 0) merged[index] = item;
    else merged.push(item);
  }
  return merged;
}

export function sameBinding(actual, expected, message) {
  if (!expected || actual.path !== expected.path || actual.sha256 !== expected.sha256) throw new Error(message);
}

export function publicTask(task) {
  const { token, key, ...safe } = task;
  return safe;
}
