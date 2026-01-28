#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
DRY_RUN="${DRY_RUN:-true}"
START_SERVER="${START_SERVER:-false}"

pid=""

cleanup() {
  if [[ -n "$pid" ]]; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "$START_SERVER" == "true" ]]; then
  npm run dev >/tmp/plotter-dev.log 2>&1 &
  pid="$!"
fi

for _ in {1..30}; do
  if curl -sSf "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

curl -sSf "$BASE_URL/health" >/dev/null
curl -sSf -X POST "$BASE_URL/config/dry-run" \
  -H 'Content-Type: application/json' \
  -d "{\"dryRun\":$DRY_RUN}" >/dev/null
curl -sSf -X POST "$BASE_URL/plotter/gcode" \
  -H 'Content-Type: application/json' \
  -d '{"lines":["G92 X0 Y0 Z0"]}' >/dev/null

echo "ok: health + dry-run + gcode"
