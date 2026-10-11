// The orchestrator is the LLM that runs each eval session: it talks to the model
// under test (via the runner's `prompt_model` tool) and ends with `finish`.
// It is declared exactly like a model: `model` + `harness`, plus optional `instructions`.
//
// This one is a deterministic script, not an LLM, so evals run offline. It sends the
// case input once, then finishes. For real work, swap in an LLM
// (`evalthis add orchestrator <name>`) when a task needs follow-ups, multi-turn
// conversations or adaptive prompting.

/** @type {import('../contracts.js').Model} */
export const model = { id: 'scripted', provider: 'local', name: 'scripted' };

/** @type {import('../contracts.js').Harness} */
export const harness = {
  name: 'scripted',

  async call({ messages, meta }) {
    const alreadyAsked = messages.some((m) => m.role === 'tool' && m.name === 'prompt_model');
    if (!alreadyAsked) {
      const { input } = meta.case;
      const prompt = typeof input === 'string' ? input : JSON.stringify(input);
      return { content: '', toolCalls: [{ id: 'ask', name: 'prompt_model', arguments: { prompt } }] };
    }
    const summary = `Sent case "${meta.case.id}" to the model once and collected its answer.`;
    return { content: '', toolCalls: [{ id: 'done', name: 'finish', arguments: { summary } }] };
  },
};
