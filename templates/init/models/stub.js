// A placeholder model so `node evals/runner/run.js` works before you have an API key.
// Replace it, or delete it, once you add a real model (`evalthis add model <name>`).
//
// A model file has exactly two named exports:
//   model    WHAT is called  (data: id, provider, name, pricing, params)
//   harness  HOW it is called (code: the SDK or gateway; aisdk, portkey, bifrost, ...)

/** @type {import('../contracts.js').Model} */
export const model = {
  id: 'stub',
  provider: 'local',
  name: 'upper-caser',
  // USD per million tokens. The runner prices every call to this model with it.
  pricing: { inputPerMTok: 1, outputPerMTok: 2 },
};

/** @type {import('../contracts.js').Harness} */
export const harness = {
  name: 'stub',

  async call({ messages }) {
    const prompt = messages.findLast((m) => m.role === 'user').content;
    const content = prompt.toUpperCase();
    return {
      content,
      // Report real token counts from your provider's response when you have them.
      usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil(content.length / 4) },
    };
  },
};
