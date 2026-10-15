-- Migration: 00098_client_info_fields.sql
-- Feature (V1 backlog #8): richer client + property contact info.
--   clients:    primary contact name + phone (billing_email already exists).
--   properties: on-site access manager (name + phone) + a primary technician.
-- All additive + nullable.

alter table public.clients
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_phone text;

alter table public.properties
  add column if not exists site_manager_name text,
  add column if not exists site_manager_phone text,
  add column if not exists primary_technician_id uuid references public.engineers(id) on delete set null;

create index if not exists idx_properties_primary_technician
  on public.properties(primary_technician_id);
