# @haumea/types

Shared TypeScript types for the Haumea monorepo. Pure types only — no
runtime, no env vars, no framework deps. Safe to consume from anywhere.

## Consumed by

- `apps/web` — every typed Supabase query / hook / route
- `apps/mobile` — Expo screens + hooks (when wired)

## Adding new types

If a type is used by exactly one app, keep it in that app. If it's
used by both, or if it's a Database row shape that mirrors a public
schema column, put it here.
