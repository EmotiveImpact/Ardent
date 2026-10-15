-- Migration: 00119_subcontractor_job_tokens.sql
-- Description: per-use subcontractor work links (trust wave W2-T7).
--   A subcontractor gets ONE link for ONE job — no login, no training:
--   accept → upload RAMS/cert → photos → signature → mark complete.
--   Competitive research: subbie work still moves through phone calls and
--   email PDFs; the platforms that have "subcontractor portals" (simPRO,
--   Joblogic) draw no positive review mentions, and Commusoft monetises
--   daily subbie licences — link-based per-use access is open ground.
--
-- Security model (mirrors 00048 job_eta_tokens):
--   * 32-char URL-safe random token, UNIQUE — token IS the auth.
--   * Single job + single subcontractor scope; 14-day default expiry;
--     revocable; status machine gates every action.
--   * Anonymous PostgREST access: NONE (RLS org-scopes the table; no anon
--     policy). All public traffic goes through the subcontractor-job edge
--     function (service role) which re-validates token/expiry/status.
--   * view_count/last_viewed_at for leak detection (00048 pattern).

create table if not exists public.subcontractor_job_tokens (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  token            text not null unique,
  status           text not null default 'issued'
                     check (status in ('issued', 'accepted', 'completed', 'revoked')),
  expires_at       timestamptz not null default (now() + interval '14 days'),
  accepted_at      timestamptz,
  completed_at     timestamptz,
  view_count       integer not null default 0,
  last_viewed_at   timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists subcontractor_job_tokens_job_idx
  on public.subcontractor_job_tokens (job_id);
create index if not exists subcontractor_job_tokens_org_idx
  on public.subcontractor_job_tokens (organisation_id);

alter table public.subcontractor_job_tokens enable row level security;

-- FM staff manage tokens for their own org. The public path NEVER touches
-- RLS (service role in the edge function). No anon policies — by design.
drop policy if exists subcontractor_job_tokens_select_org on public.subcontractor_job_tokens;
drop policy if exists subcontractor_job_tokens_insert_org on public.subcontractor_job_tokens;
drop policy if exists subcontractor_job_tokens_update_org on public.subcontractor_job_tokens;
drop policy if exists subcontractor_job_tokens_delete_org on public.subcontractor_job_tokens;
create policy subcontractor_job_tokens_select_org on public.subcontractor_job_tokens
  for select to authenticated using (organisation_id = public.organisation_id());
create policy subcontractor_job_tokens_insert_org on public.subcontractor_job_tokens
  for insert to authenticated
  with check (organisation_id = public.organisation_id() and created_by = auth.uid());
create policy subcontractor_job_tokens_update_org on public.subcontractor_job_tokens
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy subcontractor_job_tokens_delete_org on public.subcontractor_job_tokens
  for delete to authenticated using (organisation_id = public.organisation_id());

-- Private bucket for subbie uploads. NO storage policies for anon/authenticated
-- on this bucket — uploads happen exclusively via short-lived signed upload
-- URLs minted by the edge function, reads via signed URLs for org staff.
insert into storage.buckets (id, name, public)
values ('subbie-uploads', 'subbie-uploads', false)
on conflict (id) do nothing;

comment on table public.subcontractor_job_tokens is
  'Per-use, no-login subcontractor work links (W2-T7): one token = one job + one subcontractor. Status machine issued->accepted->completed (or revoked). Public access only via the subcontractor-job edge function; RLS governs FM staff only.';
