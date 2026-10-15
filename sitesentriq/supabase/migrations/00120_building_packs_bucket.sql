-- Migration: 00120_building_packs_bucket.sql
-- Description: private bucket for golden-thread "Building Information Pack"
--   exports (trust wave W3-T9). Clone of the 00068 tender-packs pattern:
--   NO RLS policies — only the building-pack-export edge function (service
--   role) writes, and access is via short-lived signed URLs it returns.
--   Separate bucket (not tender-packs) because retention/semantics differ.

insert into storage.buckets (id, name, public)
values ('building-packs', 'building-packs', false)
on conflict (id) do nothing;
