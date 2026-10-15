-- 00036_jobs_time_start.sql — Wave 14.1 / hotfix
-- Adds the `time_start` column on jobs that the application has been
-- referencing for months. Without it, every dashboard query that orders
-- by time_start, every visit list, every today-on-site widget hits
-- PostgREST 400. This unblocks them.
--
-- The column is timestamptz nullable. Many existing rows will be NULL,
-- which is fine — those queries already handle nullsLast/nullsFirst.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS time_start time;

COMMENT ON COLUMN jobs.time_start IS 'Scheduled start time-of-day (UTC). Pairs with time_end. NULL = no specific time set, e.g. all-day jobs.';
