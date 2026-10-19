#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
SOURCE_DIR="$PROJECT_DIR/site"
DIST_DIR="$PROJECT_DIR/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-}"

log() { printf '[start] %s\n' "$*"; }

log "project=$PROJECT_DIR dist=$DIST_DIR port=$PORT"

# Build the static output inside PROJECT_DIR. No runtime dependencies are needed.
/usr/bin/time -p rm -rf "$DIST_DIR"
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p cp -R "$SOURCE_DIR/." "$DIST_DIR/"

if [ ! -f "$DIST_DIR/index.html" ]; then
  log "build produced no index.html in $DIST_DIR"
  exit 1
fi

# Declare the built output for the worker sync; worker metadata only.
if [ -n "$WEB_DIR" ]; then
  /usr/bin/time -p env PROJECT="$PROJECT_DIR" DIRECTORY="$DIST_DIR" OUT="$WEB_DIR/deployment-output.json" \
    node --input-type=module -e \
    'import { writeFileSync } from "node:fs"; writeFileSync(process.env.OUT, JSON.stringify({ project: process.env.PROJECT, directory: process.env.DIRECTORY }))'
  log "wrote $WEB_DIR/deployment-output.json"
else
  log "OPENCODE_WEB_DIR is unset; skipping deployment-output.json"
fi

# Serve in the foreground so the process stays alive for the worker.
log "serving $DIST_DIR on port $PORT"
/usr/bin/time -p node "$PROJECT_DIR/serve.mjs" "$DIST_DIR" "$PORT"
