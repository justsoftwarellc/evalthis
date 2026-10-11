// Cost grader "{{name}}": was it affordable? Do not look at correctness here.
// Register it in eval.config.js under `graders.cost`.
//
// The runner already priced every call: read it from `session.totals` (e.g.
// `session.totals.byRole.model.costUsd`, `.latencyMs`, `.totalTokens`, `.toolCalls`).
// Return 1 for "as cheap as it gets" and 0 for "unacceptable".

/** @type {import('../../contracts.js').Grader} */
export const grader = {
  id: '{{name}}',
  weight: 1,

  grade({ task, case: testCase, session }) {
    // Example: latency of the model under test against a 2s budget.
    //   const { latencyMs } = session.totals.byRole.model;
    //   return { score: Math.max(0, 1 - latencyMs / 2000), reason: `${latencyMs}ms of 2000ms`, data: { latencyMs } };
    throw new Error('cost grader "{{name}}" is not implemented yet');
  },
};
