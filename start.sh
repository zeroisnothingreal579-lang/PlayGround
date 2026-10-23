#!/usr/bin/env bash
# Build the static site into PROJECT_DIR/dist and serve it in the foreground.
# Static build only: there are no npm dependencies to install for site/.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
PORT="${PORT:-3000}"
SOURCE_DIR="${SOURCE_DIR:-$PROJECT_DIR/site}"
BUILD_DIR="${BUILD_DIR:-$PROJECT_DIR/dist}"
DEPLOYMENT_FILE="$WEB_DIR/deployment-output.json"

case "$PORT" in
  ''|*[!0-9]*)
    echo "PORT must be a positive integer, got: $PORT" >&2
    exit 1
    ;;
esac

/usr/bin/time -p mkdir -p "$WEB_DIR"

if ! /usr/bin/time -p test -f "$SOURCE_DIR/index.html"; then
  echo "Static source is missing: $SOURCE_DIR/index.html" >&2
  exit 1
fi

# Build/stage the static deployment output inside the project.
/usr/bin/time -p rm -rf "$BUILD_DIR"
/usr/bin/time -p mkdir -p "$BUILD_DIR"
/usr/bin/time -p cp -R "$SOURCE_DIR"/. "$BUILD_DIR"/

if ! /usr/bin/time -p test -f "$BUILD_DIR/index.html"; then
  echo "Build output is missing: $BUILD_DIR/index.html" >&2
  exit 1
fi

# Publish worker metadata; the directory is the absolute built static root.
/usr/bin/time -p node -e '
const fs = require("node:fs");
const [file, project, directory] = process.argv.slice(1);
fs.writeFileSync(file, JSON.stringify({ project, directory }) + "\n");
' "$DEPLOYMENT_FILE" "$PROJECT_DIR" "$BUILD_DIR"

/usr/bin/time -p cat "$DEPLOYMENT_FILE"

cd "$BUILD_DIR"
# Foreground server; the controller owns tmux and stops it on replacement.
/usr/bin/time -p python3 -m http.server "$PORT" --bind 0.0.0.0
