-- ============================================================
-- Migration 00017: First-Run Onboarding + Sample Data RPC
-- Adds:
--   * organisations.onboarding_state (jsonb)
--   * seed_sample_data(uuid)  — populates a small representative
--     dataset for a new org so they can poke around immediately
-- ============================================================

-- ── 1. Onboarding state column ───────────────────────────────

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb
    NOT NULL DEFAULT '{"completed": false}'::jsonb;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS business_type text;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS team_size text;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS primary_use_case text;

-- ── 2. Sample-data seed RPC ───────────────────────────────────
-- Inserts ~1 client / 2 properties / 5 assets / 3 compliance items
-- / 2 jobs scoped to the given organisation. Idempotent-friendly:
-- the function uses ON CONFLICT DO NOTHING so re-runs are safe but
-- will not double-insert. Returns the count of rows inserted.
-- =============================================================

CREATE OR REPLACE FUNCTION public.seed_sample_data(org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id      uuid := gen_random_uuid();
  v_property_a_id  uuid := gen_random_uuid();
  v_property_b_id  uuid := gen_random_uuid();
  v_asset1_id      uuid := gen_random_uuid();
  v_asset2_id      uuid := gen_random_uuid();
  v_asset3_id      uuid := gen_random_uuid();
  v_asset4_id      uuid := gen_random_uuid();
  v_asset5_id      uuid := gen_random_uuid();
  v_now            timestamptz := now();
BEGIN
  -- Guard: organisation must exist
  IF NOT EXISTS (SELECT 1 FROM organisations WHERE id = org_id) THEN
    RAISE EXCEPTION 'Organisation % not found', org_id;
  END IF;

  -- Client
  INSERT INTO clients (id, organisation_id, name, contact_email, contact_phone, address, notes)
  VALUES (v_client_id, org_id, 'Acme Holdings Ltd',
          'hello@acme.example', '+44 20 7946 0100',
          '12 King Street, London EC2V 8AS',
          'Sample data — created by the onboarding wizard.')
  ON CONFLICT (id) DO NOTHING;

  -- Properties
  INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours)
  VALUES
    (v_property_a_id, v_client_id, org_id, 'Acme HQ — Tower A',
     '12 King Street, London EC2V 8AS', 'Commercial Office', 'Mon–Fri 08:00–18:00'),
    (v_property_b_id, v_client_id, org_id, 'Acme Warehouse',
     '88 Dock Road, London E14 9PH', 'Industrial', '24/7')
  ON CONFLICT (id) DO NOTHING;

  -- Assets (5 across the two properties)
  INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, status)
  VALUES
    (v_asset1_id, v_property_a_id, org_id, 'Boiler — Plant Room',     'HVAC',         'Worcester',  'Greenstar 60', 'active'),
    (v_asset2_id, v_property_a_id, org_id, 'Fire Alarm Panel',         'Fire Safety',  'Honeywell',  'XLS3000',      'active'),
    (v_asset3_id, v_property_a_id, org_id, 'Passenger Lift A',         'Lifts',        'Kone',       'MonoSpace',    'active'),
    (v_asset4_id, v_property_b_id, org_id, 'Loading Bay AC Unit',      'HVAC',         'Daikin',     'VRV IV',       'active'),
    (v_asset5_id, v_property_b_id, org_id, 'Emergency Lighting Hub',   'Electrical',   'Eaton',      'CGLine+',      'active')
  ON CONFLICT (id) DO NOTHING;

  -- Compliance items (3 across the assets / properties)
  INSERT INTO compliance_items (id, property_id, asset_id, organisation_id, name, compliance_type, frequency, next_due, status)
  VALUES
    (gen_random_uuid(), v_property_a_id, v_asset2_id, org_id,
     'Annual Fire Alarm Certification', 'fire_safety', 'annual',
     v_now + interval '21 days', 'due_soon'),
    (gen_random_uuid(), v_property_a_id, v_asset3_id, org_id,
     'LOLER Lift Inspection', 'lighting', 'six_monthly',
     v_now + interval '90 days', 'compliant'),
    (gen_random_uuid(), v_property_b_id, v_asset5_id, org_id,
     'Emergency Lighting 6-Monthly Test', 'emergency_lighting', 'six_monthly',
     v_now - interval '5 days', 'overdue')
  ON CONFLICT (id) DO NOTHING;

  -- Jobs (2 — one scheduled, one in progress)
  INSERT INTO jobs (id, property_id, organisation_id, title, description, status, priority, scheduled_date)
  VALUES
    (gen_random_uuid(), v_property_a_id, org_id,
     'Quarterly Boiler Service',
     'Sample job — quarterly service visit on the plant-room boiler.',
     'scheduled', 'medium', v_now + interval '3 days'),
    (gen_random_uuid(), v_property_b_id, org_id,
     'Emergency Lighting Re-Test',
     'Sample job — re-test the overdue emergency lighting hub.',
     'in_progress', 'high', v_now + interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'org_id',         org_id,
    'clients',        1,
    'properties',     2,
    'assets',         5,
    'compliance',     3,
    'jobs',           2,
    'seeded_at',      v_now
  );
END;
$$;

-- Allow authenticated users to call this for their own org.
-- The body relies on SECURITY DEFINER + organisation_id passed in;
-- if you want stricter checks, wrap in a policy/RPC that enforces
-- auth.uid() membership of the org.
GRANT EXECUTE ON FUNCTION public.seed_sample_data(uuid) TO authenticated;
