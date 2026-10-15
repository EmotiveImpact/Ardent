-- Migration: 00099_job_service_group.sql
-- Feature (V1 backlog #4): a "Service Group" category on jobs/tasks so the task
-- list can be grouped/filtered by discipline (Emergency & Exit Lighting, Fire
-- Detection…). Free-text-but-from-a-known-list (validated in the app), nullable.

alter table public.jobs add column if not exists service_group text;
create index if not exists idx_jobs_service_group on public.jobs(service_group);
