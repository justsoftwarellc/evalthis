# How to install and develop evalme

`evalme` is the CLI. This guide covers installing it, then working on it locally.

## 1. Install

From a clone of this repo:

```sh
./install.sh
evalme --help
```

`install.sh` checks for everything needed to build and run `evalme`, and installs what is missing
(it asks first; pass `--yes` to skip the prompt):

| Dependency | Why | How it is installed |
| --- | --- | --- |
| `curl` | fetches rustup | system package manager (apt, dnf, pacman, apk, brew) |
| C compiler (`cc`) | Rust links the binary with it | `build-essential` / `gcc` / `base-devel`; on macOS run `xcode-select --install` yourself |
| Rust (`cargo`) | builds the binary | rustup |
| Node.js 20+ | runs the evals `evalme` generates, and the integration tests | NodeSource (apt) or your package manager |

Then it runs the tests, builds in release mode and copies the binary to `~/.local/bin/evalme`.

```sh
./install.sh --prefix /usr/local    # install to /usr/local/bin (may need sudo)
./install.sh --yes                  # install missing dependencies without asking
./install.sh --uninstall            # remove the binary
```

If `~/.local/bin` is not on your `PATH`, the script prints the line to add to your shell profile.
Installing with cargo directly also works (`cargo install --path .`, puts `evalme` in `~/.cargo/bin`),
but it will not install the other dependencies for you.

Quick check in any Node project:

```sh
cd my-node-project
evalme init
node evals/runner/run.js -v         # runs offline with the placeholder model
```

## 2. Local development

You need the same dependencies as above. Run `./install.sh` once to get them, or install them yourself.

### Where things are

```
src/main.rs         CLI definition (clap) and dispatch
src/commands.rs     init, add, rubric
src/scaffold.rs     file writing (no overwrite, --dry-run) and the package.json edit
src/templates.rs    the list of files init writes; embeds templates/ at compile time
templates/init/     files written by `evalme init`, exactly as the user will see them
templates/new/      stubs written by `evalme add ...`
tests/cli.rs        integration tests: scaffold a temp project, run the generated runner with node
install.sh          install dependencies, build and install the binary
```

The generated framework is plain files under `templates/`. To change what users get, edit those files
(`{{name}}`, `{{dir}}` and `{{run_cmd}}` are the only placeholders). Add a new generated file by creating
it under `templates/init/` and listing it in `src/templates.rs`.

### Build, run, test

```sh
cargo build                         # debug build -> target/debug/evalme
cargo test                          # unit + integration tests
cargo run -- init /tmp/demo         # run the CLI without installing
cargo run -- add model my-model --dir /tmp/demo/evals
```

Try your change end to end in a scratch project:

```sh
mkdir /tmp/demo && cd /tmp/demo && echo '{"name":"demo"}' > package.json
/path/to/repo/target/debug/evalme init
node evals/runner/run.js -v          # runs offline with the placeholder model
```

Template edits require a rebuild (they are embedded in the binary). Results land in
`evals/results/*.json`.

To build the release binary by hand: `cargo build --release` (`target/release/evalme`). It is
self-contained, so you can copy it anywhere on your `PATH`. Re-run `./install.sh` to update the
installed copy.

### Before you commit

```sh
cargo fmt && cargo test
```

Keep `templates/init/RUBRIC.md` and the runner in step: the rubric describes the JSON output and the
runner's behaviour, and the integration tests assert on that output.
