#!/usr/bin/env node
// The eval runner. No dependencies, no hidden steps. It is yours: edit it.
//
// For every model x task x case x repeat it does exactly this, in order:
//   1. SESSION   An orchestrator LLM runs the session. It has two tools:
//                  prompt_model({prompt})  send a prompt to the model under test
//                  finish({summary})       end the session with a summary
//                The model under test may call the task's own tools.
//   2. GRADING   Every quality grader, then every cost grader, then the final grader.
//                Graders that use an LLM call ctx.llm(), which is tracked too.
//   3. RECORD    Every LLM call, from anyone, is stored with its prompt, output, tool
//                calls, tokens, model used and cost in results/<timestamp>.json.

import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const evalsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values: flags } = parseArgs({
  options: {
    config: { type: 'string' }, //                       use another config file
    model: { type: 'string', multiple: true }, //        only these model ids
    task: { type: 'string', multiple: true }, //         only these task ids
    case: { type: 'string', multiple: true }, //         only these case ids
    out: { type: 'string' }, //                          results directory
    verbose: { type: 'boolean', short: 'v' }, //         print every grade, not just failures
    help: { type: 'boolean', short: 'h' },
  },
});

if (flags.help) {
  console.log(`Usage: node ${path.relative(process.cwd(), process.argv[1])} [--model id]... [--task id]... [--case id]... [--config file] [--out dir] [-v]`);
  process.exit(0);
}

const configPath = path.resolve(flags.config ?? path.join(evalsDir, 'eval.config.js'));
const config = (await import(pathToFileURL(configPath).href)).default;
const limits = { maxOrchestratorTurns: 8, maxModelSteps: 8, ...config.limits };

// ---- reading what the config exports -------------------------------------------
// The config imports modules (`import * as x`); each declares named exports. A plain
// object is accepted too.

const errMsg = (err) => String(err?.message ?? err);

function actorOf(ns, what) {
  const model = ns?.model ?? ns;
  const harness = ns?.harness;
  if (!model?.id || typeof harness?.call !== 'function') {
    throw new Error(`${what} must export \`model\` ({ id, ... }) and \`harness\` ({ name, call() }); found: ${Object.keys(ns ?? {}).join(', ') || 'nothing'}`);
  }
  return { model, harness, instructions: ns.instructions };
}
const describe = ({ model, harness }) => ({ id: model.id, provider: model.provider, name: model.name, harness: harness.name, pricing: model.pricing, params: model.params });

const pick = (items, wanted) => (wanted?.length ? items.filter((i) => wanted.includes(i.id)) : items);
const models = pick(config.models.map((ns, i) => actorOf(ns, `models[${i}]`)).map((a) => ({ ...a, id: a.model.id })), flags.model);
const tasks = pick(config.tasks.map((ns) => ns?.task ?? ns), flags.task);
const orchestrator = actorOf(config.orchestrator, 'orchestrator');
const graders = {
  quality: config.graders.quality.map((ns) => ns?.grader ?? ns),
  cost: config.graders.cost.map((ns) => ns?.grader ?? ns),
  final: config.final?.grader ?? config.final,
};
if (!models.length || !tasks.length) {
  console.error('Nothing to run: the --model/--task filters matched no ids in the config.');
  process.exit(2);
}

// ---- tracking: every LLM call goes through here --------------------------------

const num = (n) => (Number.isFinite(n) ? n : 0);

function normalizeUsage(u = {}) {
  const usage = {
    inputTokens: num(u.inputTokens),
    cachedInputTokens: num(u.cachedInputTokens),
    cacheWriteTokens: num(u.cacheWriteTokens),
    outputTokens: num(u.outputTokens),
    reasoningTokens: num(u.reasoningTokens),
  };
  return {
    ...usage,
    contextTokens: usage.inputTokens + usage.cachedInputTokens + usage.cacheWriteTokens,
    totalTokens: Object.values(usage).reduce((a, b) => a + b, 0),
  };
}

// Cost from the model's declared pricing, unless the harness reported its own.
function priceOf(pricing, u) {
  if (!pricing) return 0;
  return (
    u.inputTokens * pricing.inputPerMTok +
    u.cachedInputTokens * (pricing.cachedInputPerMTok ?? pricing.inputPerMTok) +
    u.cacheWriteTokens * (pricing.cacheWritePerMTok ?? pricing.inputPerMTok) +
    u.outputTokens * pricing.outputPerMTok +
    u.reasoningTokens * (pricing.reasoningPerMTok ?? pricing.outputPerMTok)
  ) / 1e6;
}

