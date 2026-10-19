#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
cd "$PROJECT_DIR"

OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-$PROJECT_DIR/.opencode-web}"
PORT="${PORT:-3000}"
[[ "$PORT" =~ ^[1-9][0-9]*$ ]] || { echo 'PORT must be a positive integer.' >&2; exit 1; }

timed() {
  local label="$1"
  shift
  printf '\n[timing] %s\n' "$label" >&2
  /usr/bin/time -p "$@"
}

umask 022
export NEXT_TELEMETRY_DISABLED=1

timed "create runtime directories" mkdir -p "$OPENCODE_WEB_DIR" "$PROJECT_DIR/out"

deps_hash="$(timed "hash dependency manifests" sh -c 'sha256sum package.json package-lock.json | sha256sum | cut -d " " -f1')"
deps_stamp="$OPENCODE_WEB_DIR/start-dependencies.sha"
needs_install=false
if [[ ! -d "$PROJECT_DIR/node_modules" || ! -f "$deps_stamp" ]]; then
  needs_install=true
elif [[ "$(cat "$deps_stamp")" != "$deps_hash" ]]; then
  needs_install=true
fi
if [[ "$needs_install" == true ]]; then
  timed "install dependencies" npm ci --no-audit --no-fund
  timed "record dependency hash" sh -c 'printf "%s" "$1" > "$2"' _ "$deps_hash" "$deps_stamp"
else
  printf '\n[timing] dependencies already installed\n' >&2
fi

timed "build application" npm run build

app_url="${APP_URL:-}"
if [[ -z "$app_url" && -f "$OPENCODE_WEB_DIR/app-url" ]]; then
  app_url="$(timed "read public preview url" cat "$OPENCODE_WEB_DIR/app-url" || true)"
fi
app_url="$(printf '%s' "$app_url" | tr -d '\r\n')"

out_dir="$PROJECT_DIR/out"
timed "write static deployment page" python3 - "$out_dir/index.html" "$app_url" "$PORT" <<'PY'
import html
import json
import sys

path, url, port = sys.argv[1], sys.argv[2].strip(), sys.argv[3]
escaped = html.escape(url, quote=True)
if url:
    refresh = f'<meta http-equiv="refresh" content="0; url={escaped}">'
    action = f'''<p class="lead">This build is served by the Replica Studio application server.</p>
      <a class="button" href="{escaped}">Open Replica Studio</a>
      <script>window.location.replace({json.dumps(url)});</script>'''
else:
    refresh = ''
    action = f'''<p class="lead">The application server is running locally on port {html.escape(port)}.</p>
      <a class="button" href="http://127.0.0.1:{html.escape(port)}/">Open Replica Studio</a>'''

document = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Replica Studio</title>
  {refresh}
  <style>
    :root {{ color-scheme: dark; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, #09090b 55%); color: #fafafa;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ width: min(34rem, 100%); border: 1px solid #27272a; border-radius: 1rem;
      background: rgba(9, 9, 11, .82); padding: 2.5rem; box-shadow: 0 24px 80px rgba(0, 0, 0, .45); }}
    .badge {{ display: inline-flex; align-items: center; gap: .4rem; border: 1px solid #3f3f46;
      border-radius: 999px; padding: .3rem .75rem; color: #a1a1aa; font-size: .75rem;
      letter-spacing: .08em; text-transform: uppercase; }}
    h1 {{ margin: 1.1rem 0 .6rem; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.04em; }}
    p {{ margin: 0 0 1.5rem; color: #a1a1aa; line-height: 1.6; }}
    .button {{ display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem;
      border-radius: .65rem; background: #fafafa; color: #09090b; padding: 0 1.15rem;
      font-weight: 600; text-decoration: none; }}
    .button:hover {{ background: #e4e4e7; }}
  </style>
</head>
<body>
  <main>
    <span class="badge">Replica Studio</span>
    <h1>AI app replication workspace</h1>
    {action}
  </main>
</body>
</html>
'''
with open(path, 'w', encoding='utf-8') as handle:
    handle.write(document)
PY

timed "write deployment metadata" python3 - "$OPENCODE_WEB_DIR/deployment-output.json" "$PROJECT_DIR" "$out_dir" <<'PY'
import json
import sys

path, project, directory = sys.argv[1:4]
with open(path, 'w', encoding='utf-8') as handle:
    json.dump({"project": project, "directory": directory}, handle)
    handle.write('\n')
PY

printf '\n[timing] serving production build on 0.0.0.0:%s\n' "$PORT" >&2
exec /usr/bin/time -p "$PROJECT_DIR/node_modules/.bin/next" start -H 0.0.0.0 -p "$PORT"
