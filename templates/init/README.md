# Evals

Compare models on tasks, graded on quality and cost. Read `RUBRIC.md` for the method.

```sh
{{run_cmd}}
```

Requires Node 20+. No dependencies to install. The placeholder model, orchestrator and
grader run offline; replace them with real ones.

## Layout

```
{{dir}}/
  eval.config.js        what runs: models, tasks, orchestrator, graders, final-grader settings
  RUBRIC.md             how to run, grade and read evals, and how to override anything
  contracts.js          JSDoc types for everything below
  models/               export const model + harness        (stub.js is a placeholder)
  orchestrators/        export const model + harness        (scripted.js needs no LLM)
  tasks/                export const task                   (uppercase.js is an example)
  graders/
    quality/            export const grader: "is the output good?"
    cost/               export const grader: "was it affordable?"
    final.js            export const grader: reads both, decides pass/fail
  runner/run.js         the runner; plain Node, read it top to bottom
  results/              one verbose JSON file per run (git-ignored)
```

## Next steps

```sh
evalthis add model my-model              # then fill in model + harness
evalthis add orchestrator my-orchestrator
evalthis add task my-task                # then list cases
evalthis add grader quality my-grader
evalthis add grader cost my-grader
```

Each command prints the import and where to register it in `eval.config.js`.
Everything here is generated once and then belongs to you.
