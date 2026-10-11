// Quality grader "{{name}}": is the output good? Do not look at price here.
// Register it in eval.config.js under `graders.quality`.
//
// Deterministic check, regex, schema validation or an LLM judge are all fine.
// For an LLM judge follow RUBRIC.md: use a different model than the one under test,
// temperature 0, written criteria, and call it through `ctx.llm` so it is tracked:
//
//   import * as judge from '../../models/my-judge.js';
//   ...
//   const call = await llm(judge, { system: CRITERIA, messages: [{ role: 'user', content: `...${output}` }] });
//   const { score, reason } = JSON.parse(call.response.content);

/** @type {import('../../contracts.js').Grader} */
export const grader = {
  id: '{{name}}',
  weight: 1,

  async grade({ case: testCase, output, session, llm }) {
    // `output` is the model's final answer; `session` holds every call made (prompts,
    // tool calls, tokens); `testCase.expected` is optional.
    throw new Error('quality grader "{{name}}" is not implemented yet');
  },
};
