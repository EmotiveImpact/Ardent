-- Migration: 00101_job_parent_child.sql
-- Feature (V1 backlog #3): link related tasks (parent/child) so e.g. a defect
-- quote / remedial task can be associated to the parent service visit it arose
-- from. Nullable self-reference; on parent delete the children are unlinked
-- (not deleted).

alter table public.jobs
  add column if not exists parent_job_id uuid references public.jobs(id) on delete set null;
create index if not exists idx_jobs_parent_job_id on public.jobs(parent_job_id);
