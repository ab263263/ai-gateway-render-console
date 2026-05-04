#!/bin/sh
set -e

echo "=== AI Gateway Entrypoint Starting ==="
echo "HOST=${HOST} PORT=${PORT} SQL_DSN=${SQL_DSN}"
echo "Working directory: $(pwd)"
echo "Binary exists: $(test -f /app/ai-gateway && echo yes || echo no)"
echo "Binary size: $(wc -c < /app/ai-gateway 2>/dev/null || echo N/A)"
echo "Static dir exists: $(test -d /app/static && echo yes || echo no)"
echo "Static dir contents: $(ls -la /app/static/ 2>/dev/null || echo N/A)"
echo "Config exists: $(test -f /app/config.toml && echo yes || echo no)"
echo "Data dir exists: $(test -d /data && echo yes || echo no)"

/app/ai-gateway &
APP_PID=$!
echo "AI Gateway started with PID ${APP_PID}"

cleanup() {
  kill $APP_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

APP_HOST="${HOST:-127.0.0.1}"
APP_PORT="${PORT:-1994}"
APP_BASE_URL="http://${APP_HOST}:${APP_PORT}"
HEALTH_OK=0

for i in $(seq 1 60); do
  if curl -fsS "${APP_BASE_URL}/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    echo "AI Gateway health check passed on attempt ${i} (${APP_BASE_URL}/health)"
    break
  fi
  # Check if the app process is still alive
  if ! kill -0 $APP_PID 2>/dev/null; then
    echo "=== AI Gateway process died unexpectedly ==="
    exit 1
  fi
  sleep 2
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo "AI Gateway health check did not pass within startup window"
  if ! kill -0 $APP_PID 2>/dev/null; then
    echo "=== AI Gateway process is dead ==="
    exit 1
  fi
fi

if [ -n "$AI_GATEWAY_SEED_ON_BOOT" ] && [ "$AI_GATEWAY_SEED_ON_BOOT" = "1" ]; then
  echo "AI Gateway seed on boot enabled"
  if [ -n "$AI_GATEWAY_BASIC_AUTH" ]; then
    echo "AI_GATEWAY_BASIC_AUTH detected; seeding with explicit Authorization header"
  elif [ -n "$ADMIN_USERNAME" ] && [ -n "$ADMIN_PASSWORD" ]; then
    echo "AI_GATEWAY_BASIC_AUTH not set; seeding will derive Basic Auth from ADMIN_USERNAME/ADMIN_PASSWORD"
  else
    echo "No admin credentials found for seed; attempting seed without Authorization header"
  fi

  if node /app/scripts/seed-render-data.js; then
    echo "AI Gateway seed completed successfully"
  else
    SEED_EXIT_CODE=$?
    echo "AI Gateway seed failed with exit code ${SEED_EXIT_CODE}"
  fi

  echo "AI Gateway post-seed stats:"
  curl -fsS "${APP_BASE_URL}/api/stats/overview" || echo "Failed to fetch post-seed stats overview"
  echo
fi

wait $APP_PID
