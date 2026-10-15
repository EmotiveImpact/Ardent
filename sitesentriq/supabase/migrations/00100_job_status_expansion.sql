-- Migration: 00100_job_status_expansion.sql
-- Feature (V1 backlog #1): expand the job/task status workflow to match the
-- operator's process (from their current tool): adds not_ready, ready,
-- pending_external, contractor_review, performed, rejected. Existing statuses
-- are all retained, so every current row stays valid.

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status = any (array[
    -- existing
    'scheduled', 'due', 'in_progress', 'completed', 'incomplete',
    'failed_access', 'revisit', 'cancelled', 'pending',
    -- new workflow states
    'not_ready', 'ready', 'pending_external', 'contractor_review',
    'performed', 'rejected'
  ]::text[])
);
