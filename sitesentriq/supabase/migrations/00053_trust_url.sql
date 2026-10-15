-- 00053_trust_url.sql
--
-- Strategic 1 follow-up — Public Trust URL (Vanta-style continuous
-- compliance verification).
--
-- Why this exists:
--   The Compliance Score (00051) is an internal number; this migration
--   exposes it as a public, no-login URL per organisation. Auditors,
--   insurers, board members, and prospects can verify the org's
--   compliance posture in one link — same playbook Vanta used to
--   create the Trust Center category.
--
-- What we're adding to organisations:
--   - trust_url_slug             user-friendly URL slug (e.g. "acme-fm")
--   - trust_url_enabled          opt-in flag — public page only renders
--                                when this is true
--   - trust_url_show_breakdown   per-org toggle to publish the four
--                                sub-metrics or just the headline
--   - trust_url_show_history     per-org toggle for the 30-day sparkline
--
-- Slug rules are enforced application-side (lowercase a-z 0-9 hyphens,
-- 3-32 chars) but a partial-unique index protects the namespace.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS trust_url_slug TEXT,
  ADD COLUMN IF NOT EXISTS trust_url_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trust_url_show_breakdown BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS trust_url_show_history BOOLEAN NOT NULL DEFAULT TRUE;

-- Global slug uniqueness (case-insensitive). We can't simply put a
-- UNIQUE constraint on the column because:
--   1. We want the namespace reserved only for orgs that have actually
--      published a Trust URL — otherwise every org would silently
--      lock down a slug just by signing up.
--   2. We want lookups to be case-insensitive ("Acme-FM" === "acme-fm").
-- A partial unique index over lower(slug) handles both at once.
CREATE UNIQUE INDEX IF NOT EXISTS organisations_trust_url_slug_unique_idx
  ON public.organisations (lower(trust_url_slug))
  WHERE trust_url_enabled = TRUE AND trust_url_slug IS NOT NULL;

-- Hot-path index — the public-trust-score edge function looks up by
-- slug on every request. Tiny table relative to traffic, but keeps the
-- plan honest.
CREATE INDEX IF NOT EXISTS organisations_trust_url_lookup_idx
  ON public.organisations (lower(trust_url_slug))
  WHERE trust_url_enabled = TRUE;

COMMENT ON COLUMN public.organisations.trust_url_slug IS
  'Public Trust URL slug (e.g. "acme-fm" → /trust/acme-fm). Lowercase a-z 0-9 hyphens, 3-32 chars (enforced app-side). Strategic 1 follow-up.';
COMMENT ON COLUMN public.organisations.trust_url_enabled IS
  'When TRUE the public Trust URL renders the org compliance score. Off by default — orgs explicitly opt in.';
COMMENT ON COLUMN public.organisations.trust_url_show_breakdown IS
  'When TRUE the Trust URL shows the four sub-metrics (compliance / ppm_on_time / pass_rate / action_health). When FALSE only the headline score is published.';
COMMENT ON COLUMN public.organisations.trust_url_show_history IS
  'When TRUE the Trust URL renders a 30-day sparkline. When FALSE only today''s number is published.';
