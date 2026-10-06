#!/bin/sh
# Runs vault-api and the telegram bot side by side; if either exits, the container exits
# so Railway restarts both.

# Bot wallets live in the Railway volume; the bot reads them from /app/tg/data/wallets.
mkdir -p /app/tg-data/wallets
ln -sfn /app/tg-data /app/tg/data

# The bot reaches vault-api inside the same container.
export EXTERNAL_API_URL="${EXTERNAL_API_URL:-http://localhost:${PORT:-8081}}"

bun run src/index.ts &
API_PID=$!

(cd /app/tg && bun run src/index.ts) &
TG_PID=$!

trap 'kill $API_PID $TG_PID 2>/dev/null' TERM INT

while kill -0 $API_PID 2>/dev/null && kill -0 $TG_PID 2>/dev/null; do
  sleep 5
done

kill $API_PID $TG_PID 2>/dev/null
exit 1
