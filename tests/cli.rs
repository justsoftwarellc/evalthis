use std::fs;
use std::path::Path;
use std::process::{Command, Output};

fn evalme(cwd: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_evalme")).args(args).current_dir(cwd).output().unwrap()
}

fn ok(out: &Output) -> String {
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn node_available() -> bool {
    Command::new("node").arg("--version").output().is_ok()
}

#[test]
fn init_creates_framework_and_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("package.json"), "{\n  \"name\": \"app\",\n  \"scripts\": { \"test\": \"jest\" }\n}\n").unwrap();

    ok(&evalme(dir.path(), &["init"]));
    for f in ["eval.config.js", "RUBRIC.md", "runner/run.js", "graders/final.js", "graders/quality/exact-match.js", "graders/cost/token-cost.js", "package.json"] {
        assert!(dir.path().join("evals").join(f).exists(), "missing {f}");
    }
    let pkg = fs::read_to_string(dir.path().join("package.json")).unwrap();
    assert!(pkg.contains("\"eval\": \"node evals/runner/run.js\""));
    assert!(pkg.contains("\"test\": \"jest\""), "existing scripts must survive");
    assert!(!fs::read_to_string(dir.path().join("evals/RUBRIC.md")).unwrap().contains("{{"));

    // Second run must not clobber user edits.
    fs::write(dir.path().join("evals/eval.config.js"), "// mine").unwrap();
    let out = ok(&evalme(dir.path(), &["init"]));
    assert!(out.contains("skip"));
    assert_eq!(fs::read_to_string(dir.path().join("evals/eval.config.js")).unwrap(), "// mine");

    ok(&evalme(dir.path(), &["init", "--force"]));
    assert_ne!(fs::read_to_string(dir.path().join("evals/eval.config.js")).unwrap(), "// mine");
}

#[test]
fn dry_run_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    ok(&evalme(dir.path(), &["init", "--dry-run"]));
    assert!(!dir.path().join("evals").exists());
}

#[test]
fn custom_dir_and_no_package_json() {
    let dir = tempfile::tempdir().unwrap();
    let out = ok(&evalme(dir.path(), &["init", "--dir", "qa/evals"]));
    assert!(dir.path().join("qa/evals/eval.config.js").exists());
    assert!(out.contains("node qa/evals/runner/run.js"));
}

#[test]
fn add_requires_init_and_validates_names() {
    let dir = tempfile::tempdir().unwrap();
    assert!(!evalme(dir.path(), &["add", "model", "foo"]).status.success());

    ok(&evalme(dir.path(), &["init"]));
    let out = ok(&evalme(dir.path(), &["add", "model", "my-model"]));
    assert!(out.contains("import * as myModel from './models/my-model.js'"));
    ok(&evalme(dir.path(), &["add", "task", "summarize"]));
    ok(&evalme(dir.path(), &["add", "grader", "quality", "tone"]));
    ok(&evalme(dir.path(), &["add", "grader", "cost", "latency"]));
    for f in ["models/my-model.js", "tasks/summarize.js", "graders/quality/tone.js", "graders/cost/latency.js"] {
        assert!(dir.path().join("evals").join(f).exists(), "missing {f}");
    }
    assert!(!evalme(dir.path(), &["add", "model", "../evil"]).status.success());
}

#[test]
fn rubric_prints() {
    let dir = tempfile::tempdir().unwrap();
    let out = ok(&evalme(dir.path(), &["rubric"]));
    assert!(out.contains("Quality graders") && out.contains("node evals/runner/run.js"));
}

fn node(cwd: &Path, args: &[&str]) -> Output {
    Command::new("node").args(args).current_dir(cwd).output().unwrap()
}

fn only_result(dir: &Path) -> serde_json::Value {
    let files: Vec<_> = fs::read_dir(dir.join("evals/results")).unwrap().collect();
    assert_eq!(files.len(), 1);
    serde_json::from_str(&fs::read_to_string(files[0].as_ref().unwrap().path()).unwrap()).unwrap()
}

#[test]
fn default_run_produces_verbose_results() {
    if !node_available() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    ok(&evalme(dir.path(), &["init"]));
    let run = node(dir.path(), &["evals/runner/run.js", "-v"]);
    let stdout = String::from_utf8_lossy(&run.stdout);
    assert!(run.status.success(), "{stdout}\n{}", String::from_utf8_lossy(&run.stderr));
    assert!(stdout.contains("PASS  stub / uppercase / simple"), "{stdout}");

    let r = only_result(dir.path());
    assert_eq!(r["schemaVersion"], 1);
    assert_eq!(r["config"]["orchestrator"]["id"], "scripted");
    assert_eq!(r["config"]["models"][0]["harness"], "stub");
    let ev = &r["evaluations"][0];
    assert_eq!(ev["session"]["status"], "completed");
    assert!(ev["session"]["summary"].as_str().unwrap().contains("simple"));
    let calls = ev["session"]["calls"].as_array().unwrap();
    let roles: Vec<_> = calls.iter().map(|c| c["role"].as_str().unwrap()).collect();
    assert_eq!(roles, ["orchestrator", "model", "orchestrator"]);
    assert_eq!(calls[1]["request"]["messages"][0]["content"], "hello");
    assert_eq!(calls[1]["response"]["content"], "HELLO");
    assert_eq!(calls[1]["parent"], 1);
    assert_eq!(calls[1]["usage"]["inputTokens"], 2);
    assert!(calls[1]["costUsd"].as_f64().unwrap() > 0.0);
    assert_eq!(calls[0]["toolCalls"][0]["name"], "prompt_model");
    assert!(r["summary"]["totals"]["byRole"]["model"]["costUsd"].as_f64().unwrap() > 0.0);
}

