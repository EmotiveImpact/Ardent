#!/usr/bin/env bash
# Run the Ardent engine and Ardent Core together, Core reading the engine.
#   scripts/dev.sh            engine on :8787, Core on :5173
#   ARDENT_PUBLIC=1 scripts/dev.sh   also open the engine to your local network (for a phone)
# Ctrl+C stops both. Records live in engine/.data/; delete it to start the demo firm afresh.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
port="${PORT:-8787}"

for app in engine core; do
  [ -d "$root/$app/node_modules" ] || (cd "$root/$app" && npm install --no-audit --no-fund)
done

trap 'kill 0' EXIT INT TERM
(cd "$root/engine" && PORT="$port" npm start --silent) &
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$port/api/me" && break
  sleep 0.2
done
(cd "$root/core" && VITE_ARDENT_ENGINE="http://127.0.0.1:$port" npx vite --port 5173 --strictPort) &
echo
echo "Ardent Core:   http://localhost:5173  (sign in as dan@demo.ardent.local, password ardent-demo)"
echo "Engine:        http://127.0.0.1:$port"
wait
