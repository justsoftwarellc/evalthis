# evalthis

A Rust CLI that scaffolds an opinionated, model-agnostic eval framework into a Node.js project.
You define models, tasks, an orchestrator and graders; evalthis generates the structure, a small
readable runner (plain Node, no dependencies) and a rubric. Everything it writes is a plain file you own.

```sh
cargo install --path .
cd my-node-project
evalthis init                      # creates ./evals, adds an `eval` npm script
node evals/runner/run.js          # runs offline with the placeholder model
evalthis add model my-model        # also: task, orchestrator, grader quality|cost
evalthis rubric                    # how to run, grade and read evals
```

`init` and `add` never overwrite existing files unless `--force`; `--dry-run` shows what would be written.

## What it generates

- `tasks/*.js` export `task`; `models/*.js` export `model` (what it is) and `harness` (aisdk, portkey, bifrost...).
- An **orchestrator** (declared like a model) runs each session: it prompts the model under test via a
  `prompt_model` tool and ends with `finish`.
- Graders: **quality** graders and **cost** graders score independently (0..1); a **final** grader reads both
  and decides pass/fail, with a quality floor. Graders may use LLMs via `ctx.llm`, which is tracked.
- Output: one verbose JSON per run with every call's prompt, output, tool calls, token usage
  (input, cached, output, reasoning, context), model used, latency and cost, for the orchestrator,
  the model and the graders, plus session summaries and rollups.

Templates live in `templates/` and are embedded verbatim, so what you read there is what gets written.
