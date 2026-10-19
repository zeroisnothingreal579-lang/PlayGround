#!/usr/bin/env bash
set -euo pipefail

CAPTURE_URL="${CAPTURE_URL:-}"
CAPTURE_DIR="${CAPTURE_DIR:-${RUNNER_TEMP:-/tmp}/clouddroid-capture}"
SESSION="${CAPTURE_SESSION:-clouddroid-capture-$$}"

now_ms() { date +%s%3N; }

timed() {
  local label="$1"
  shift
  local start end rc
  start="$(now_ms)"
  set +e
  "$@"
  rc=$?
  set -e
  end="$(now_ms)"
  printf '[timing] %s: %sms (exit %s)\n' "$label" "$((end - start))" "$rc" >&2
  return "$rc"
}

run_pw() {
  local label="$1"
  shift
  timed "$label" playwright-cli -s="$SESSION" "$@"
}

die() {
  local code="$1"
  shift
  printf 'capture: %s\n' "$*" >&2
  exit "$code"
}

if [ -z "$CAPTURE_URL" ]; then
  die 1 "CAPTURE_URL is required (for example https://preview.example.com)"
fi
command -v playwright-cli >/dev/null 2>&1 || die 75 "playwright-cli is unavailable"

timed "prepare capture directory" mkdir -p "$CAPTURE_DIR"
CAPTURE_DIR="$(cd "$CAPTURE_DIR" && pwd)"

cleanup() {
  local rc=$?
  playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true
  return "$rc"
}
trap cleanup EXIT INT TERM

# A failed HTTP navigation is a temporary infrastructure problem, not a render bug.
if ! timed "preflight navigation" curl -fsSL --max-time 20 -o /dev/null "$CAPTURE_URL"; then
  die 75 "could not reach $CAPTURE_URL"
fi

if ! run_pw "open exact URL" open "$CAPTURE_URL"; then
  die 75 "browser failed to open $CAPTURE_URL"
fi

render_info="$(run_pw "wait for rendered content" run-code 'async (page) => {
  await page.waitForSelector("#root", { timeout: 15000 });
  await page.waitForFunction(() => {
    const root = document.querySelector("#root");
    return Boolean(root && root.children.length > 0);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  return page.evaluate(() => ({
    title: document.title,
    rootChildren: document.querySelector("#root")?.children.length || 0,
    textLength: document.body.innerText.trim().length,
  }));
}')" || die 1 "page did not finish rendering"

if ! printf '%s' "$render_info" | grep -qE '"?rootChildren"?[: ]+[1-9]'; then
  printf '%s\n' "$render_info" >&2
  die 1 "page rendered no application content"
fi
if ! printf '%s' "$render_info" | grep -qE '"?textLength"?[: ]+[1-9]'; then
  printf '%s\n' "$render_info" >&2
  die 1 "page rendered without visible text"
fi

if ! run_pw "resize desktop viewport" resize 1440 900; then
  die 1 "could not apply desktop viewport"
fi
run_pw "settle desktop layout" run-code 'async (page) => page.waitForTimeout(500)' >/dev/null \
  || die 1 "desktop layout did not settle"
if ! run_pw "capture desktop screenshot" screenshot --filename="$CAPTURE_DIR/final-desktop.png" --full-page; then
  die 1 "desktop screenshot failed"
fi

if ! run_pw "resize mobile viewport" resize 390 844; then
  die 1 "could not apply mobile viewport"
fi
if ! run_pw "reload for mobile layout" reload; then
  die 1 "mobile reload failed"
fi
run_pw "wait for mobile content" run-code 'async (page) => {
  await page.waitForSelector("#root", { timeout: 15000 });
  await page.waitForFunction(() => {
    const root = document.querySelector("#root");
    return Boolean(root && root.children.length > 0);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  return true;
}' >/dev/null || die 1 "mobile page did not finish rendering"
if ! run_pw "capture mobile screenshot" screenshot --filename="$CAPTURE_DIR/final-mobile.png" --full-page; then
  die 1 "mobile screenshot failed"
fi

for name in final-desktop.png final-mobile.png; do
  file="$CAPTURE_DIR/$name"
  [ -s "$file" ] || die 1 "missing or empty screenshot: $file"
  size="$(stat -c%s "$file")"
  [ "$size" -gt 5000 ] || die 1 "screenshot looks blank: $file ($size bytes)"
  printf 'capture: %s (%s bytes)\n' "$file" "$size"
done

if ! timed "close browser" playwright-cli -s="$SESSION" close >/dev/null 2>&1; then
  printf 'capture: warning: browser session did not close cleanly\n' >&2
fi
trap - EXIT INT TERM
printf 'capture: desktop and mobile screenshots saved to %s\n' "$CAPTURE_DIR"
