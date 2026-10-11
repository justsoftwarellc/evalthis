//! Everything the CLI writes is a plain file under `templates/`, embedded at compile
//! time. There is no generation logic beyond `{{placeholder}}` substitution, so what
//! you read in `templates/` is exactly what lands in the user's project.

pub struct Template {
    /// Path relative to the evals directory.
    pub path: &'static str,
    pub contents: &'static str,
}

macro_rules! init {
    ($($dest:literal <= $src:literal),* $(,)?) => {
        &[$(Template { path: $dest, contents: include_str!(concat!("../templates/init/", $src)) }),*]
    };
}

/// Files written by `evalthis init`.
pub const INIT: &[Template] = init![
    "README.md" <= "README.md",
    "RUBRIC.md" <= "RUBRIC.md",
    "contracts.js" <= "contracts.js",
    "eval.config.js" <= "eval.config.js",
    "package.json" <= "package.json",
    ".gitignore" <= "gitignore",
    "models/stub.js" <= "models/stub.js",
    "orchestrators/scripted.js" <= "orchestrators/scripted.js",
    "tasks/uppercase.js" <= "tasks/uppercase.js",
    "graders/quality/exact-match.js" <= "graders/quality/exact-match.js",
    "graders/cost/token-cost.js" <= "graders/cost/token-cost.js",
    "graders/final.js" <= "graders/final.js",
    "runner/run.js" <= "runner/run.js",
];

pub const RUBRIC: &str = include_str!("../templates/init/RUBRIC.md");
pub const NEW_MODEL: &str = include_str!("../templates/new/model.js");
pub const NEW_ORCHESTRATOR: &str = include_str!("../templates/new/orchestrator.js");
pub const NEW_TASK: &str = include_str!("../templates/new/task.js");
pub const NEW_QUALITY_GRADER: &str = include_str!("../templates/new/quality-grader.js");
pub const NEW_COST_GRADER: &str = include_str!("../templates/new/cost-grader.js");

/// Replace every `{{key}}` with its value.
pub fn render(template: &str, vars: &[(&str, &str)]) -> String {
    vars.iter().fold(template.to_string(), |text, (key, value)| {
        text.replace(&format!("{{{{{key}}}}}"), value)
    })
}
