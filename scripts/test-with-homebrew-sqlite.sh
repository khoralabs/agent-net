#!/usr/bin/env bash
# Run `bun test` with a Homebrew/system libsqlite3 that supports extension loading.
# Uses --preload so Database.setCustomSQLite runs before any test opens bun:sqlite.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Bun/npm often invoke scripts with a minimal PATH (no Homebrew).
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ -x /opt/homebrew/bin/brew ]]; then
    PATH="/opt/homebrew/bin:${PATH:-}"
  elif [[ -x /usr/local/bin/brew ]]; then
    PATH="/usr/local/bin:${PATH:-}"
  fi
fi

if [[ -z "${SQLITE_CUSTOM_LIB:-}" ]] && [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
  SQLITE_PREFIX="$(brew --prefix sqlite 2>/dev/null || true)"
  if [[ -n "${SQLITE_PREFIX}" && -f "${SQLITE_PREFIX}/lib/libsqlite3.dylib" ]]; then
    export SQLITE_CUSTOM_LIB="${SQLITE_PREFIX}/lib/libsqlite3.dylib"
  fi
fi

exec bun test --preload "$ROOT/scripts/preload-custom-sqlite.ts" "$@"
