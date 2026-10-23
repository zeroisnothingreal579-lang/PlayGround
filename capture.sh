#!/usr/bin/env bash
# Capture desktop and mobile screenshots of a preview URL.
# Exit 75 for transient navigation/browser infrastructure failures.
# Exit 1 for script or rendering defects.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CAPTURE_URL="${CAPTURE_URL:-}"
CAPTURE_DIR="${CAPTURE_DIR:-}"
RUNTIME_DIR="${RUNTIME_DIR:?RUNTIME_DIR is required}"

if /usr/bin/time -p test -z "$CAPTURE_URL" || /usr/bin/time -p test -z "$CAPTURE_DIR"; then
  echo "Set CAPTURE_URL and CAPTURE_DIR." >&2
  exit 1
fi

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
CAPTURE_DIR="$(cd "$CAPTURE_DIR" && pwd -P)"

case "$CAPTURE_DIR/" in
  "$PROJECT_DIR"/*)
    echo "CAPTURE_DIR must be outside the source tree: $CAPTURE_DIR" >&2
    exit 1
    ;;
esac

/usr/bin/time -p test -f "$RUNTIME_DIR/scripts/default-capture.mjs"

set +e
/usr/bin/time -p env CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" \
  node "$RUNTIME_DIR/scripts/default-capture.mjs"
status=$?
set -e

case "$status" in
  0) ;;
  75) exit 75 ;;
  *) exit 1 ;;
esac

/usr/bin/time -p test -s "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -s "$CAPTURE_DIR/final-mobile.png"
/usr/bin/time -p ls -l "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"
