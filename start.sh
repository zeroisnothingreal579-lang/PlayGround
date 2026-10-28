#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -n "${OPENCODE_WEB_DIR:-}" ]]; then
  /usr/bin/time -p node -e "const fs=require('fs'),p=require('path');fs.writeFileSync(p.join(process.env.OPENCODE_WEB_DIR,'deployment-output.json'),JSON.stringify({project:process.cwd(),directory:p.join(process.cwd(),'public')}))"
fi

exec /usr/bin/time -p node server.mjs
