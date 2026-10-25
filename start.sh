#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-${APP_PORT:-3000}}"
export APP_PORT="$PORT"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  npm run build
fi

exec node dist-server/index.mjs
