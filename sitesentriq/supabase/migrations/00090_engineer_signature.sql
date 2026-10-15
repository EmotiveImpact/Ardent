-- 00090_engineer_signature.sql
--
-- Real dual signatures on a job. The customer signature stays where it is —
-- jobs.signature_url (captured at jobs.customer_signature_at). The engineer's
-- signature now gets its own column, jobs.engineer_signature_url, instead of
-- being written back over signature_url.
--
-- Fixes the bug where the customer and engineer signatures shared a single
-- column, so both rendered as the same image on the service report / cert.
--
-- Idempotent: safe to re-run.

alter table public.jobs
  add column if not exists engineer_signature_url text;