// Make one LLM call through a harness, append a full record to `calls`, return it.
async function track(calls, role, { model, harness }, request, extra = {}, meta) {
  const record = {
    id: calls.length + 1,
    role,
    ...extra,
    model: model.id,
    provider: model.provider,
    harness: harness.name,
    modelUsed: model.name ?? model.id,
    startedAt: new Date().toISOString(),
    request: structuredClone({ system: request.system, messages: request.messages, tools: request.tools }),
  };
  calls.push(record);
  const t0 = performance.now();
  try {
    const res = await harness.call({ model, ...request, meta });
    record.latencyMs = Math.round(performance.now() - t0);
    record.modelUsed = res.modelUsed ?? record.modelUsed;
    record.response = { content: res.content ?? '', toolCalls: res.toolCalls ?? [] };
    record.usage = normalizeUsage(res.usage);
    record.costUsd = res.costUsd ?? priceOf(model.pricing, record.usage);
    if (res.raw !== undefined) record.raw = res.raw;
    return record;
  } catch (err) {
    record.latencyMs = Math.round(performance.now() - t0);
    record.response = { content: '', toolCalls: [] };
    record.usage = normalizeUsage();
    record.costUsd = 0;
    record.error = errMsg(err);
    throw err;
  }
}

async function runTool(tools, request, fallback) {
  const t0 = performance.now();
  const out = { id: request.id, name: request.name, arguments: request.arguments };
  try {
    const tool = tools.find((t) => t.name === request.name);
    if (!tool) throw new Error(`unknown tool "${request.name}"`);
    out.result = await (tool.execute ?? fallback)(request.arguments);
  } catch (err) {
    out.error = errMsg(err);
  }
  out.durationMs = Math.round(performance.now() - t0);
  return out;
}
const asText = (out) => (out.error ? `error: ${out.error}` : typeof out.result === 'string' ? out.result : JSON.stringify(out.result));

// ---- totals --------------------------------------------------------------------

