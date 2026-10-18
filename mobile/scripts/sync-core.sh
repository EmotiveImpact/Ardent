#!/usr/bin/env bash
# Copy Ardent Core's shared data model and mock records into the mobile app.
# Core owns these files; never edit the copies by hand. Run from mobile/.
# Usage: scripts/sync-core.sh [git-ref]   (default: read ../core from disk)
set -euo pipefail
dest=src/data/core
files=(model.ts mock.ts)
for f in "${files[@]}"; do
  if [[ $# -gt 0 ]]; then
    git show "$1:core/src/data/$f" > "$dest/$f"
  else
    cp "../core/src/data/$f" "$dest/$f"
  fi
done
echo "Synced ${files[*]} from Ardent Core into $dest"
