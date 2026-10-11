// A cost grader answers one question: "was this affordable?"
// It must not look at whether the answer was right.
//
// The runner already priced every call (tokens x the model's `pricing`, or the cost
// your harness reported). This grader only turns the model-under-test's spend into a score:
// 1 = free, 0 = at or over budget, linear in between. Orchestrator and grader spend is
// eval overhead; it is recorded in the results but not scored here.
// Swap this for latency, tool-call count, or anything else you pay for.

const DEFAULT_BUDGET_USD = 0.01; // used when neither the case nor the task sets one

/** @type {import('../../contracts.js').Grader} */
export const grader = {
  id: 'token-cost',
  weight: 1,

  grade({ task, case: testCase, session }) {
    const spend = session.totals.byRole.model;
    const costUsd = spend?.costUsd ?? 0;
    const budget = testCase.budgetUsd ?? task.budgetUsd ?? DEFAULT_BUDGET_USD;
    const score = Math.max(0, Math.min(1, 1 - costUsd / budget));
    return {
      score,
      reason: `$${costUsd.toFixed(6)} of $${budget} budget (${spend?.inputTokens ?? 0} in / ${spend?.outputTokens ?? 0} out)`,
      data: { costUsd },
    };
  },
};
