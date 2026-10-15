-- 00081_actions_resolution_and_document_versioning.sql
--
-- Loop iter 8. Two whole features were built in the UI against columns/constraints
-- that never existed in the DB, so every write threw:
--
--   C6 (CRITICAL) Actions could not be resolved or closed.
--       The actions module (constants ACTION_STATUSES, actions/index filters,
--       actions/[id] status buttons) uses the lifecycle
--       open → in_progress → resolved → closed, but actions_status_check only
--       allowed open/in_progress/completed/cancelled. "Mark Resolved" / "Close"
--       hit a CHECK violation. Also resolution_notes was written + displayed but
--       the column didn't exist. (0 action rows exist — the feature was 100%
--       dead, so re-pointing the constraint needs no data backfill.)
--
--   C7 (CRITICAL) Document upload was 100% broken.
--       use-documents inserts `version` (and queries max(version) for version
--       tracking — the PRD "version tracking" feature) and `compliance_item_id`
--       (the "compliance proof upload" link), neither of which existed →
--       every upload threw "column ... does not exist".
--
-- This migration makes the schema match the shipped UI rather than ripping the
-- features out.

-- ── Actions: real lifecycle + resolution notes ────────────────────────────────
alter table public.actions drop constraint if exists actions_status_check;
alter table public.actions
  add constraint actions_status_check
  check (status in ('open', 'in_progress', 'resolved', 'closed'));

alter table public.actions
  add column if not exists resolution_notes text;

-- ── Documents: version tracking + compliance proof link ───────────────────────
alter table public.documents
  add column if not exists version integer not null default 1;

alter table public.documents
  add column if not exists compliance_item_id uuid
    references public.compliance_items(id) on delete set null;

-- Speeds up resolveNextVersion()'s (org, name, version desc) lookup and the
-- compliance-proof filter in useDocuments.
create index if not exists documents_org_name_version_idx
  on public.documents (organisation_id, name, version desc);
create index if not exists documents_compliance_item_idx
  on public.documents (compliance_item_id)
  where compliance_item_id is not null;
