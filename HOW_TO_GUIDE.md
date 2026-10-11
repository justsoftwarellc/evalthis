# How to develop and build evalthis

## What you need

- **Rust** (stable), which includes `cargo`. Install from <https://rustup.rs>.
- **A C compiler/linker** (`cc`): `build-essential` on Debian/Ubuntu, `xcode-select --install` on macOS.
- **Node.js 20+**, only for the tests that run the generated eval runner. Without it those tests skip themselves.

## Where things are

```
src/main.rs         CLI definition (clap) and dispatch
src/commands.rs     init, add, rubric
src/scaffold.rs     file writing (no overwrite, --dry-run) and the package.json edit
src/templates.rs    the list of files init writes; embeds templates/ at compile time
templates/init/     files written by `evalthis init`, exactly as the user will see them
templates/new/      stubs written by `evalthis add ...`
tests/cli.rs        integration tests: scaffold a temp project, run the generated runner with node
install.sh          build and install the binary
```

The generated framework is plain files under `templates/`. To change what users get, edit those files
(`{{name}}`, `{{dir}}` and `{{run_cmd}}` are the only placeholders). Add a new generated file by creating
it under `templates/init/` and listing it in `src/templates.rs`.

## Develop locally

```sh
cargo build                         # debug build -> target/debug/evalthis
cargo test                          # unit + integration tests
cargo run -- init /tmp/demo         # run the CLI without installing
cargo run -- add model my-model --dir /tmp/demo/evals
```

Try your change end to end in a scratch project:

```sh
mkdir /tmp/demo && cd /tmp/demo && echo '{"name":"demo"}' > package.json
/path/to/repo/target/debug/evalthis init
node evals/runner/run.js -v          # runs offline with the placeholder model
```

Template edits require a rebuild (they are embedded in the binary). Results land in
`evals/results/*.json`.

## Build the binary

```sh
cargo build --release               # -> target/release/evalthis
```

The binary is self-contained (templates are embedded); copy it anywhere on your `PATH`.

## Install it

```sh
./install.sh                        # tests, release build, installs to ~/.local/bin
./install.sh --prefix /usr/local    # elsewhere (may need sudo)
./install.sh --yes                  # install Rust automatically if missing
./install.sh --uninstall            # remove it
```

Or with cargo directly: `cargo install --path .` (installs to `~/.cargo/bin`).

## Before you commit

```sh
cargo fmt && cargo test
```

Keep `templates/init/RUBRIC.md` and the runner in step: the rubric describes the JSON output and the
runner's behaviour, and the integration tests assert on that output.
