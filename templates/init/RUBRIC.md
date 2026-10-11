# Eval rubric

How to run an evaluation here, how to read it, and where to change it. If this file and
the code disagree, the code wins; fix this file.

## 1. The model of an eval

An eval is the cross product of models and task cases. Each pair runs as a **session** driven by
an orchestrator LLM, then is graded. You declare every piece as named exports:

| Piece | Question it answers | File | Exports |
| --- | --- | --- | --- |
| **Task** | What is asked? | `tasks/*.js` | `task` = `{id, cases: [{id, input, expected?}], system?, tools?, instructions?}` |
| **Model** | Who answers, and through what? | `models/*.js` | `model` = what it is (`id, provider, name, pricing, params`); `harness` = how it is called (`name`, `call()`) |
| **Orchestrator** | Who runs the session? | `orchestrators/*.js` | same as a model, plus optional `instructions` |
| **Quality graders** | Is the answer good? | `graders/quality/*.js` | `grader` = `{id, weight?, grade(ctx)}` returning `{score 0..1, reason}` |
| **Cost graders** | Was it affordable? | `graders/cost/*.js` | `grader`, same shape |
| **Final grader** | Given both, is it acceptable? | `graders/final.js` | `grader` returning `{score, pass, reason}` |

`model` is data; `harness` is code. A harness is the only place that knows about an SDK or gateway
(AI SDK, Portkey, Bifrost, plain fetch...). It makes one request and reports content, tool calls,
token usage and which model actually answered. The runner does everything else. Types are in
`contracts.js`. `eval.config.js` wires it all together; nothing is auto-discovered.

## 2. How to run

```sh
{{run_cmd}}                               # everything in the config
{{run_cmd}} --model stub --task uppercase # a subset (flags repeat: --model a --model b)
{{run_cmd}} --case simple -v              # one case, print every grade and session summary
{{run_cmd}} --config other.config.js      # a different config entirely
```

Per model x task x case x repeat, the runner does:

1. **Session.** The orchestrator receives the task and case input and two tools:
   `prompt_model({prompt})` sends a prompt to the model under test (which may call the task's tools,
   up to `limits.maxModelSteps` rounds), and `finish({summary})` ends the session. A session that is
   not finished within `limits.maxOrchestratorTurns`, errors, or gets no answer is not graded and fails.
2. **Grading.** Every quality grader, then every cost grader, then the final grader. Graders that
   need an LLM call `ctx.llm(judge, request)`; those calls are tracked like all others.
3. **Record.** Everything is written to `results/<timestamp>.json`.

The orchestrator never sees `expected`. Only graders do.

## 3. What is recorded

One JSON file per run:

```
schemaVersion, runId, startedAt, endedAt
config        models, orchestrator (id, provider, name, harness, pricing), tasks, grader ids,
              finalOptions, limits, repeats
summary       byModelTask[]  pass rate, avg score/quality/cost, model cost and tokens, overhead cost
              totals         everything below, summed, with byRole and byModel breakdowns
evaluations[] one per model x task x case x repeat:
  verdict     { score, pass, reason }
  session     status, summary (written by the orchestrator), output, totals, calls[]
  grades      quality[], cost[], final   each with score, reason, data, its own calls[] and totals
  totals      session + all graders, with byRole and byModel
```

