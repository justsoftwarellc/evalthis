#!/usr/bin/env bash
# Build evalthis from source and install the binary on this machine.
#
#   ./install.sh                     install to ~/.local/bin
#   ./install.sh --prefix /usr/local install to /usr/local/bin (may need sudo)
#   ./install.sh --yes               do not ask before installing Rust
#   ./install.sh --uninstall         remove the installed binary
#
# What it does, in order: check for a C compiler and Rust (offering to install
# Rust via rustup), run the tests, build in release mode, copy the binary.
set -euo pipefail

PREFIX="${HOME}/.local"
ASSUME_YES=0
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="${2:?--prefix needs a directory}"; shift 2 ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

BIN_DIR="${PREFIX}/bin"
TARGET="${BIN_DIR}/evalthis"
say() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

if [ "$UNINSTALL" -eq 1 ]; then
  if [ -e "$TARGET" ]; then rm -f "$TARGET"; say "removed ${TARGET}"; else say "nothing at ${TARGET}"; fi
  exit 0
fi

cd "$(dirname "$0")"

# 1. A C compiler/linker: Rust uses it to link the final binary.
if ! command -v cc >/dev/null 2>&1; then
  case "$(uname -s)" in
    Darwin) hint="run: xcode-select --install" ;;
    *) hint="install one, e.g. Debian/Ubuntu: sudo apt install build-essential; Fedora: sudo dnf install gcc" ;;
  esac
  die "no C compiler found (cc). ${hint}"
fi

# 2. Rust.
[ -f "${HOME}/.cargo/env" ] && . "${HOME}/.cargo/env"
if ! command -v cargo >/dev/null 2>&1; then
  say "Rust (cargo) is not installed."
  if [ "$ASSUME_YES" -ne 1 ]; then
    [ -t 0 ] || die "cargo not found; install Rust from https://rustup.rs or re-run with --yes"
    read -r -p "Install Rust with rustup now? [y/N] " reply
    case "$reply" in y|Y|yes) ;; *) die "Rust is required. Install it from https://rustup.rs and re-run." ;; esac
  fi
  command -v curl >/dev/null 2>&1 || die "curl is required to install rustup"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  . "${HOME}/.cargo/env"
fi
say "using $(cargo --version)"

# 3. Tests, then the release build.
say "running tests"
cargo test --locked --quiet
say "building release binary"
cargo build --release --locked

# 4. Install.
mkdir -p "$BIN_DIR" || die "cannot create ${BIN_DIR} (try a different --prefix, or sudo)"
install -m 755 target/release/evalthis "$TARGET" || die "cannot write ${TARGET} (try a different --prefix, or sudo)"
say "installed ${TARGET}"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) say "${BIN_DIR} is not on your PATH. Add this to your shell profile:"
     printf '      export PATH="%s:$PATH"\n' "$BIN_DIR" ;;
esac

command -v node >/dev/null 2>&1 \
  || say "note: Node.js 20+ is needed to run the evals evalthis generates (not to install evalthis)."
say "done. Try: evalthis --help"
