// A quality grader answers one question: "is this output good?"
// It must not look at price. Cost is the cost graders' job.
//
// Prefer deterministic checks like this one wherever the task allows. Reach for
// an LLM judge only for qualities code cannot check: call it with `ctx.llm(judge, request)`
// so its tokens and cost are tracked (see RUBRIC.md).

/** @type {import('../../contracts.js').Grader} */
export const grader = {
  id: 'exact-match',
  weight: 1,

  grade({ case: testCase, output }) {
    if (testCase.expected === undefined) {
      return { score: 0, reason: 'case has no `expected` value to compare against' };
    }
    const ok = output === testCase.expected;
    return {
      score: ok ? 1 : 0,
      reason: ok ? 'output equals expected' : `got ${JSON.stringify(output)}, want ${JSON.stringify(testCase.expected)}`,
    };
  },
};
