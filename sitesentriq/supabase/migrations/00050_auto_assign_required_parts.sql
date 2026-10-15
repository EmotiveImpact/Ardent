-- 00050_auto_assign_required_parts.sql — Sprint 3 / C4
--
-- Add a required_parts jsonb column so admins can configure
-- "this rule applies to gas-boiler service jobs and engineers must
-- have a copper compression fitting (qty ≥ 1) AND boiler O-ring
-- (qty ≥ 1) in their van" — and the auto-assign engine scores
-- candidates against their van stock accordingly.
--
-- Shape: array of { sku?: string, name?: string, min_qty: number }
-- The scorer matches by sku first (exact), falls back to name (case-
-- insensitive contains). Minimum-viable representation; we'll
-- normalise to a join table if it ever needs more.

alter table public.auto_assignment_rules
  add column if not exists required_parts jsonb not null default '[]'::jsonb;

comment on column public.auto_assignment_rules.required_parts is
  'Array of { sku, name, min_qty } the engineer must have in their van for this rule. Sprint 3 / C4. Used by the parts_readiness component of the auto-assign scoring engine.';
