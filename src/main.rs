mod commands;
mod scaffold;
mod templates;

use anyhow::Result;
use clap::{Parser, Subcommand};
use commands::GraderKind;
use scaffold::Writer;
use std::path::PathBuf;

/// Scaffold an opinionated, model-agnostic eval framework into a Node.js project.
///
/// You define models, tasks and graders. evalthis generates the structure, a small
/// readable runner, and a rubric for running evaluations. Everything it writes is a
/// plain file you own and can edit.
#[derive(Parser)]
#[command(version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(clap::Args, Clone, Copy)]
struct WriteFlags {
    /// Replace files that already exist (default: skip them)
    #[arg(long, global = true)]
    force: bool,
    /// Print what would be written, change nothing
    #[arg(long, global = true)]
    dry_run: bool,
}

impl From<WriteFlags> for Writer {
    fn from(f: WriteFlags) -> Self {
        Writer { force: f.force, dry_run: f.dry_run }
    }
}

#[derive(Subcommand)]
enum Command {
    /// Create the eval framework (default: ./evals) in a Node.js project
    Init {
        /// Project root
        #[arg(default_value = ".")]
        root: PathBuf,
        /// Folder for the evals, relative to the project root
        #[arg(long, default_value = "evals")]
        dir: String,
        /// Do not add an `eval` script to package.json
        #[arg(long)]
        no_package_json: bool,
        #[command(flatten)]
        write: WriteFlags,
    },
    /// Add a model, task or grader stub to an existing eval folder
    Add {
        /// The evals folder created by `init`
        #[arg(long, default_value = "evals", global = true)]
        dir: PathBuf,
        #[command(flatten)]
        write: WriteFlags,
        #[command(subcommand)]
        what: Add,
    },
    /// Print the rubric: how to run, grade and read evaluations
    Rubric {
        /// Folder name to show in the examples
        #[arg(long, default_value = "evals")]
        dir: String,
    },
}

#[derive(Subcommand)]
enum Add {
    /// A model under evaluation (any SDK, endpoint or agent)
    Model { name: String },
    /// The LLM that runs each eval session (declared like a model)
    Orchestrator { name: String },
    /// A task: a named list of cases
    Task { name: String },
    /// A quality or cost grader
    Grader {
        #[arg(value_enum)]
        kind: GraderKind,
        name: String,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Init { root, dir, no_package_json, write } => commands::init(&root, &dir, no_package_json, write.into()),
        Command::Add { dir, write, what } => match what {
            Add::Model { name } => commands::add_model(&dir, &name, write.into()),
            Add::Orchestrator { name } => commands::add_orchestrator(&dir, &name, write.into()),
            Add::Task { name } => commands::add_task(&dir, &name, write.into()),
            Add::Grader { kind, name } => commands::add_grader(&dir, kind, &name, write.into()),
        },
        Command::Rubric { dir } => {
            print!("{}", commands::rubric(&dir));
            Ok(())
        }
    }
}
