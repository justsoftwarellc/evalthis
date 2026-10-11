use crate::scaffold::{add_npm_script, Outcome, ScriptOutcome, Writer};
use crate::templates::{self, render};
use anyhow::{bail, Result};
use std::path::Path;

#[derive(Clone, Copy, clap::ValueEnum)]
pub enum GraderKind {
    Quality,
    Cost,
}

pub fn init(root: &Path, dir: &str, skip_package_json: bool, writer: Writer) -> Result<()> {
    validate_dir(dir)?;
    let evals = root.join(dir);
    let run_cmd = format!("node {dir}/runner/run.js");
    let vars = [("dir", dir), ("run_cmd", run_cmd.as_str())];

    println!("Scaffolding eval framework in {}", evals.display());
    let mut skipped = 0;
    for t in templates::INIT {
        if writer.write(&evals.join(t.path), &render(t.contents, &vars))? == Outcome::Skipped {
            skipped += 1;
        }
    }

    if !skip_package_json {
        let command = format!("node {dir}/runner/run.js");
        match add_npm_script(root, "eval", &command, writer.dry_run)? {
            ScriptOutcome::Added => println!("  update     package.json (scripts.eval = \"{command}\")"),
            ScriptOutcome::AlreadySet => println!("  ok         package.json already has scripts.eval"),
            ScriptOutcome::Conflict(existing) => {
                println!("  skip       package.json: scripts.eval is already \"{existing}\"; left alone")
            }
            ScriptOutcome::NoPackageJson => println!("  note       no package.json in {}; run with: {run_cmd}", root.display()),
        }
    }

    if skipped > 0 {
        println!("\n{skipped} file(s) already existed and were left alone.");
    }
    if !writer.dry_run {
        println!("\nNext:\n  {run_cmd}\n  evalthis rubric        # how to run and read evals\n  evalthis add model <name>");
    }
    Ok(())
}

pub fn add_model(evals: &Path, name: &str, writer: Writer) -> Result<()> {
    add(evals, "models", name, templates::NEW_MODEL, writer, "add `{ident}` to `models`")
}

pub fn add_orchestrator(evals: &Path, name: &str, writer: Writer) -> Result<()> {
    add(evals, "orchestrators", name, templates::NEW_ORCHESTRATOR, writer, "set `orchestrator: {ident}`")
}

pub fn add_task(evals: &Path, name: &str, writer: Writer) -> Result<()> {
    add(evals, "tasks", name, templates::NEW_TASK, writer, "add `{ident}` to `tasks`")
}

pub fn add_grader(evals: &Path, kind: GraderKind, name: &str, writer: Writer) -> Result<()> {
    match kind {
        GraderKind::Quality => add(evals, "graders/quality", name, templates::NEW_QUALITY_GRADER, writer, "add `{ident}` to `graders.quality`"),
        GraderKind::Cost => add(evals, "graders/cost", name, templates::NEW_COST_GRADER, writer, "add `{ident}` to `graders.cost`"),
    }
}

/// `subdir` is where the file goes; `hint` says how to register it (`{ident}` is the import name).
fn add(evals: &Path, subdir: &str, name: &str, template: &str, writer: Writer, hint: &str) -> Result<()> {
    validate_name(name)?;
    if !evals.join("eval.config.js").exists() {
        bail!("{} has no eval.config.js; run `evalthis init` first (or pass --dir)", evals.display());
    }
    let file = evals.join(subdir).join(format!("{name}.js"));
    let outcome = writer.write(&file, &render(template, &[("name", name)]))?;
    if outcome == Outcome::Skipped {
        return Ok(());
    }

    let ident = camel_case(name);
    println!("\nRegister it in {}:", evals.join("eval.config.js").display());
    println!("  import * as {ident} from './{subdir}/{name}.js';");
    println!("  // ...then {}", hint.replace("{ident}", &ident));
    Ok(())
}

pub fn rubric(dir: &str) -> String {
    let run_cmd = format!("node {dir}/runner/run.js");
    render(templates::RUBRIC, &[("dir", dir), ("run_cmd", &run_cmd)])
}

/// Names become file names and JS identifiers, so keep them boring.
fn validate_name(name: &str) -> Result<()> {
    let mut chars = name.chars();
    let ok = chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_');
    if !ok {
        bail!("invalid name \"{name}\": use lowercase letters, digits, '-' and '_', starting with a letter");
    }
    Ok(())
}

fn validate_dir(dir: &str) -> Result<()> {
    let p = Path::new(dir);
    if dir.is_empty() || p.is_absolute() || p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        bail!("--dir must be a relative path inside the project, got \"{dir}\"");
    }
    Ok(())
}

fn camel_case(name: &str) -> String {
    let mut out = String::new();
    for (i, part) in name.split(['-', '_']).filter(|p| !p.is_empty()).enumerate() {
        if i == 0 {
            out.push_str(part);
        } else {
            let mut cs = part.chars();
            if let Some(first) = cs.next() {
                out.extend(first.to_uppercase());
                out.push_str(cs.as_str());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camel_cases() {
        assert_eq!(camel_case("gpt-4o_mini"), "gpt4oMini");
        assert_eq!(camel_case("exact-match"), "exactMatch");
        assert_eq!(camel_case("a"), "a");
    }

    #[test]
    fn names() {
        assert!(validate_name("my-model_2").is_ok());
        for bad in ["", "2fast", "Upper", "../x", "a b", "a.js"] {
            assert!(validate_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn dirs() {
        assert!(validate_dir("evals").is_ok());
        assert!(validate_dir("test/evals").is_ok());
        assert!(validate_dir("../evals").is_err());
        assert!(validate_dir("/evals").is_err());
    }
}
