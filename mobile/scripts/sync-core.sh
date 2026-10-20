#!/usr/bin/env bash
# Copy Ardent Core's shared contract (data model, client interface, mock
# records, design tokens) into the mobile app. Core owns these files; never
# edit the copies by hand. Run from mobile/.
# Usage: scripts/sync-core.sh [git-ref]   (default: read ../core from disk)
set -euo pipefail
pairs=(
  "src/data/model.ts:src/data/core/model.ts"
  "src/data/client.ts:src/data/core/client.ts"
  "src/data/mock.ts:src/data/core/mock.ts"
  "tokens/tokens.ts:src/theme/core/tokens.ts"
)
for p in "${pairs[@]}"; do
  src="core/${p%%:*}" dest="${p##*:}"
  mkdir -p "$(dirname "$dest")"
  if [[ $# -gt 0 ]]; then git show "$1:$src" > "$dest"; else cp "../$src" "$dest"; fi
  echo "  $src -> $dest"
done
