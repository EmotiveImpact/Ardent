#!/usr/bin/env bash
# Copy Ardent's shared contract into the mobile app: Core's data model, client
# interface and mock records, plus the design kit from engine/kit (tokens,
# states, formats, wording). Never edit the copies by hand. Run from mobile/.
# Usage: scripts/sync-core.sh [git-ref]   (default: read the repo from disk)
set -euo pipefail
pairs=(
  "core/src/data/model.ts:src/data/core/model.ts"
  "core/src/data/client.ts:src/data/core/client.ts"
  "core/src/data/mock.ts:src/data/core/mock.ts"
)
for f in tokens states format copy index; do pairs+=("engine/kit/$f.ts:src/kit/$f.ts"); done
for p in "${pairs[@]}"; do
  src="${p%%:*}" dest="${p##*:}"
  mkdir -p "$(dirname "$dest")"
  if [[ $# -gt 0 ]]; then git show "$1:$src" > "$dest"; else cp "../$src" "$dest"; fi
  # Metro resolves imports without the .ts suffix, and the model sits in data/core here.
  if [[ $dest == src/kit/* ]]; then
    sed -i -e "s#'\.\./\.\./core/src/data/model\.ts'#'../data/core/model'#" -e "s#\(from '\./[a-z]*\)\.ts'#\1'#" "$dest"
  fi
  echo "  $src -> $dest"
done
