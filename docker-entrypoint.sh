#!/bin/sh
set -e

/app/ai-gateway &
APP_PID=$!

cleanup() {
  kill $APP_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:1994/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ -n "$AI_GATEWAY_SEED_ON_BOOT" ] && [ "$AI_GATEWAY_SEED_ON_BOOT" = "1" ]; then
  if [ -n "$AI_GATEWAY_BASIC_AUTH" ]; then
    node /app/scripts/seed-render-data.js || true
  else
    echo "AI_GATEWAY_BASIC_AUTH not set, skip seed"
  fi
fi

wait $APP_PID
