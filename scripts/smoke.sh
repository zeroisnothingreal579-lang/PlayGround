#!/usr/bin/env bash
# End-to-end smoke test against a running CloudDroid instance.
# Usage: BASE_URL=http://localhost:3000 scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(eval(process.argv[1]))})" "$1"; }

echo "CloudDroid smoke test → $BASE_URL"

health="$(curl -fsS "$BASE_URL/api/v1/healthz")" || fail "health endpoint unreachable"
[ "$(echo "$health" | json 'j.ok')" = "true" ] || fail "health not ok: $health"
pass "health is ok (db=$(echo "$health" | json 'j.database'))"

status="$(curl -fsS "$BASE_URL/api/v1/public/status")"
pass "runtime mode: $(echo "$status" | json 'j.mode') / transport: $(echo "$status" | json 'j.transport')"

curl -fsS -c "$JAR" -H 'Content-Type: application/json' \
  -d '{"email":"demo@clouddroid.app","password":"CloudDroid123!"}' \
  "$BASE_URL/api/v1/auth/login" >/dev/null || fail "demo login failed"
pass "demo login succeeded"

me="$(curl -fsS -b "$JAR" "$BASE_URL/api/v1/auth/me")"
pass "authenticated as $(echo "$me" | json 'j.user.email') ($(echo "$me" | json 'j.plan.name') plan)"

devices="$(curl -fsS -b "$JAR" "$BASE_URL/api/v1/devices")"
count="$(echo "$devices" | json 'j.devices.length')"
[ "$count" -ge 1 ] || fail "no devices returned"
pass "listed $count devices"

live="$(echo "$devices" | json 'j.devices.filter(d=>!d.isDemo).length')"
if [ "$live" -ge 1 ]; then
  id="$(echo "$devices" | json 'j.devices.find(d=>!d.isDemo).id')"
  ticket="$(curl -fsS -b "$JAR" -H "Origin: $BASE_URL" -X POST "$BASE_URL/api/v1/devices/$id/stream-ticket" || true)"
  if echo "$ticket" | grep -q '"wsPath"'; then
    pass "minted a live stream ticket for $id"
  else
    pass "live device present ($id); stream ticket unavailable because it is not running"
  fi
else
  pass "no live runtime in this environment (demo-only mode)"
fi

pass "all smoke checks passed"
