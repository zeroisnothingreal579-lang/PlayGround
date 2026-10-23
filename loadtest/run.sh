#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Usage: ./run.sh [env-file]

Starts a k6 run with the live web dashboard enabled.
Reads configuration from the environment and, optionally, an env file
(see config.example.env).

  ./run.sh                 # uses current environment
  ./run.sh my.env          # loads my.env first

Live dashboard: http://localhost:5665 (override with K6_WEB_DASHBOARD_PORT)
Stop the test with Ctrl-C.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  if [[ ! -f "$1" ]]; then
    echo "env file not found: $1" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$1"
  set +a
fi

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is required. Set it in the environment or in an env file." >&2
  usage >&2
  exit 1
fi

export K6_WEB_DASHBOARD="${K6_WEB_DASHBOARD:-true}"
PORT="${K6_WEB_DASHBOARD_PORT:-5665}"
export K6_WEB_DASHBOARD_PORT="$PORT"

if [[ -z "${OUT_DIR:-}" ]]; then
  export OUT_DIR=results
fi
mkdir -p "$OUT_DIR"

host="${BASE_URL#*://}"
host="${host%%/*}"
host="${host%%:*}"
is_local=0
case "$host" in
  localhost | 127.0.0.1 | 0.0.0.0) is_local=1 ;;
esac

PASSTHROUGH=(
  BASE_URL REGION PROFILE VUS DURATION RAMP HOLD DOWN
  CODES CODES_FILE REDIRECT_PATH STATS_PATH HEALTH_PATH
  CREATE_PATH CREATE_METHOD CREATE_BODY CREATE_CODE_PATH CREATE_CONTENT_TYPE
  SETUP_LINKS STATS_PCT CREATE_PCT THINK_TIME_MS
  MAX_FAIL_RATE P95_MS P99_MS REDIRECT_P95_MS
  HTTP_TIMEOUT INSECURE_SKIP_TLS_VERIFY
  AUTH_HEADER_NAME AUTH_HEADER_VALUE COOKIE EXTRA_HEADERS USER_AGENT
  OUT_DIR
)

if command -v k6 >/dev/null 2>&1; then
  export K6_WEB_DASHBOARD_OPEN="${K6_WEB_DASHBOARD_OPEN:-true}"
  echo "Live dashboard: http://localhost:${PORT}"
  exec k6 run k6/redirect.js
fi

if command -v docker >/dev/null 2>&1; then
  IMAGE="${K6_IMAGE:-grafana/k6:2.3.0}"
  args=(run --rm --user "$(id -u):$(id -g)")
  if [[ "$is_local" -eq 1 ]]; then
    args+=(--network host)
  else
    args+=(-p "${PORT}:${PORT}")
  fi
  for name in "${PASSTHROUGH[@]}"; do
    if [[ -n "${!name+x}" ]]; then
      args+=(-e "$name")
    fi
  done
  args+=(
    -e K6_WEB_DASHBOARD=true
    -e K6_WEB_DASHBOARD_HOST=0.0.0.0
    -e "K6_WEB_DASHBOARD_PORT=${PORT}"
    -v "$PWD:/loadtest"
    -w /loadtest
    "$IMAGE" run k6/redirect.js
  )
  echo "Live dashboard: http://localhost:${PORT}"
  exec docker "${args[@]}"
fi

echo "Need either k6 or docker on PATH." >&2
exit 1
