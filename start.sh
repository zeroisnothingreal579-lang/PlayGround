#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROJECT_DIR="$SCRIPT_DIR"
BUILD_DIR="$PROJECT_DIR/dist"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DEPLOYMENT_OUTPUT="$WEB_DIR/deployment-output.json"

mkdir -p "$WEB_DIR"

run_timed() {
  printf '\n[start.sh] +'
  printf ' %q' "$@"
  printf '\n'
  /usr/bin/time -p "$@"
}

if [[ ! -x "$PROJECT_DIR/node_modules/.bin/vite" ]]; then
  run_timed npm install --no-audit --no-fund
fi

run_timed npm run build

run_timed node -e '
const fs = require("node:fs");
const path = require("node:path");
const [project, directory, output] = process.argv.slice(1);
const payload = { project: path.resolve(project), directory: path.resolve(directory) };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(payload));
console.log(JSON.stringify(payload));
' "$PROJECT_DIR" "$BUILD_DIR" "$DEPLOYMENT_OUTPUT"

printf '\n[start.sh] serving %s on 0.0.0.0:%s\n' "$BUILD_DIR" "$PORT"
exec /usr/bin/time -p node "$PROJECT_DIR/node_modules/vite/bin/vite.js" preview --host 0.0.0.0 --port "$PORT" --strictPort
