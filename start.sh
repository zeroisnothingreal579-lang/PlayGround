#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

npm run build

export NODE_ENV=production
export PORT="${PORT:-${APP_PORT:-3000}}"
export HOST="${HOST:-0.0.0.0}"

exec npm start
