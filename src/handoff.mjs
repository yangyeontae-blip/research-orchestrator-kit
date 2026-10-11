const STAGES = Object.freeze({
  study: ['Record the study and possible research connection.', 'Return a study record and its handoff state.'],
  plan: ['Draft a proposal from the supplied research inputs.', 'Return the plan and profile-required support artifacts.'],
  literature: ['Collect and parse approved literature.', 'Return a collection report and parsed text, or a partial receipt with the exact failure.'],
  review: ['Compare the plan claims with collected evidence.', 'Return an evidence review report with verified locations and remaining gaps.'],
  revise: ['Apply only the approved review items to a new plan version.', 'Return a new plan and profile-required support artifacts.'],
  video_storyboard: ['Map the approved plan into a research-flow storyboard.', 'Return a storyboard and source map without invented results.'],
  video_render: ['Render the approved storyboard and perform technical checks.', 'Return the video file and a manifest bound to the approved inputs.']
});

export function buildHandoff(task) {
  const [goal, completion] = STAGES[task.stage] || ['Complete the assigned stage.', 'Return a receipt with verifiable artifacts.'];
  const input_versions = [...(task.inputs || []), ...(task.plan ? [task.plan] : []), ...(task.report ? [task.report] : [])]
    .filter((item, index, all) => all.findIndex(candidate => candidate.path === item.path && candidate.sha256 === item.sha256) === index)
    .map(item => ({ path: item.path, sha256: item.sha256, kind: item.kind || 'artifact' }));
  return {
    goal,
    user_decisions: task.user_decisions || [],
    input_versions,
    unresolved: task.unresolved_items || [],
    next_action: task.context || goal,
    completion_conditions: [completion, 'Record exact output paths and SHA-256 in a receipt; do not start the next stage.']
  };
}
