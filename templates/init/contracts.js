// The shapes this framework knows about. Nothing here runs: these are JSDoc
// typedefs so your editor can check your files. RUBRIC.md describes them in prose.
//
// Every file you write exports named, declarative objects:
//
//   tasks/*.js          export const task = {...}
//   models/*.js         export const model = {...}      what the model is
//                       export const harness = {...}    how it is called (aisdk, portkey, bifrost, ...)
//   orchestrators/*.js  export const model / harness    same as a model, plus optional `instructions`
//   graders/**/*.js     export const grader = {...}

// ---- models and harnesses ------------------------------------------------------

/**
 * WHAT is being called. Pure data.
 *
 * @typedef {object} Model
 * @property {string} id                 Unique; appears in results.
 * @property {string} [provider]         e.g. "anthropic", "openai".
 * @property {string} [name]             The provider's model id, e.g. "claude-sonnet-5-5".
 * @property {Pricing} [pricing]         Used to compute cost for every call to this model.
 * @property {Record<string, any>} [params]  temperature etc.; passed to the harness untouched.
 */

/**
 * USD per million tokens. Missing optional rates fall back to `inputPerMTok`
 * (cached, cache write) or `outputPerMTok` (reasoning).
 *
 * @typedef {object} Pricing
 * @property {number} inputPerMTok
 * @property {number} outputPerMTok
 * @property {number} [cachedInputPerMTok]
 * @property {number} [cacheWritePerMTok]
 * @property {number} [reasoningPerMTok]
 */

/**
 * HOW it is called. The only code that knows about an SDK or gateway. It makes one
 * request and reports what happened; the runner does all tracking and cost maths.
 *
 * @typedef {object} Harness
 * @property {string} name               e.g. "aisdk", "portkey", "bifrost", "openai-sdk".
 * @property {(request: HarnessRequest) => Promise<HarnessResponse>} call
 */

/**
 * @typedef {object} HarnessRequest
 * @property {Model} model
 * @property {string} [system]
 * @property {Message[]} messages
 * @property {ToolSpec[]} [tools]
 * @property {{task: Task, case: Case}} meta   Context for scripted harnesses. Real LLMs ignore it.
 */

/**
 * @typedef {object} HarnessResponse
 * @property {string} content
 * @property {ToolRequest[]} [toolCalls]       Tools the model asked to call.
 * @property {Usage} [usage]
 * @property {string} [modelUsed]              The model that actually answered (gateways may route or fall back).
 * @property {number} [costUsd]                If your gateway reports cost, return it; it overrides the pricing maths.
 * @property {any} [raw]                       Anything you want kept in the results file.
 */

/**
 * Token counts for one call. `outputTokens` EXCLUDES reasoning tokens (if your API
 * includes them in its output count, subtract them). Context size = input + cached.
 *
 * @typedef {object} Usage
 * @property {number} [inputTokens]            Uncached prompt tokens.
 * @property {number} [cachedInputTokens]      Prompt tokens read from cache.
 * @property {number} [cacheWriteTokens]
 * @property {number} [outputTokens]
 * @property {number} [reasoningTokens]
 */

/**
 * @typedef {object} Message
 * @property {'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {ToolRequest[]} [toolCalls]       On assistant messages.
 * @property {string} [toolCallId]             On tool messages.
 * @property {string} [name]                   On tool messages: the tool that ran.
 */

/**
 * @typedef {object} ToolRequest
 * @property {string} id
 * @property {string} name
 * @property {Record<string, any>} arguments
 */

/**
 * @typedef {object} ToolSpec
 * @property {string} name
 * @property {string} description
 * @property {object} parameters               JSON Schema.
 */

/**
 * @typedef {object} OrchestratorModule
 * @property {Model} model
 * @property {Harness} harness
 * @property {string} [instructions]           Replaces the default system prompt.
 */

