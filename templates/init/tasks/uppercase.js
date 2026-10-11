// A task is a declarative object: what the model is asked, with which cases.
// It says nothing about which model answers or how it is graded.
// `expected` is optional and is never shown to the orchestrator or the model.

/** @type {import('../contracts.js').Task} */
export const task = {
  id: 'uppercase',
  description: 'Return the input in upper case.',

  // Optional: guidance for the orchestrator on how to run this task.
  // instructions: 'Send the input as-is. If the answer has extra commentary, ask once for only the result.',

  // Optional: a system prompt for the model under test, and tools it may call.
  // system: 'You are a text transformer. Reply with the result only.',
  // tools: [{ name: 'lookup', description: '...', parameters: { type: 'object', properties: {} }, execute: async (args) => '...' }],

  // Per-case spend you consider acceptable, in USD. Cost graders score against it.
  budgetUsd: 0.001,

  cases: [
    { id: 'simple', input: 'hello', expected: 'HELLO' },
    { id: 'sentence', input: 'Evals should be boring.', expected: 'EVALS SHOULD BE BORING.' },
    { id: 'empty', input: ' ', expected: ' ' },
  ],
};
