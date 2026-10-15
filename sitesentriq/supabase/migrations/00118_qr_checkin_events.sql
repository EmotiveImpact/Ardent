-- Migration: 00118_qr_checkin_events.sql
-- Description: QR proof-of-presence (trust wave W2-T8). Adds 'qr_checkin' to
--   the field_events type CHECK: an engineer scanning an asset/property QR
--   while on a job records hard attendance evidence (metadata carries the
--   scanned entity). The 00117 SLA evidence trigger already treats
--   'qr_checkin' as response-met evidence — this makes the value legal.
--
-- Competitive research: NFC/QR proof-of-presence is "increasingly the
-- operational standard" for SLA attendance disputes in UK FM.

alter table public.field_events drop constraint if exists field_events_event_type_check;
alter table public.field_events add constraint field_events_event_type_check
  check (event_type in (
    'travel_started',
    'arrived',
    'working_started',
    'paused',
    'resumed',
    'working_completed',
    'signature_captured',
    'qr_checkin'
  ));
