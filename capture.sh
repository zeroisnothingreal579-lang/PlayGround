#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

: "${CAPTURE_URL:?CAPTURE_URL is required}"
: "${CAPTURE_DIR:?CAPTURE_DIR is required}"
RUNTIME_DIR="${RUNTIME_DIR:?}"

# Capture evidence lives outside the source tree; never write into PROJECT_DIR.
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

# Drop stale artifacts so a failed run cannot be mistaken for a fresh capture.
/usr/bin/time -p rm -f "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"

# Opens CAPTURE_URL in Chromium, waits for rendered content, and writes
# final-desktop.png and final-mobile.png. Exits 75 for transient browser or
# navigation failures and 1 for script or rendering defects. The app server is
# left running.
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-capture.mjs"

/usr/bin/time -p test -s "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -s "$CAPTURE_DIR/final-mobile.png"

printf '[capture] wrote %s/final-desktop.png and %s/final-mobile.png\n' "$CAPTURE_DIR" "$CAPTURE_DIR"
