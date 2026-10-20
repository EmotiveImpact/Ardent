#!/usr/bin/env bash
# Run the engine's migrations, seed and tests against a throwaway Postgres.
# Needs Postgres 15+ binaries on PATH (initdb, pg_ctl, psql); no Docker.
# Usage: tests/run.sh            (from engine/)
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
export PATH="$PGBIN:$PATH"
tmp=$(mktemp -d)
as_pg=()
trap '"${as_pg[@]}" env PATH="$PATH" pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT

# Postgres refuses to run as root; in a root container, run the server as the
# postgres system user.
if [[ $EUID -eq 0 ]]; then
  chown postgres "$tmp"
  as_pg=(runuser -u postgres --)
fi
"${as_pg[@]}" env PATH="$PATH" initdb -D "$tmp/data" -U postgres --auth=trust >/dev/null
"${as_pg[@]}" env PATH="$PATH" pg_ctl -D "$tmp/data" -o "-k $tmp -c listen_addresses=''" -l "$tmp/log" -w start >/dev/null
export PGHOST=$tmp PGUSER=postgres PGDATABASE=postgres


psql -X -q -v ON_ERROR_STOP=1 -f tests/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  psql -X -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "seed     seed.sql"
psql -X -q -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql -X -q -v ON_ERROR_STOP=1 -f tests/helpers.sql

status=0
for f in tests/[0-9]*.sql; do
  echo "test     $(basename "$f")"
  if ! psql -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 >/dev/null | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'; then status=1; fi
done
exit $status
