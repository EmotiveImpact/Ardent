-- Migration: 00114_record_failed_access_rpc.sql
-- Description: transactional RPC for the mobile "failed access" flow, closing
--   the documented offline-queue split-outcome bug (BLOCKERS.md).
--
-- Background:
--   failAccess previously enqueued TWO independent offline actions — a jobs
--   status update and a notes insert. The queue applies actions independently
--   across drain passes, so one half could permanently succeed while the other
--   dead-lettered after MAX_ATTEMPTS: a status change with no reason, or a
--   reason note on a job whose status never changed. A groupId quarantine
--   can't fix this (member A may succeed in pass 1 before member B ever
--   fails); one RPC = one Postgres transaction = atomic by construction.
--
-- Design:
--   * SECURITY INVOKER — both writes run under the caller's existing RLS on
--     public.jobs / public.notes. No privilege escalation surface.
--   * Replay-safe — the mobile client stamps p_note_id at enqueue time, so a
--     replayed call (commit succeeded, response lost) hits
--     `on conflict (id) do nothing` instead of duplicating the note.
--   * search_path = '' + schema-qualified refs per house style (00105+).

create or replace function public.record_failed_access(
  p_job_id uuid,
  p_note_id uuid,
  p_note_content text,
  p_user_name text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_note_content is null or btrim(p_note_content) = '' then
    raise exception 'note content is required' using errcode = '22023';
  end if;

  update public.jobs
  set status = 'failed_access'
  where id = p_job_id;
  if not found then
    -- Either the job doesn't exist or the caller's RLS can't see it —
    -- indistinguishable on purpose.
    raise exception 'job not found or not permitted' using errcode = '42501';
  end if;

  -- Idempotent on replay: the offline queue stamps p_note_id client-side.
  insert into public.notes (id, job_id, organisation_id, content, user_id, user_name)
  select p_note_id, p_job_id, j.organisation_id, p_note_content, auth.uid(), p_user_name
  from public.jobs j
  where j.id = p_job_id
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.record_failed_access(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_failed_access(uuid, uuid, text, text) to authenticated;

comment on function public.record_failed_access(uuid, uuid, text, text) is
  'Atomic failed-access: jobs.status -> failed_access + reason note in one transaction. SECURITY INVOKER (caller RLS applies to both writes); replay-idempotent via client-stamped p_note_id.';