// ---- tasks ---------------------------------------------------------------------

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} [description]
 * @property {string} [instructions]           Extra guidance for the orchestrator on how to run this task.
 * @property {string} [system]                 System prompt sent to the model under test.
 * @property {TaskTool[]} [tools]              Tools the model under test may call.
 * @property {number} [budgetUsd]
 * @property {Case[]} cases
 */

/**
 * @typedef {ToolSpec & {execute: (args: any) => Promise<any> | any}} TaskTool
 */

/**
 * @typedef {object} Case
 * @property {string} id
 * @property {any} input
 * @property {any} [expected]                  Never shown to the orchestrator or the model.
 * @property {number} [budgetUsd]
 * @property {Record<string, any>} [meta]
 */

// ---- sessions and graders ------------------------------------------------------

/**
 * The full record of one model x task x case run: every call made by the
 * orchestrator and the model, with prompts, outputs, tool calls, usage and cost.
 *
 * @typedef {object} Session
 * @property {'completed'|'max_turns'|'no_output'|'error'} status
 * @property {string|null} summary             Written by the orchestrator when it finishes.
 * @property {string|null} output              The model's last answer.
 * @property {CallRecord[]} calls
 * @property {Totals} totals
 */

/**
 * @typedef {object} CallRecord
 * @property {number} id
 * @property {string} role                     "orchestrator", "model" or "grader:<id>".
 * @property {number} [turn]                   Orchestrator turn this call belongs to.
 * @property {number} [parent]                 Orchestrator call that triggered this one.
 * @property {string} model
 * @property {string} harness
 * @property {string} modelUsed
 * @property {{system?: string, messages: Message[], tools?: ToolSpec[]}} request   The prompt, as sent.
 * @property {{content: string, toolCalls: ToolRequest[]}} response
 * @property {Required<Usage> & {totalTokens: number, contextTokens: number}} usage
 * @property {number} costUsd
 * @property {number} latencyMs
 * @property {{id: string, name: string, arguments: any, result?: any, error?: string, durationMs: number}[]} [toolCalls]
 * @property {string} [error]
 */

/**
 * @typedef {object} Totals
 * @property {number} calls
 * @property {number} toolCalls
 * @property {number} inputTokens
 * @property {number} cachedInputTokens
 * @property {number} cacheWriteTokens
 * @property {number} outputTokens
 * @property {number} reasoningTokens
 * @property {number} totalTokens
 * @property {number} peakContextTokens        Largest prompt sent in any single call.
 * @property {number} costUsd
 * @property {number} latencyMs
 */

/**
 * Quality and cost graders share one shape; they differ in which list of the config
 * they sit in, and so in what they may judge. A grader that needs an LLM calls
 * `ctx.llm(...)`, which is tracked and costed like every other call.
 *
 * @typedef {object} Grader
 * @property {string} id
 * @property {number} [weight]                 Relative weight inside its own list. Default 1.
 * @property {(ctx: GradeContext) => Promise<Grade> | Grade} grade
 */

/**
 * @typedef {object} GradeContext
 * @property {Model} model                     The model under test.
 * @property {Task} task
 * @property {Case} case
 * @property {Session} session
 * @property {string} output                   Shortcut for session.output.
 * @property {(judge: {model: Model, harness: Harness}, request: {system?: string, messages: Message[]}) => Promise<CallRecord>} llm
 */

/**
 * @typedef {object} Grade
 * @property {number} score                    0 (worst) to 1 (best).
 * @property {string} reason                   One line a human can read.
 * @property {Record<string, any>} [data]
 */

/** @typedef {Grade & {id: string, weight: number, error?: boolean}} GradeEntry */

/**
 * The final grader reads the other graders' entries and the session totals, and
 * produces the verdict.
 *
 * @typedef {object} FinalGrader
 * @property {string} id
 * @property {(ctx: GradeContext & {quality: GradeEntry[], cost: GradeEntry[], options: Record<string, any>}) => Promise<Verdict> | Verdict} grade
 */

/**
 * @typedef {object} Verdict
 * @property {number} score                    0 to 1.
 * @property {boolean} pass
 * @property {string} reason
 */

export {};
