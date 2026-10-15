-- Migration: 00104_quote_source_job.sql
-- Feature (V1 backlog #3): a quote can record the source job/task it was raised
-- from, so a defect quote stays associated to its parent task — and when the
-- quote is converted to a remedial job, that job links back via parent_job_id.

alter table public.quotes
  add column if not exists job_id uuid references public.jobs(id) on delete set null;
create index if not exists idx_quotes_job_id on public.quotes(job_id);
