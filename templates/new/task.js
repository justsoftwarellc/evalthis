// Task "{{name}}": a declarative object. What the model is asked, with which cases.
// Register it in eval.config.js under `tasks`.

/** @type {import('../contracts.js').Task} */
export const task = {
  id: '{{name}}',
  description: 'TODO: one sentence on what a good answer looks like.',

  // Optional: how the orchestrator should run this task (follow-ups, stopping rule...).
  // instructions: '...',
  // Optional: system prompt and tools for the model under test.
  // system: '...',
  // tools: [{ name: '...', description: '...', parameters: { type: 'object', properties: {} }, execute: async (args) => '...' }],

  // Per-case spend you consider acceptable, in USD (cost graders score against it).
  budgetUsd: 0.01,

  cases: [
    // `input` is given to the orchestrator; it can be a string or an object.
    // `expected` stays hidden from the orchestrator and the model; only graders see it.
    { id: 'case-1', input: 'TODO', expected: 'TODO' },
  ],
};
