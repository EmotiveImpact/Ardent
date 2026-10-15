-- 00052_job_eta_tokens_sequence.sql — Strategic 2 / S2
--
-- Adds a per-token ICS SEQUENCE counter for the self-updating customer
-- calendar feed (public-job-eta-ics edge function).
--
-- WHY:
--   RFC 5545 calendar clients (Google Calendar, Outlook, Apple Calendar)
--   only treat a re-fetched VEVENT as an UPDATE (rather than a duplicate)
--   if the UID is stable AND the SEQUENCE is monotonically increasing
--   when meaningful fields (DTSTART/DTEND/STATUS/SUMMARY) change.
--
--   We can't compute SEQUENCE deterministically from the row alone —
--   it has to be a running integer the server bumps every time the
--   underlying ETA changes. The edge function compares a hash of the
--   current "ETA shape" against the previously-served hash; on mismatch
--   it bumps ics_sequence and stores the new hash.
--
--   Storing both the integer and the hash in the same row avoids
--   double-bumping on rapid re-fetches when nothing has actually
--   changed (calendar clients re-pull every ~15 min by default).

alter table public.job_eta_tokens
  add column if not exists ics_sequence integer not null default 0;

alter table public.job_eta_tokens
  add column if not exists ics_last_hash text;

comment on column public.job_eta_tokens.ics_sequence is
  'Monotonic SEQUENCE value emitted in the ICS feed (RFC 5545). Bumps when the underlying ETA shape changes so calendar clients treat the re-pull as an UPDATE not a duplicate. Strategic 2 / S2.';

comment on column public.job_eta_tokens.ics_last_hash is
  'Hash of the last-emitted ETA shape (DTSTART/DTEND/STATUS/SUMMARY). Used to decide whether to bump ics_sequence on the next ICS fetch. Strategic 2 / S2.';