function sum(calls) {
  const t = { calls: calls.length, toolCalls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, peakContextTokens: 0, costUsd: 0, latencyMs: 0 };
  for (const c of calls) {
    t.toolCalls += c.toolCalls?.length ?? 0;
    for (const k of ['inputTokens', 'cachedInputTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'totalTokens', 'costUsd', 'latencyMs']) t[k] += c.usage?.[k] ?? c[k] ?? 0;
    t.peakContextTokens = Math.max(t.peakContextTokens, c.usage?.contextTokens ?? 0);
  }
  return t;
}
function group(calls, keyOf) {
  const by = {};
  for (const c of calls) (by[keyOf(c)] ??= []).push(c);
  return Object.fromEntries(Object.entries(by).map(([k, cs]) => [k, sum(cs)]));
}
const totals = (calls) => ({ ...sum(calls), byRole: group(calls, (c) => c.role), byModel: group(calls, (c) => `${c.harness}:${c.modelUsed}`) });

// ---- 1. session: orchestrator + model under test ---------------------------------

const ORCHESTRATOR_TOOLS = [
  { name: 'prompt_model', description: 'Send a prompt to the model under test and get its final answer back. The conversation with the model persists across calls.', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
  { name: 'finish', description: 'End the session. Call once you have the model\'s final answer.', parameters: { type: 'object', properties: { summary: { type: 'string', description: 'What happened in this session, in a few sentences.' } }, required: ['summary'] } },
];

const DEFAULT_INSTRUCTIONS = `You run one evaluation session against a model under test.
Use prompt_model to give the model the task input (you may send follow-ups if the task calls for it).
Never answer the task yourself, never reveal grading criteria, and never invent inputs.
When you have the model's final answer, call finish with a short summary of what happened.`;

const briefing = (task, c) =>
  [`Task: ${task.id}`, task.description, task.instructions, `Case: ${c.id}`, 'Input:', typeof c.input === 'string' ? c.input : JSON.stringify(c.input, null, 2)].filter(Boolean).join('\n');

async function runSession({ model, task, case: testCase }) {
  const calls = [];
  const session = { status: 'completed', summary: null, output: null, startedAt: new Date().toISOString() };
  const meta = { task, case: testCase };
  const modelMessages = [];
  const taskTools = task.tools ?? [];
  const toolSpecs = taskTools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  let turn = 0;

  // One prompt to the model under test; loops while the model keeps calling tools.
  async function askModel(prompt, parent) {
    try {
      return await converse(prompt, parent);
    } catch (err) {
      session.modelError = errMsg(err); // the orchestrator sees the error too, but it must not hide it
      throw err;
    }
  }

  async function converse(prompt, parent) {
    modelMessages.push({ role: 'user', content: prompt });
    for (let step = 1; step <= limits.maxModelSteps; step++) {
      const rec = await track(calls, 'model', model, { system: task.system, messages: modelMessages, tools: toolSpecs }, { turn, parent }, meta);
      const { content, toolCalls } = rec.response;
      modelMessages.push({ role: 'assistant', content, toolCalls });
      if (!toolCalls.length) {
        session.modelError = null; // a retry that works clears an earlier failure
        return (session.output = content);
      }
      rec.toolCalls = [];
      for (const request of toolCalls) {
        const out = await runTool(taskTools, request);
        rec.toolCalls.push(out);
        modelMessages.push({ role: 'tool', toolCallId: request.id, name: request.name, content: asText(out) });
      }
    }
    throw new Error(`model still calling tools after limits.maxModelSteps (${limits.maxModelSteps})`);
  }

  const messages = [{ role: 'user', content: briefing(task, testCase) }];
  const system = orchestrator.instructions ?? DEFAULT_INSTRUCTIONS;
  let finished = false;
  try {
    for (turn = 1; turn <= limits.maxOrchestratorTurns && !finished; turn++) {
      const rec = await track(calls, 'orchestrator', orchestrator, { system, messages, tools: ORCHESTRATOR_TOOLS }, { turn }, meta);
      const { content, toolCalls } = rec.response;
      messages.push({ role: 'assistant', content, toolCalls });
      if (!toolCalls.length) {
        session.summary = content; // no tool call = the orchestrator is done talking
        finished = true;
        break;
      }
      rec.toolCalls = [];
      for (const request of toolCalls) {
        const out = await runTool(ORCHESTRATOR_TOOLS, request, async (args) => {
          if (request.name === 'finish') {
            finished = true;
            session.summary = args.summary;
            return 'session ended';
          }
          return askModel(args.prompt, rec.id);
        });
        rec.toolCalls.push(out);
        messages.push({ role: 'tool', toolCallId: request.id, name: request.name, content: asText(out) });
      }
    }
    if (session.modelError) Object.assign(session, { status: 'error', error: session.modelError });
    else if (!finished) session.status = 'max_turns';
    else if (session.output == null) session.status = 'no_output';
  } catch (err) {
    session.status = 'error';
    session.error = errMsg(err);
  }
  return { ...session, endedAt: new Date().toISOString(), calls, totals: totals(calls) };
}

// ---- 2. grading ----------------------------------------------------------------

// Run one grader. A grader that throws or returns nonsense becomes a visible
// score-0 entry flagged `error`, never a silent skip.
async function runGrader(grader, kind, ctx, extra = {}) {
  const calls = [];
  const llm = (judge, request) => track(calls, `grader:${grader.id}`, actorOf(judge, 'the judge passed to ctx.llm'), request);
  const t0 = performance.now();
  const entry = { id: grader.id, kind, weight: grader.weight ?? 1 };
  try {
    const grade = await grader.grade({ ...ctx, ...extra, llm });
    if (typeof grade?.score !== 'number' || !(grade.score >= 0 && grade.score <= 1)) {
      throw new Error(`score must be a number from 0 to 1, got ${JSON.stringify(grade?.score)}`);
    }
    Object.assign(entry, grade);
  } catch (err) {
    Object.assign(entry, { score: 0, reason: `grader threw: ${errMsg(err)}`, error: true });
  }
  return { ...entry, durationMs: Math.round(performance.now() - t0), calls, totals: sum(calls) };
}

const verdictOf = ({ score, pass, reason }) => ({ score, pass, reason });

async function evaluate({ model, task, case: testCase, repeat }) {
  const session = await runSession({ model, task, case: testCase });
  const base = { model: model.id, task: task.id, case: testCase.id, repeat };

  // Nothing to grade if the session did not produce an answer.
  if (session.status !== 'completed') {
    const reason = session.error ? `session error: ${session.error}` : `session ${session.status}: no answer to grade`;
    const final = { id: graders.final.id, kind: 'final', score: 0, pass: false, reason, calls: [] };
    return { ...base, session, grades: { quality: [], cost: [], final }, verdict: verdictOf(final), totals: totals(session.calls) };
  }

  const ctx = { model: model.model, task, case: testCase, session, output: session.output };
  const quality = [];
  for (const g of graders.quality) quality.push(await runGrader(g, 'quality', ctx));
  const cost = [];
  for (const g of graders.cost) cost.push(await runGrader(g, 'cost', ctx));

  const entries = (list) => list.map(({ calls, totals, durationMs, kind, ...grade }) => grade);
  let final = await runGrader(graders.final, 'final', ctx, { quality: entries(quality), cost: entries(cost), options: config.finalOptions ?? {} });
  if (typeof final.pass !== 'boolean') {
    final = { ...final, pass: false, reason: `final grader must return { score, pass: boolean, reason }; ${final.reason}` };
  }
  const allCalls = [...session.calls, ...[...quality, ...cost, final].flatMap((g) => g.calls)];
  return { ...base, session, grades: { quality, cost, final }, verdict: verdictOf(final), totals: totals(allCalls) };
}

// ---- run -----------------------------------------------------------------------

const startedAt = new Date().toISOString();
const evaluations = [];
for (const model of models) {
  for (const task of tasks) {
    for (const testCase of pick(task.cases, flags.case)) {
      for (let repeat = 1; repeat <= (config.repeats ?? 1); repeat++) {
        const ev = await evaluate({ model, task, case: testCase, repeat });
        evaluations.push(ev);
        console.log(`${ev.verdict.pass ? 'PASS' : 'FAIL'}  ${ev.model} / ${ev.task} / ${ev.case}  ${ev.verdict.score.toFixed(2)}  ${ev.verdict.reason}`);
        if (flags.verbose || !ev.verdict.pass) {
          for (const g of [...ev.grades.quality, ...ev.grades.cost]) console.log(`        ${g.id}: ${g.score.toFixed(2)}  ${g.reason}`);
          if (ev.session.summary) console.log(`        session: ${ev.session.summary}`);
        }
      }
    }
  }
}

// ---- summary -------------------------------------------------------------------

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n, d = 6) => Number(n.toFixed(d));
const byPair = new Map();
for (const ev of evaluations) {
  const key = `${ev.model} / ${ev.task}`;
  byPair.set(key, [...(byPair.get(key) ?? []), ev]);
}
const summary = [...byPair].map(([key, evs]) => {
  const modelTotals = evs.map((e) => e.session.totals.byRole.model ?? sum([]));
  return {
    model: evs[0].model,
    task: evs[0].task,
    runs: evs.length,
    passRate: evs.filter((e) => e.verdict.pass).length / evs.length,
    avgScore: avg(evs.map((e) => e.verdict.score)),
    avgQuality: avg(evs.map((e) => avg(e.grades.quality.map((g) => g.score)))),
    avgCost: avg(evs.map((e) => avg(e.grades.cost.map((g) => g.score)))),
    modelCostUsd: modelTotals.reduce((a, t) => a + t.costUsd, 0),
    modelTokens: { input: modelTotals.reduce((a, t) => a + t.inputTokens + t.cachedInputTokens, 0), output: modelTotals.reduce((a, t) => a + t.outputTokens + t.reasoningTokens, 0) },
    overheadCostUsd: evs.reduce((a, e) => a + e.totals.costUsd, 0) - modelTotals.reduce((a, t) => a + t.costUsd, 0), // orchestrator + graders
    avgModelLatencyMs: avg(modelTotals.map((t) => t.latencyMs)),
  };
});
console.log();
console.table(
  Object.fromEntries(
    summary.map((s) => [
      `${s.model} / ${s.task}`,
      { runs: s.runs, 'pass %': Math.round(s.passRate * 100), 'avg score': round(s.avgScore, 3), 'model $': round(s.modelCostUsd), 'tokens in/out': `${s.modelTokens.input}/${s.modelTokens.output}`, 'overhead $': round(s.overheadCostUsd) },
    ]),
  ),
);

// ---- 3. record -----------------------------------------------------------------

const allCalls = evaluations.flatMap((e) => [...e.session.calls, ...[...e.grades.quality, ...e.grades.cost, e.grades.final].flatMap((g) => g.calls)]);
const output = {
  schemaVersion: 1,
  runId: randomUUID(),
  startedAt,
  endedAt: new Date().toISOString(),
  config: {
    path: configPath,
    models: models.map(describe),
    orchestrator: describe(orchestrator),
    tasks: tasks.map((t) => ({ id: t.id, description: t.description, cases: pick(t.cases, flags.case).map((c) => c.id) })),
    graders: { quality: graders.quality.map((g) => g.id), cost: graders.cost.map((g) => g.id), final: graders.final.id },
    finalOptions: config.finalOptions ?? {},
    limits,
    repeats: config.repeats ?? 1,
  },
  summary: { byModelTask: summary, totals: totals(allCalls) },
  evaluations,
};
const outDir = path.resolve(flags.out ?? path.join(evalsDir, 'results'));
await mkdir(outDir, { recursive: true });
const file = path.join(outDir, `${startedAt.replace(/[:.]/g, '-')}.json`);
await writeFile(file, JSON.stringify(output, null, 2));
console.log(`Total cost incl. orchestrator and graders: $${round(output.summary.totals.costUsd)}`);
console.log(`Full results: ${path.relative(process.cwd(), file)}`);

const passRate = evaluations.filter((e) => e.verdict.pass).length / evaluations.length;
if (passRate < (config.minPassRate ?? 0)) {
  console.error(`Pass rate ${(passRate * 100).toFixed(0)}% is below minPassRate ${(config.minPassRate * 100).toFixed(0)}%.`);
  process.exit(1);
}
