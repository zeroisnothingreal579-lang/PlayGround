#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm ci --include=dev --no-audit --no-fund
fi

npm run build
exec node server/index.mjs
