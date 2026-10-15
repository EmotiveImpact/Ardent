-- 00057_seed_sample_data_lockdown.sql
--
-- Lock seed_sample_data(uuid) to admins of the target organisation. The
-- function remains SECURITY DEFINER for writes across RLS-protected tables,
-- but the caller must be an org_admin or super_admin in that same org.

create or replace function public.seed_sample_data(org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id alias for $1;
  v_client_id      uuid := gen_random_uuid();
  v_property_a_id  uuid := gen_random_uuid();
  v_property_b_id  uuid := gen_random_uuid();
  v_asset1_id      uuid := gen_random_uuid();
  v_asset2_id      uuid := gen_random_uuid();
  v_asset3_id      uuid := gen_random_uuid();
  v_asset4_id      uuid := gen_random_uuid();
  v_asset5_id      uuid := gen_random_uuid();
  v_now            timestamptz := now();
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.organisation_id = v_org_id
      and p.role in ('org_admin', 'super_admin')
  ) then
    raise exception 'forbidden: caller not admin of org %', v_org_id;
  end if;

  if not exists (
    select 1
    from public.organisations o
    where o.id = v_org_id
  ) then
    raise exception 'Organisation % not found', v_org_id;
  end if;

  insert into public.clients (id, organisation_id, name, contact_email, contact_phone, address, notes)
  values (
    v_client_id,
    v_org_id,
    'Acme Holdings Ltd',
    'hello@acme.example',
    '+44 20 7946 0100',
    '12 King Street, London EC2V 8AS',
    'Sample data - created by the onboarding wizard.'
  )
  on conflict (id) do nothing;

  insert into public.properties (id, client_id, organisation_id, name, address, site_type, operating_hours)
  values
    (
      v_property_a_id,
      v_client_id,
      v_org_id,
      'Acme HQ - Tower A',
      '12 King Street, London EC2V 8AS',
      'Commercial Office',
      'Mon-Fri 08:00-18:00'
    ),
    (
      v_property_b_id,
      v_client_id,
      v_org_id,
      'Acme Warehouse',
      '88 Dock Road, London E14 9PH',
      'Industrial',
      '24/7'
    )
  on conflict (id) do nothing;

  insert into public.assets (id, property_id, organisation_id, name, category, make, model, status)
  values
    (v_asset1_id, v_property_a_id, v_org_id, 'Boiler - Plant Room', 'HVAC', 'Worcester', 'Greenstar 60', 'active'),
    (v_asset2_id, v_property_a_id, v_org_id, 'Fire Alarm Panel', 'Fire Safety', 'Honeywell', 'XLS3000', 'active'),
    (v_asset3_id, v_property_a_id, v_org_id, 'Passenger Lift A', 'Lifts', 'Kone', 'MonoSpace', 'active'),
    (v_asset4_id, v_property_b_id, v_org_id, 'Loading Bay AC Unit', 'HVAC', 'Daikin', 'VRV IV', 'active'),
    (v_asset5_id, v_property_b_id, v_org_id, 'Emergency Lighting Hub', 'Electrical', 'Eaton', 'CGLine+', 'active')
  on conflict (id) do nothing;

  insert into public.compliance_items (id, property_id, asset_id, organisation_id, name, compliance_type, frequency, next_due, status)
  values
    (
      gen_random_uuid(),
      v_property_a_id,
      v_asset2_id,
      v_org_id,
      'Annual Fire Alarm Certification',
      'fire_safety',
      'annual',
      v_now + interval '21 days',
      'due_soon'
    ),
    (
      gen_random_uuid(),
      v_property_a_id,
      v_asset3_id,
      v_org_id,
      'LOLER Lift Inspection',
      'lighting',
      'six_monthly',
      v_now + interval '90 days',
      'compliant'
    ),
    (
      gen_random_uuid(),
      v_property_b_id,
      v_asset5_id,
      v_org_id,
      'Emergency Lighting 6-Monthly Test',
      'emergency_lighting',
      'six_monthly',
      v_now - interval '5 days',
      'overdue'
    )
  on conflict (id) do nothing;

  insert into public.jobs (id, property_id, organisation_id, title, description, status, priority, scheduled_date)
  values
    (
      gen_random_uuid(),
      v_property_a_id,
      v_org_id,
      'Quarterly Boiler Service',
      'Sample job - quarterly service visit on the plant-room boiler.',
      'scheduled',
      'medium',
      v_now + interval '3 days'
    ),
    (
      gen_random_uuid(),
      v_property_b_id,
      v_org_id,
      'Emergency Lighting Re-Test',
      'Sample job - re-test the overdue emergency lighting hub.',
      'in_progress',
      'high',
      v_now + interval '1 day'
    )
  on conflict (id) do nothing;

  return jsonb_build_object(
    'org_id',     v_org_id,
    'clients',    1,
    'properties', 2,
    'assets',     5,
    'compliance', 3,
    'jobs',       2,
    'seeded_at',  v_now
  );
end;
$$;

revoke all on function public.seed_sample_data(uuid) from public;
grant execute on function public.seed_sample_data(uuid) to authenticated;

-- seed_org_trial_subscription() is a trigger-only function, not an
-- authenticated org_id RPC. It is hardened for search_path in 00058.
revoke all on function public.seed_org_trial_subscription() from public;
