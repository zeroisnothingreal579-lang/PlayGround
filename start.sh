#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${OPENCODE_WEB_DIR:-${RUNNER_TEMP:-/tmp}/omgithub-web}"
PORT="${PORT:-3000}"
STATIC_DIR="$PROJECT_DIR/dist/client"

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

cd "$PROJECT_DIR"
export PORT
if [ -z "${ANDROID_HOME:-}" ]; then
  for candidate in /usr/local/lib/android/sdk /opt/android-sdk "$HOME/android-sdk"; do
    if [ -d "$candidate" ]; then ANDROID_HOME="$candidate"; break; fi
  done
fi
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
if [ -z "${ANDROID_AVD_HOME:-}" ]; then
  if [ -d "$HOME/.config/.android/avd" ]; then export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
  elif [ -d "$HOME/.android/avd" ]; then export ANDROID_AVD_HOME="$HOME/.android/avd"; fi
fi
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# KVM is required for a usable hardware-accelerated Android emulator.
if [ -e /dev/kvm ] && [ ! -w /dev/kvm ]; then
  sudo chmod 666 /dev/kvm 2>/dev/null || true
fi

timed "create metadata directory" mkdir -p "$WEB_DIR"
timed "write deployment-output.json" node -e '
const fs = require("node:fs");
const path = require("node:path");
const [project, webDir, directory] = process.argv.slice(1);
fs.mkdirSync(webDir, { recursive: true });
fs.writeFileSync(
  path.join(webDir, "deployment-output.json"),
  JSON.stringify({ project, directory }) + "\n",
);
' "$PROJECT_DIR" "$WEB_DIR" "$STATIC_DIR"

install_needed=false
if [ ! -d node_modules ]; then
  install_needed=true
elif [ -f node_modules/.package-lock.json ] && [ package.json -nt node_modules/.package-lock.json ]; then
  install_needed=true
fi
if [ "$install_needed" = true ]; then
  timed "install dependencies" npm install --no-audit --no-fund
else
  printf '[timing] install dependencies: skipped (up to date)\n' >&2
fi

build_needed=false
if [ ! -f dist/client/index.html ] || [ ! -f dist/server/src/index.js ]; then
  build_needed=true
elif find client server shared db -type f -newer dist/client/index.html -print -quit 2>/dev/null | grep -q .; then
  build_needed=true
else
  for file in package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.server.json tailwind.config.js postcss.config.js; do
    if [ -f "$file" ] && [ "$file" -nt dist/client/index.html ]; then
      build_needed=true
      break
    fi
  done
fi
if [ "$build_needed" = true ]; then
  timed "build client and server" npm run build
else
  printf '[timing] build client and server: skipped (up to date)\n' >&2
fi

printf '[timing] serve: starting foreground server on port %s\n' "$PORT" >&2
exec node dist/server/src/index.js