#[test]
fn unimplemented_scaffold_fails_loudly() {
    if !node_available() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    ok(&evalme(dir.path(), &["init"]));
    ok(&evalme(dir.path(), &["add", "model", "todo"]));
    let cfg = dir.path().join("evals/eval.config.js");
    let text = fs::read_to_string(&cfg).unwrap().replace("models: [stub]", "models: [todo]").replace("import * as stub", "import * as todo from './models/todo.js';\nimport * as stub");
    fs::write(&cfg, text).unwrap();
    let run = node(dir.path(), &["evals/runner/run.js"]);
    let stdout = String::from_utf8_lossy(&run.stdout);
    assert!(stdout.contains("FAIL  todo / uppercase / simple") && stdout.contains("not implemented yet"), "{stdout}");
    let r = only_result(dir.path());
    assert_eq!(r["evaluations"][0]["session"]["status"], "error");
    assert!(r["evaluations"][0]["session"]["calls"][1]["error"].as_str().unwrap().contains("not implemented"));
}

#[test]
fn tools_and_llm_graders_are_tracked() {
    if !node_available() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    ok(&evalme(dir.path(), &["init"]));
    let evals = dir.path().join("evals");

    // A model that must call a task tool before answering, reporting reasoning/cached tokens.
    fs::write(evals.join("models/tooluser.js"), r#"
export const model = { id: 'tooluser', provider: 'p', name: 'tu-1', pricing: { inputPerMTok: 1000000, outputPerMTok: 1000000, cachedInputPerMTok: 0, reasoningPerMTok: 2000000 } };
export const harness = { name: 'fake-gateway', async call({ messages }) {
  const tool = messages.findLast((m) => m.role === 'tool');
  if (!tool) return { content: '', toolCalls: [{ id: 'c1', name: 'add', arguments: { a: 2, b: 3 } }], usage: { inputTokens: 1, outputTokens: 1 }, modelUsed: 'tu-1-routed' };
  return { content: tool.content, usage: { inputTokens: 1, cachedInputTokens: 10, outputTokens: 1, reasoningTokens: 1 } };
} };
"#).unwrap();
    fs::write(evals.join("tasks/add.js"), r#"
export const task = { id: 'add', tools: [{ name: 'add', description: 'adds', parameters: {}, execute: ({ a, b }) => String(a + b) }],
  cases: [{ id: 'two-plus-three', input: 'What is 2+3?', expected: '5' }] };
"#).unwrap();
    // A quality grader that uses an LLM judge through ctx.llm.
    fs::write(evals.join("graders/quality/judge.js"), r#"
import * as judge from '../../models/stub.js';
export const grader = { id: 'judge', async grade({ output, llm }) {
  const call = await llm(judge, { messages: [{ role: 'user', content: output }] });
  return { score: 1, reason: 'judged: ' + call.response.content };
} };
"#).unwrap();
    let cfg = evals.join("eval.config.js");
    let text = fs::read_to_string(&cfg).unwrap()
        .replace("models: [stub]", "models: [tooluser]")
        .replace("tasks: [uppercase]", "tasks: [add]")
        .replace("quality: [exactMatch]", "quality: [judge]")
        .replace("import * as stub", "import * as tooluser from './models/tooluser.js';\nimport * as add from './tasks/add.js';\nimport * as judge from './graders/quality/judge.js';\nimport * as stub");
    fs::write(&cfg, text).unwrap();

    let run = node(&evals.parent().unwrap(), &["evals/runner/run.js"]);
    assert!(run.status.success(), "{}\n{}", String::from_utf8_lossy(&run.stdout), String::from_utf8_lossy(&run.stderr));
    let r = only_result(dir.path());
    let ev = &r["evaluations"][0];
    assert_eq!(ev["session"]["output"], "5");
    let model_calls: Vec<_> = ev["session"]["calls"].as_array().unwrap().iter().filter(|c| c["role"] == "model").collect();
    assert_eq!(model_calls.len(), 2);
    assert_eq!(model_calls[0]["modelUsed"], "tu-1-routed");
    assert_eq!(model_calls[0]["toolCalls"][0]["result"], "5");
    assert_eq!(model_calls[1]["request"]["messages"].as_array().unwrap().len(), 3, "user, assistant(tool call), tool result");
    assert_eq!(model_calls[1]["usage"]["contextTokens"], 11);
    // 1 input + 10 cached(free) + 1 output + 1 reasoning(2x) = 1 + 0 + 1 + 2 = 4 USD at $1M/MTok
    assert!((model_calls[1]["costUsd"].as_f64().unwrap() - 4.0).abs() < 1e-9);

    let judge = &ev["grades"]["quality"][0];
    assert_eq!(judge["calls"][0]["role"], "grader:judge");
    assert_eq!(judge["calls"][0]["harness"], "stub");
    assert!(ev["totals"]["byRole"]["grader:judge"]["calls"] == 1);
    assert!(ev["totals"]["calls"].as_u64().unwrap() > ev["session"]["totals"]["calls"].as_u64().unwrap());
}
