#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
  RESOLVED_NODE_BIN="${NODE_BIN}"
elif [[ -x "/opt/homebrew/bin/node" ]]; then
  RESOLVED_NODE_BIN="/opt/homebrew/bin/node"
elif [[ -x "/usr/local/bin/node" ]]; then
  RESOLVED_NODE_BIN="/usr/local/bin/node"
elif command -v node >/dev/null 2>&1; then
  RESOLVED_NODE_BIN="$(command -v node)"
else
  echo "Could not find a usable node binary." >&2
  exit 127
fi

cd "$PROJECT_ROOT"

if [[ -f ".env" ]]; then
  set -a
  source ".env"
  set +a
fi

exec "$RESOLVED_NODE_BIN" server.js
