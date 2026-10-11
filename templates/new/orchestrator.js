// Orchestrator "{{name}}": the LLM that runs each eval session. Declared exactly like a model.
// Register it in eval.config.js as `orchestrator`.
//
// The runner gives it two tools and drives the loop:
//   prompt_model({prompt})  send a prompt to the model under test; returns its final answer
//   finish({summary})       end the session
// It also receives the task description and the case input as its first user message.
// Its tokens and cost are tracked as "orchestrator" calls and kept out of the model-under-test totals.

/** @type {import('../contracts.js').Model} */
export const model = {
  id: '{{name}}',
  provider: 'TODO', //            e.g. 'anthropic'
  name: 'TODO', //                the provider's model id
  pricing: { inputPerMTok: 0, outputPerMTok: 0 }, // USD per million tokens (optional: cachedInputPerMTok, reasoningPerMTok)
  params: { temperature: 0 },
};

/** @type {import('../contracts.js').Harness} */
export const harness = {
  name: 'TODO', // the harness behind it: 'aisdk', 'portkey', 'bifrost', 'openai-sdk', ...

  async call({ model, system, messages, tools }) {
    // Make ONE request to your provider or gateway (AI SDK, Portkey, Bifrost, a plain
    // fetch...) and report what happened. The runner does the tracking and the cost maths.
    //
    // Sketch for an OpenAI-compatible endpoint (many gateways speak this):
    //
    //   const res = await fetch(`${process.env.GATEWAY_URL}/v1/chat/completions`, {
    //     method: 'POST',
    //     headers: { authorization: `Bearer ${process.env.GATEWAY_KEY}`, 'content-type': 'application/json' },
    //     body: JSON.stringify({
    //       model: model.name,
    //       ...model.params,
    //       messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages /* map tool messages to your API's format */],
    //       tools: tools?.map((t) => ({ type: 'function', function: t })),
    //     }),
    //   });
    //   const body = await res.json();
    //   const msg = body.choices[0].message;
    //   const reasoning = body.usage.completion_tokens_details?.reasoning_tokens ?? 0;
    //   const cached = body.usage.prompt_tokens_details?.cached_tokens ?? 0;
    //   return {
    //     content: msg.content ?? '',
    //     toolCalls: msg.tool_calls?.map((c) => ({ id: c.id, name: c.function.name, arguments: JSON.parse(c.function.arguments) })),
    //     usage: {
    //       inputTokens: body.usage.prompt_tokens - cached,
    //       cachedInputTokens: cached,
    //       outputTokens: body.usage.completion_tokens - reasoning, // outputTokens excludes reasoning
    //       reasoningTokens: reasoning,
    //     },
    //     modelUsed: body.model, // what actually answered, if the gateway routes or falls back
    //   };
    throw new Error('harness for "{{name}}" is not implemented yet: edit orchestrators/{{name}}.js');
  },
};

// Optional: replaces the runner's default system prompt for the orchestrator.
// export const instructions = `...`;

