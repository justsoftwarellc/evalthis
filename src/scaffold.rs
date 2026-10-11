//! File writing shared by `init` and `add`. Every action is reported, nothing is
//! overwritten without `--force`, and `--dry-run` writes nothing at all.

use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

#[derive(Clone, Copy)]
pub struct Writer {
    pub force: bool,
    pub dry_run: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Created,
    Overwritten,
    Skipped,
}

impl Writer {
    pub fn write(&self, path: &Path, contents: &str) -> Result<Outcome> {
        let exists = path.exists();
        let outcome = match (exists, self.force) {
            (false, _) => Outcome::Created,
            (true, true) => Outcome::Overwritten,
            (true, false) => Outcome::Skipped,
        };
        match outcome {
            Outcome::Created => println!("  create     {}", path.display()),
            Outcome::Overwritten => println!("  overwrite  {}", path.display()),
            Outcome::Skipped => println!("  skip       {} (exists, use --force to replace)", path.display()),
        }
        if outcome != Outcome::Skipped && !self.dry_run {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
            }
            fs::write(path, contents).with_context(|| format!("writing {}", path.display()))?;
        }
        Ok(outcome)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ScriptOutcome {
    Added,
    AlreadySet,
    /// An `eval` script exists and does something else; left untouched.
    Conflict(String),
    NoPackageJson,
}

/// Add `scripts.<name> = <command>` to `<root>/package.json` without disturbing
/// anything else in the file.
pub fn add_npm_script(root: &Path, name: &str, command: &str, dry_run: bool) -> Result<ScriptOutcome> {
    let path = root.join("package.json");
    if !path.exists() {
        return Ok(ScriptOutcome::NoPackageJson);
    }
    let text = fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    let mut pkg: Value = serde_json::from_str(&text).with_context(|| format!("{} is not valid JSON", path.display()))?;
    let obj = pkg.as_object_mut().with_context(|| format!("{} is not a JSON object", path.display()))?;
    let scripts = obj.entry("scripts").or_insert_with(|| json!({}));
    let scripts = scripts.as_object_mut().with_context(|| "package.json \"scripts\" is not an object")?;

    match scripts.get(name).and_then(Value::as_str) {
        Some(existing) if existing == command => return Ok(ScriptOutcome::AlreadySet),
        Some(existing) => return Ok(ScriptOutcome::Conflict(existing.to_string())),
        None => {}
    }
    scripts.insert(name.to_string(), json!(command));
    if !dry_run {
        let mut out = serde_json::to_string_pretty(&pkg)?;
        out.push('\n');
        fs::write(&path, out).with_context(|| format!("writing {}", path.display()))?;
    }
    Ok(ScriptOutcome::Added)
}
