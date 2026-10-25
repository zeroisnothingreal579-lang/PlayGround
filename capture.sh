#!/usr/bin/env bash
set -euo pipefail

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL to capture.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the project.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPTURE_PATH="$(realpath -m "$CAPTURE_DIR")"
PROJECT_PATH="$(realpath -m "$SCRIPT_DIR")"

case "$CAPTURE_PATH" in
  "$PROJECT_PATH"|"$PROJECT_PATH"/*)
    printf '[capture.sh] CAPTURE_DIR must be outside the project source: %s\n' "$CAPTURE_PATH" >&2
    exit 1
    ;;
esac

run_timed() {
  printf '\n[capture.sh] +'
  printf ' %q' "$@"
  printf '\n'
  /usr/bin/time -p "$@"
}

run_timed mkdir -p "$CAPTURE_PATH"
printf '[capture.sh] URL: %s\n[capture.sh] Output: %s\n' "$CAPTURE_URL" "$CAPTURE_PATH"
run_timed node "$SCRIPT_DIR/scripts/capture.mjs"