Every LLM call, whoever made it (orchestrator, model under test, a grader's judge), is a record in a
`calls[]`:

```
id, role ("orchestrator" | "model" | "grader:<id>"), turn, parent (the orchestrator call that caused it)
model, provider, harness, modelUsed (what actually answered; may differ if a gateway routed)
request   { system, messages, tools }    the exact prompt that was sent
response  { content, toolCalls }         what came back
usage     inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, reasoningTokens,
          contextTokens (input + cached + cache write), totalTokens
costUsd, latencyMs, startedAt, error?
toolCalls[]   each tool that was executed: name, arguments, result or error, durationMs
```

`totals` objects carry calls, toolCalls, every token type, `peakContextTokens`, `costUsd` and
`latencyMs`. Cost is tokens x the model's `pricing`, unless the harness returns its own `costUsd`.

## 4. The grading rubric

Scores are on one scale: **0 = unacceptable, 1 = as good as it gets**. Higher is always better,
for quality *and* cost (a cheap run scores high on cost). That keeps the final grader simple.

### Quality graders

- Judge the **output** (and, if the task needs it, the session). Never reward or punish price here.
- Prefer deterministic checks (exact match, regex, JSON schema, unit tests, execution). They are
  free, fast and repeatable.
- Use an LLM judge only for what code cannot check (helpfulness, tone, faithfulness). If you do:
  use a model that is **not** the one under test, temperature 0, written criteria, a fixed score
  scale, a one-line `reason`, and call it through `ctx.llm` so its cost is on the record.
- Several narrow graders beat one broad one. Use `weight` to say which matter more.
- Always include a `reason`. A score nobody can explain is not usable.

### Cost graders

- Judge **resources only**: dollars, latency, tokens, tool calls. Never correctness.
- Read from `session.totals` (already priced). Score against an explicit budget
  (`task.budgetUsd`, `case.budgetUsd`) so "0.7" means something.
- Score the model under test (`session.totals.byRole.model`). Orchestrator and grader spend is eval
  overhead: recorded, reported separately, not scored.

### Final grader

- Sees grades, not outputs. The trade-off between quality and cost lives in exactly one small file.
- Default policy (`graders/final.js`): quality is a **gate** (`minQuality`), then
  `score = qualityWeight*quality + costWeight*cost`, and the case passes at `minScore`.
- A cheap wrong answer must never pass. If you change the policy, keep a quality floor.
- It is the only grader that decides pass/fail.

## 5. Reading results

- Look at **failures first** (the runner prints their grades and session summary automatically),
  then at the summary table.
- When a number surprises you, open the JSON: the exact prompts and outputs are there.
- Compare models on the same task and cases. Do not compare across tasks.
- For non-deterministic models set `repeats` above 1 and read the pass rate, not one run.
- A change is real when it moves quality without losing the gate. A cost win with a quality
  drop is a trade-off for a person to decide, not this tool.
- Change one thing at a time (model, prompt, orchestrator, grader, weights), and keep the previous
  `results/*.json` to diff against. Changing the orchestrator changes the experiment.

## 6. Where to override anything

| I want to... | Do this |
| --- | --- |
| Add a model, task, orchestrator or grader | `evalme add model\|task\|orchestrator\|grader ...`, then import it in `eval.config.js` |
| Use a different SDK or gateway | Change the `harness` in the model file |
| Share one harness between models | Export it from a shared file and re-export it as `harness` |
| Change pricing | `model.pricing`, or return `costUsd` from the harness |
| Change how quality and cost trade off | Edit `finalOptions` in `eval.config.js`, or rewrite `graders/final.js` |
| Grade on something new (latency, tool calls) | Add a cost grader |
| Change how sessions run (instructions, tools, turn limits) | `instructions` in the orchestrator file, `limits` in the config, or `runner/run.js` |
| Change the runner (concurrency, retries, caching, output) | Edit `runner/run.js`; it is plain Node you own |
| Use a different config per environment | `--config path/to/file.js` |
| Fail CI on regressions | Set `minPassRate` in the config; the runner exits 1 below it |

## 7. Checklist before trusting a result

- [ ] Every case has an input a real user could send and a clear definition of good.
- [ ] Quality graders do not read price; cost graders do not read correctness.
- [ ] Pricing is current and every harness reports real token usage.
- [ ] The orchestrator is the same across the models you compare.
- [ ] The final grader has a quality floor.
- [ ] You opened at least a few sessions in `results/*.json` and the prompts looked right.
