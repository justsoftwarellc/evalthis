#!/usr/bin/env bash
# Build evalme from source and install the `evalme` binary on this machine.
#
#   ./install.sh                     install to ~/.local/bin
#   ./install.sh --prefix /usr/local install to /usr/local/bin (may need sudo)
#   ./install.sh --yes               do not ask before installing dependencies
#   ./install.sh --uninstall         remove the installed binary
#
# What it does, in order: check for (and offer to install) curl, a C compiler,
# Rust (via rustup) and Node.js 20+, run the tests, build in release mode, copy
# the binary.
set -euo pipefail

PREFIX="${HOME}/.local"
ASSUME_YES=0
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="${2:?--prefix needs a directory}"; shift 2 ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

BIN_DIR="${PREFIX}/bin"
TARGET="${BIN_DIR}/evalme"
say() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

if [ "$UNINSTALL" -eq 1 ]; then
  if [ -e "$TARGET" ]; then rm -f "$TARGET"; say "removed ${TARGET}"; else say "nothing at ${TARGET}"; fi
  exit 0
fi

cd "$(dirname "$0")"

# The animated wordmark. Optional by design: a missing banner.sh must never
# stop an install.
if [ -f banner.sh ]; then
  . ./banner.sh
  banner_show
fi

# Run a command as root: directly when we are root, otherwise via sudo.
as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else die "need root to run: $* (install sudo or re-run as root)"
  fi
}

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ -t 0 ] || die "$1 is required; re-run with --yes to install it automatically"
  read -r -p "Install $1 now? [y/N] " reply
  case "$reply" in y|Y|yes) ;; *) die "$1 is required. Install it and re-run." ;; esac
}

# Install system packages with whichever package manager this host has.
# Usage: pkg_install <apt pkgs> -- <dnf pkgs> -- <pacman pkgs> -- <apk pkgs> -- <brew pkgs>
pkg_install() {
  local idx
  if command -v apt-get >/dev/null 2>&1; then idx=0
  elif command -v dnf >/dev/null 2>&1; then idx=1
  elif command -v pacman >/dev/null 2>&1; then idx=2
  elif command -v apk >/dev/null 2>&1; then idx=3
  elif command -v brew >/dev/null 2>&1; then idx=4
  else return 1; fi
  local -a sets=()
  local cur="" a
  for a in "$@"; do
    if [ "$a" = "--" ]; then sets+=("$cur"); cur=""; else cur="${cur:+$cur }$a"; fi
  done
  sets+=("$cur")
  local pkgs="${sets[$idx]}"
  [ -n "$pkgs" ] || return 1
  case "$idx" in
    0) as_root apt-get update -qq && as_root apt-get install -y $pkgs ;;
    1) as_root dnf install -y $pkgs ;;
    2) as_root pacman -S --noconfirm --needed $pkgs ;;
    3) as_root apk add $pkgs ;;
    4) brew install $pkgs ;;
  esac
}

# 1. curl (fetches rustup) and a C compiler/linker (Rust uses it to link).
if ! command -v curl >/dev/null 2>&1; then
  say "curl is not installed."
  confirm curl
  pkg_install curl -- curl -- curl -- curl -- curl || die "cannot install curl automatically; install it and re-run"
fi

if ! command -v cc >/dev/null 2>&1; then
  say "no C compiler found."
  [ "$(uname -s)" = Darwin ] && die "run: xcode-select --install, then re-run"
  confirm "a C toolchain"
  pkg_install build-essential -- gcc -- base-devel -- build-base -- gcc \
    || die "cannot install a C compiler automatically; install gcc and re-run"
fi

# 2. Rust.
[ -f "${HOME}/.cargo/env" ] && . "${HOME}/.cargo/env"
if ! command -v cargo >/dev/null 2>&1; then
  say "Rust (cargo) is not installed."
  confirm Rust
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  . "${HOME}/.cargo/env"
fi
say "using $(cargo --version)"

# 3. Node.js 20+: runs the evals evalme generates, and the tests that exercise them.
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if ! node_ok; then
  say "Node.js 20+ is not installed (needed to run the generated evals)."
  confirm "Node.js"
  if command -v apt-get >/dev/null 2>&1; then
    # Distro nodejs is often too old; use NodeSource's 20.x.
    { curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash - && as_root apt-get install -y nodejs; } || true
  else
    pkg_install nodejs -- nodejs -- nodejs -- nodejs -- node || true
  fi
  node_ok || die "could not install Node.js 20+ automatically; install it from https://nodejs.org and re-run"
fi
say "using node $(node --version)"

# 4. Tests, then the release build.
say "running tests"
cargo test --locked --quiet
say "building release binary"
cargo build --release --locked

# 5. Install.
mkdir -p "$BIN_DIR" || die "cannot create ${BIN_DIR} (try a different --prefix, or sudo)"
install -m 755 target/release/evalme "$TARGET" || die "cannot write ${TARGET} (try a different --prefix, or sudo)"
say "installed ${TARGET}"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) say "${BIN_DIR} is not on your PATH. Add this to your shell profile:"
     printf '      export PATH="%s:$PATH"\n' "$BIN_DIR" ;;
esac

say "done. Try: evalme --help"
