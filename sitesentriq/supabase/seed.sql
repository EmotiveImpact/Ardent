-- =============================================================================
-- Haumea / Facilities OS — Demo Seed Data
-- "Northwind Property Management" — multi-sector UK FM company
-- Idempotent: safe to re-run (uses ON CONFLICT (id) DO NOTHING)
-- Atomic: wrapped in BEGIN ... COMMIT
-- Deterministic UUIDs so foreign keys stay stable across re-runs.
-- =============================================================================
--
-- UUID conventions (visual prefix → entity):
--   a0...  organisations
--   b0...  profiles / users
--   c0...  clients
--   d0...  properties
--   e0...  areas
--   f0...  assets
--   aa..   compliance_items
--   bb..   maintenance_plans
--   cc..   jobs
--   dd..   engineer_assignments
--   ee..   service_reports / engineers
--   ff..   quotes
--   11..   invoices
--   22..   timeline_events
--   33..   notifications
--   44..   actions
--   55..   contracts
--   66..   subcontractors
--   77..   documents
--   88..   kb_articles
--   99..   engineer_accreditations
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Organisation — Northwind Property Management
-- ---------------------------------------------------------------------------
INSERT INTO organisations (id, name, slug, created_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Northwind Property Management', 'northwind-pm', '2025-01-10T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Auth users + Profiles — staff
-- ---------------------------------------------------------------------------
-- Insert placeholder auth.users rows so profiles' FK constraint is satisfied.
-- Email/password are stub — these are demo accounts not intended for login.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah.mitchell@northwind-pm.example',  crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:05:00Z', '2025-01-10T09:05:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"Sarah Mitchell"}'),
  ('b0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'james.patel@northwind-pm.example',     crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:10:00Z', '2025-01-10T09:10:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"James Patel"}'),
  ('b0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emma.brooks@northwind-pm.example',     crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:15:00Z', '2025-01-10T09:15:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"Emma Brooks"}'),
  ('b0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oliver.hughes@northwind-pm.example',   crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:20:00Z', '2025-01-10T09:20:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"Oliver Hughes"}'),
  ('b0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priya.shah@northwind-pm.example',      crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:25:00Z', '2025-01-10T09:25:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Shah"}'),
  ('b0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'callum.reid@northwind-pm.example',     crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:30:00Z', '2025-01-10T09:30:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"Callum Reid"}'),
  ('b0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fiona.macleod@northwind-pm.example',   crypt('demo-password', gen_salt('bf')), now(), '2025-01-10T09:35:00Z', '2025-01-10T09:35:00Z', '{"provider":"email","providers":["email"]}', '{"full_name":"Fiona Macleod"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, organisation_id, email, full_name, role, phone, created_at) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'sarah.mitchell@northwind-pm.example',  'Sarah Mitchell',  'org_admin', '+44 20 3137 4280', '2025-01-10T09:05:00Z'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'james.patel@northwind-pm.example',     'James Patel',     'scheduler', '+44 20 3137 4281', '2025-01-10T09:10:00Z'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'emma.brooks@northwind-pm.example',     'Emma Brooks',     'engineer',  '+44 7700 900201',  '2025-01-10T09:15:00Z'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'oliver.hughes@northwind-pm.example',   'Oliver Hughes',   'engineer',  '+44 7700 900202',  '2025-01-10T09:20:00Z'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'priya.shah@northwind-pm.example',      'Priya Shah',      'engineer',  '+44 7700 900203',  '2025-01-10T09:25:00Z'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'callum.reid@northwind-pm.example',     'Callum Reid',     'engineer',  '+44 7700 900204',  '2025-01-10T09:30:00Z'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'fiona.macleod@northwind-pm.example',   'Fiona Macleod',   'engineer',  '+44 7700 900205',  '2025-01-10T09:35:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Clients — six sectors
-- ---------------------------------------------------------------------------
INSERT INTO clients (id, organisation_id, name, contact_email, contact_phone, address, notes, created_at) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Greene King Pubs Ltd',           'fm@greeneking.example',          '+44 1284 763 222', 'Westgate Brewery, Bury St Edmunds, Suffolk IP33 1QT',                'Hospitality estate. 24/7 dispatch — kitchen extract & gas cover priority.', '2025-01-12T10:00:00Z'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Mercer & Hole Schools Trust',    'estates@mercerhole.example',     '+44 20 7895 4500', '21 Lambeth Hill, London EC4V 4EU',                                   'Multi-academy trust. Term-time access only for non-urgent works.',           '2025-01-14T11:00:00Z'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Aldridge Healthcare Group',      'facilities@aldridgehealth.example', '+44 121 555 6701', 'Edgbaston Park, Birmingham B15 2TY',                              'Private healthcare. DBS + asbestos awareness required for all engineers.', '2025-01-16T09:30:00Z'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Fitzgerald Office Estates',      'ops@fitzgerald-estates.example', '+44 20 7946 1080', '1 Finsbury Avenue, London EC2M 2PA',                                 'Cat-A commercial portfolio. Out-of-hours preferred; permit-to-work required.', '2025-01-19T14:00:00Z'),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Retail Holdings',      'compliance@riversideretail.example', '+44 161 555 0210', 'Trafford Plaza, Manchester M17 1AA',                              'Shopping centres + retail parks. Trading-hour protocols apply.',             '2025-01-22T10:30:00Z'),
  ('c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Newman Industrial Logistics',    'sites@newmanlogistics.example',  '+44 113 555 8800', 'Cross Green Industrial Estate, Leeds LS9 0SE',                       'Distribution sheds + cold stores. Fork-lift PPE required on yard.',          '2025-01-25T09:15:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Properties — ~55 distributed across clients with realistic UK addresses
-- ---------------------------------------------------------------------------
-- Greene King — 12 pubs (hospitality)
INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours, access_notes, emergency_details, latitude, longitude, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Crown & Anchor — Soho',         '12 Dean Street, London W1D 3RB',           'Hospitality', 'Mon-Sun 11:00-23:30',          'Service entrance off Bateman Street. Day mgr until 16:00.',           'Out of hours: 020 7946 1801. Gas valve: cellar.',          51.5141, -0.1322, '2025-01-15T10:00:00Z'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Royal Oak — Camden',            '88 Parkway, London NW1 7AN',                'Hospitality', 'Mon-Sun 11:00-00:00',          'Lockbox code from scheduler. Avoid 17:00-19:30 service.',             'Manager mobile: 07700 900311.',                            51.5388, -0.1430, '2025-01-15T10:05:00Z'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The White Hart — Cambridge',        '4 King''s Parade, Cambridge CB2 1SJ',       'Hospitality', 'Mon-Sun 12:00-23:00',          'Heritage building — no impact tools without permit.',                 'Listed building. Heritage officer: 01223 555 010.',        52.2042, 0.1184,  '2025-01-15T10:10:00Z'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Greyhound — Bristol',           '5 Park Row, Bristol BS1 5LJ',               'Hospitality', 'Mon-Sun 11:00-23:30',          'Yard access via Frogmore Street. Refuse area locked.',                'Cellar fire panel zone 3.',                                51.4541, -2.6011, '2025-01-15T10:15:00Z'),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Black Swan — York',             '23 Peasholme Green, York YO1 7PR',          'Hospitality', 'Mon-Sun 12:00-23:00',          'Grade II listed. Site induction required.',                            'Duty mgr: 07700 900315.',                                   53.9603, -1.0786, '2025-01-15T10:20:00Z'),
  ('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Eagle — Manchester',            '24 Spring Gardens, Manchester M2 1FB',      'Hospitality', 'Mon-Sun 11:00-23:30',          'Use Spring Gardens entrance — Albert Square pedestrianised.',         'Gas iso: rear cellar.',                                     53.4814, -2.2438, '2025-01-15T10:25:00Z'),
  ('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The King''s Head — Edinburgh',      '15 Cockburn Street, Edinburgh EH1 1BP',     'Hospitality', 'Mon-Sun 11:00-01:00',          'Steep cellar steps — caution advised.',                                'Out of hours: 0131 555 4400.',                              55.9501, -3.1882, '2025-01-15T10:30:00Z'),
  ('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Lamb & Flag — Oxford',          '12 St Giles'', Oxford OX1 3JS',             'Hospitality', 'Mon-Sun 11:30-23:00',          'Cellar drop only via beer hatch — no parking on St Giles.',           'Listed building reg: II*.',                                  51.7569, -1.2620, '2025-01-15T10:35:00Z'),
  ('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Bell — Birmingham',             '7 Temple Row, Birmingham B2 5LS',           'Hospitality', 'Mon-Sun 11:00-23:00',          'High St pedestrian zone — vans only 06:00-10:30.',                    'Manager: 0121 555 1190.',                                   52.4814, -1.8998, '2025-01-15T10:40:00Z'),
  ('d0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The George — Leeds',                '34 Great George Street, Leeds LS1 3DL',     'Hospitality', 'Mon-Sun 11:00-23:30',          'Loading bay shared with adjacent restaurant.',                         'Fire panel above bar.',                                      53.8014, -1.5495, '2025-01-15T10:45:00Z'),
  ('d0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Anchor — Liverpool',            '1 Strand Street, Liverpool L1 8LT',         'Hospitality', 'Mon-Sun 12:00-23:00',          'Waterfront site — high winds protocol for roof works.',                'Duty mgr: 0151 555 6611.',                                  53.4015, -2.9919, '2025-01-15T10:50:00Z'),
  ('d0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'The Plough — Newcastle',            '88 Westgate Road, Newcastle NE1 1SG',       'Hospitality', 'Mon-Sun 11:00-23:00',          'Beer cellar via trapdoor — engineer must wear harness.',               'Out of hours: 0191 555 7720.',                              54.9706, -1.6151, '2025-01-15T10:55:00Z')
ON CONFLICT (id) DO NOTHING;

-- Mercer & Hole Schools Trust — 8 schools (education)
INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours, access_notes, emergency_details, latitude, longitude, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Lambeth Hill Primary',              '21 Lambeth Hill, London EC4V 4EU',          'Education', 'Mon-Fri 07:30-18:30',          'Sign in with safeguarding lead. DBS visible at all times.',          'Caretaker mobile: 07700 900410.',                          51.5119, -0.0935, '2025-01-18T09:00:00Z'),
  ('d0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Westbrook Academy',                 '5 Vauxhall Bridge Road, London SW1V 1RB',    'Education', 'Mon-Fri 07:00-19:00',          'Term-time non-urgent works only. School holidays preferred.',         'Site manager: 020 7895 4530.',                              51.4925, -0.1340, '2025-01-18T09:05:00Z'),
  ('d0000000-0000-4000-8000-000000000015', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Riverside Sixth Form',              '142 Putney High Street, London SW15 1RR',    'Education', 'Mon-Fri 07:30-18:00',          'Bus garage adjoins — engine noise affects roof works.',               'Caretaker: 07700 900411.',                                  51.4631, -0.2173, '2025-01-18T09:10:00Z'),
  ('d0000000-0000-4000-8000-000000000016', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Marlborough College Prep',           '18 Bath Road, Marlborough SN8 1RD',         'Education', 'Mon-Fri 07:00-19:00',          'Heritage estate. Tree preservation orders apply.',                    'Estates office: 01672 555 020.',                            51.4189, -1.7283, '2025-01-18T09:15:00Z'),
  ('d0000000-0000-4000-8000-000000000017', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Cheltenham Grange Primary',         '5 Lansdown Crescent, Cheltenham GL50 2HU',  'Education', 'Mon-Fri 07:30-18:30',          'No parking on crescent — bay 3 reserved.',                            'Caretaker: 07700 900412.',                                  51.8980, -2.0826, '2025-01-18T09:20:00Z'),
  ('d0000000-0000-4000-8000-000000000018', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Bristol Wells Academy',             '88 Wells Road, Bristol BS4 2AG',            'Education', 'Mon-Fri 07:00-19:00',          'Sports hall adjoins — generator runs evenings.',                       'Site mgr: 0117 555 1180.',                                  51.4408, -2.5767, '2025-01-18T09:25:00Z'),
  ('d0000000-0000-4000-8000-000000000019', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Birmingham Northfield High',         '10 Bristol Road South, Birmingham B31 2QT', 'Education', 'Mon-Fri 07:30-18:30',          'Asbestos register — check before any drilling.',                       'Estates: 0121 555 2240.',                                   52.4072, -1.9670, '2025-01-18T09:30:00Z'),
  ('d0000000-0000-4000-8000-000000000020', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Edinburgh Pentland Primary',         '12 Colinton Road, Edinburgh EH10 5DT',      'Education', 'Mon-Fri 07:30-18:00',          'Secure entry only via reception. Visitor lanyard mandatory.',          'Janitor: 07700 900413.',                                    55.9180, -3.2230, '2025-01-18T09:35:00Z')
ON CONFLICT (id) DO NOTHING;

-- Aldridge Healthcare Group — 5 properties (healthcare)
INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours, access_notes, emergency_details, latitude, longitude, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Aldridge Edgbaston Hospital',        '5 Hagley Road, Birmingham B16 8PE',         'Healthcare', '24/7',                         'Permit-to-work for all clinical areas. Asbestos register Block C.',  'Estates on-call: 0121 555 6700.',                          52.4730, -1.9210, '2025-01-20T10:00:00Z'),
  ('d0000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Aldridge London Clinic',             '88 Harley Street, London W1G 7HG',           'Healthcare', 'Mon-Sat 07:00-21:00',          'Patient-quiet zones strictly enforced. No drilling Mon-Fri 08:00-18:00.', 'Practice mgr: 020 7895 6701.',                              51.5202, -0.1487, '2025-01-20T10:05:00Z'),
  ('d0000000-0000-4000-8000-000000000023', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Aldridge Manchester GP Centre',      '15 Oxford Road, Manchester M1 5QA',         'Healthcare', 'Mon-Fri 07:30-19:00, Sat 09:00-13:00', 'Vaccine fridges — no power isolation without 48h notice.',     'Practice mgr: 0161 555 6702.',                              53.4720, -2.2400, '2025-01-20T10:10:00Z'),
  ('d0000000-0000-4000-8000-000000000024', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Aldridge Bristol Day Hospital',     '20 Whiteladies Road, Bristol BS8 2LS',      'Healthcare', 'Mon-Sun 07:00-21:00',          'Theatres on first floor — no hot works without permit.',               'Estates: 0117 555 6703.',                                   51.4625, -2.6090, '2025-01-20T10:15:00Z'),
  ('d0000000-0000-4000-8000-000000000025', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Aldridge Leeds Polyclinic',          '5 Park Square West, Leeds LS1 2NE',         'Healthcare', 'Mon-Sun 08:00-20:00',          'CDU on third floor — permit required for plant works.',                'Estates on-call: 0113 555 6704.',                            53.7970, -1.5499, '2025-01-20T10:20:00Z')
ON CONFLICT (id) DO NOTHING;

-- Fitzgerald Office Estates — 15 commercial buildings
INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours, access_notes, emergency_details, latitude, longitude, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000026', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Finsbury Avenue One',                '1 Finsbury Avenue, London EC2M 2PA',          'Commercial', 'Mon-Fri 06:00-22:00',          'Loading bay B — book 24h ahead. PPE mandatory in basement.',           'Building mgr: 020 7946 1090.',                              51.5188, -0.0843, '2025-01-22T11:00:00Z'),
  ('d0000000-0000-4000-8000-000000000027', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Cannon Place',                       '78 Cannon Street, London EC4N 6AF',          'Commercial', 'Mon-Fri 06:00-22:00',          'Out of hours preferred for any tenant disruption.',                    'Concierge: 020 7946 1091.',                                 51.5117, -0.0922, '2025-01-22T11:05:00Z'),
  ('d0000000-0000-4000-8000-000000000028', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Paddington Central',                 '2 Kingdom Street, London W2 6BD',            'Commercial', 'Mon-Fri 06:30-22:00',          'Multi-tenant — coordinate with on-site BMS engineer.',                 'Building mgr: 020 7946 1092.',                              51.5193, -0.1771, '2025-01-22T11:10:00Z'),
  ('d0000000-0000-4000-8000-000000000029', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'King''s Cross Three',                '3 Pancras Square, London N1C 4AG',           'Commercial', 'Mon-Fri 06:00-22:00',          'BREEAM Outstanding — no aerosol products on site.',                    'Building mgr: 020 7946 1093.',                              51.5343, -0.1267, '2025-01-22T11:15:00Z'),
  ('d0000000-0000-4000-8000-000000000030', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Spinningfields Tower',                '1 Hardman Square, Manchester M3 3EB',         'Commercial', 'Mon-Fri 06:00-22:00',          'Tower crane logs — check with site mgr before roof access.',           'Building mgr: 0161 555 4090.',                              53.4807, -2.2520, '2025-01-22T11:20:00Z'),
  ('d0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Brindleyplace 8',                    '8 Brindleyplace, Birmingham B1 2HX',         'Commercial', 'Mon-Fri 06:00-22:00',          'Canalside — debris must be sealed before transit.',                    'Building mgr: 0121 555 4091.',                              52.4775, -1.9128, '2025-01-22T11:25:00Z'),
  ('d0000000-0000-4000-8000-000000000032', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Temple Quay One',                    '1 Temple Way, Bristol BS1 6DZ',              'Commercial', 'Mon-Fri 06:30-21:00',          'Plant level 7 — escort required.',                                     'Building mgr: 0117 555 4092.',                              51.4528, -2.5808, '2025-01-22T11:30:00Z'),
  ('d0000000-0000-4000-8000-000000000033', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Wellington Place North',             '7 Wellington Place, Leeds LS1 4AP',          'Commercial', 'Mon-Fri 06:00-22:00',          'Multi-tenant. Tenant comms 48h before any AHU shutdown.',              'Building mgr: 0113 555 4093.',                              53.7960, -1.5530, '2025-01-22T11:35:00Z'),
  ('d0000000-0000-4000-8000-000000000034', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Edinburgh Quay 2',                   '139 Fountainbridge, Edinburgh EH3 9QG',      'Commercial', 'Mon-Fri 07:00-21:00',          'Canalside loading via Lochrin Place only.',                            'Building mgr: 0131 555 4094.',                              55.9430, -3.2080, '2025-01-22T11:40:00Z'),
  ('d0000000-0000-4000-8000-000000000035', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Wave House',                         '1 Wapping Wall, London E1W 3SG',             'Commercial', 'Mon-Fri 06:30-22:00',          'Riverside listed — heritage approval for any external works.',         'Building mgr: 020 7946 1094.',                              51.5070, -0.0560, '2025-01-22T11:45:00Z'),
  ('d0000000-0000-4000-8000-000000000036', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Bishopsgate House',                  '88 Bishopsgate, London EC2M 4QP',            'Commercial', 'Mon-Fri 06:00-22:00',          'BMS upgrade in progress — coord with mgmt.',                           'Building mgr: 020 7946 1095.',                              51.5158, -0.0810, '2025-01-22T11:50:00Z'),
  ('d0000000-0000-4000-8000-000000000037', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Oxford Cornmarket',                  '12 Cornmarket Street, Oxford OX1 3EX',       'Commercial', 'Mon-Fri 07:00-21:00',          'Pedestrian zone — vans 06:00-10:00 only.',                             'Building mgr: 01865 555 4096.',                             51.7530, -1.2580, '2025-01-22T11:55:00Z'),
  ('d0000000-0000-4000-8000-000000000038', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Cambridge Hills Road',                '88 Hills Road, Cambridge CB2 1LQ',           'Commercial', 'Mon-Fri 07:00-21:00',          'Cycle parking under-croft — clear before plant deliveries.',           'Building mgr: 01223 555 4097.',                             52.1955, -0.1248, '2025-01-22T12:00:00Z'),
  ('d0000000-0000-4000-8000-000000000039', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Cardiff Capital Quarter',             '1 Tyndall Street, Cardiff CF10 4BE',         'Commercial', 'Mon-Fri 07:00-21:00',          'Storm drainage works in progress — check with site mgr.',              'Building mgr: 029 2055 4098.',                              51.4791, -3.1700, '2025-01-22T12:05:00Z'),
  ('d0000000-0000-4000-8000-000000000040', 'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Newcastle Quayside',                  '88 Quayside, Newcastle NE1 3DX',             'Commercial', 'Mon-Fri 06:30-21:00',          'Tide-level works require permit. RIB on-call for marine egress.',      'Building mgr: 0191 555 4099.',                              54.9692, -1.6045, '2025-01-22T12:10:00Z')
ON CONFLICT (id) DO NOTHING;

-- Riverside Retail — 9 retail/shopping centres
INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours, access_notes, emergency_details, latitude, longitude, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000041', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Trafford Plaza',                     'Trafford Plaza, Manchester M17 1AA',         'Retail', 'Mon-Sat 09:00-22:00, Sun 11:00-17:00', 'Plant level via security gate G3.',                              'Centre mgr: 0161 555 0220.',                                53.4655, -2.3478, '2025-01-26T10:00:00Z'),
  ('d0000000-0000-4000-8000-000000000042', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Westfield',                '88 Westfield Avenue, London E20 1EJ',         'Retail', 'Mon-Sat 10:00-22:00, Sun 12:00-18:00', 'Shared mall — escalators in night-mode 23:00-05:00.',            'Centre mgr: 020 7946 0220.',                                51.5430, -0.0080, '2025-01-26T10:05:00Z'),
  ('d0000000-0000-4000-8000-000000000043', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Liverpool ONE',            '5 Paradise Street, Liverpool L1 8JF',         'Retail', 'Mon-Sat 10:00-21:00, Sun 11:00-17:00', 'Service yard gate 7 — height restriction 3.6m.',                  'Centre mgr: 0151 555 0221.',                                53.4029, -2.9876, '2025-01-26T10:10:00Z'),
  ('d0000000-0000-4000-8000-000000000044', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Bullring',                  'St Martin''s Walk, Birmingham B5 4BU',       'Retail', 'Mon-Sat 09:30-21:00, Sun 11:00-17:00', 'Listed Selfridges facade — heritage permit for facade works.',  'Centre mgr: 0121 555 0222.',                                52.4775, -1.8927, '2025-01-26T10:15:00Z'),
  ('d0000000-0000-4000-8000-000000000045', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Cabot Circus',             '88 Glass Walk, Bristol BS1 3BX',              'Retail', 'Mon-Sat 09:00-21:00, Sun 11:00-17:00', 'Glass roof — mobile platform booking required.',                'Centre mgr: 0117 555 0223.',                                51.4571, -2.5862, '2025-01-26T10:20:00Z'),
  ('d0000000-0000-4000-8000-000000000046', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Trinity Leeds',            '27 Albion Street, Leeds LS1 5ER',             'Retail', 'Mon-Sat 09:00-22:00, Sun 11:00-17:00', 'Use Albion Street loading bay 09:00-10:30 only.',               'Centre mgr: 0113 555 0224.',                                53.7965, -1.5440, '2025-01-26T10:25:00Z'),
  ('d0000000-0000-4000-8000-000000000047', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Princes Square',           '48 Buchanan Street, Glasgow G1 3JX',          'Retail', 'Mon-Sat 09:00-19:00, Sun 11:00-17:00', 'Listed building — no fixings to historic stone.',                'Centre mgr: 0141 555 0225.',                                55.8615, -4.2528, '2025-01-26T10:30:00Z'),
  ('d0000000-0000-4000-8000-000000000048', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside St David''s Cardiff',      'Hayes Bridge, Cardiff CF10 1GA',              'Retail', 'Mon-Sat 09:30-19:00, Sun 11:00-17:00', 'Plant via service road off The Hayes.',                          'Centre mgr: 029 2055 0226.',                                51.4791, -3.1768, '2025-01-26T10:35:00Z'),
  ('d0000000-0000-4000-8000-000000000049', 'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Riverside Eldon Square',             'Old Eldon Square, Newcastle NE1 7JG',         'Retail', 'Mon-Sat 09:00-19:00, Sun 11:00-17:00', 'Bus station adjoins — coordinate with NE Transport.',           'Centre mgr: 0191 555 0227.',                                54.9750, -1.6160, '2025-01-26T10:40:00Z')
ON CONFLICT (id) DO NOTHING;

-- Newman Industrial Logistics — 6 warehouses (industrial)
INSERT INTO properties (id, client_id, organisation_id, name, address, site_type, operating_hours, access_notes, emergency_details, latitude, longitude, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000050', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Cross Green DC1',                    'Cross Green Industrial Estate, Leeds LS9 0SE', 'Industrial', '24/7',                       'Yard speed 5mph. Hi-vis + steel toe mandatory.',                       'Yard supervisor: 07700 900550.',                            53.7950, -1.5210, '2025-01-28T09:30:00Z'),
  ('d0000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Trafford Park DC2',                  '88 Mosley Road, Manchester M17 1NQ',          'Industrial', '24/7',                       'Cold store -22°C — PPE for refrig area.',                              'Site mgr: 0161 555 8810.',                                  53.4690, -2.3200, '2025-01-28T09:35:00Z'),
  ('d0000000-0000-4000-8000-000000000052', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Birmingham Hams Hall',                'Hams Hall Distribution Park, Birmingham B46 1DY', 'Industrial', '24/7',                  'Dock 14-22 trailers in motion — check with banksman.',                'Site mgr: 0121 555 8811.',                                  52.5215, -1.6925, '2025-01-28T09:40:00Z'),
  ('d0000000-0000-4000-8000-000000000053', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Avonmouth South',                    'Smoke Lane, Bristol BS11 0YA',                'Industrial', '24/7',                       'Tidal site — flood-readiness drill quarterly.',                        'Site mgr: 0117 555 8812.',                                  51.5036, -2.6913, '2025-01-28T09:45:00Z'),
  ('d0000000-0000-4000-8000-000000000054', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Daventry DIRFT',                     'Crick Boulevard, Daventry NN6 7EX',           'Industrial', '24/7',                       'Rail-served terminal — check rail isolation before roof works.',     'Yard supervisor: 07700 900551.',                            52.3490, -1.1100, '2025-01-28T09:50:00Z'),
  ('d0000000-0000-4000-8000-000000000055', 'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Edinburgh Eurocentral',              '88 Mossend Drive, Edinburgh EH28 8PJ',         'Industrial', '24/7',                       'M8 access — abnormal load route restrictions.',                        'Site mgr: 0131 555 8813.',                                  55.8540, -3.7510, '2025-01-28T09:55:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Areas — a couple per representative property (not exhaustive)
-- ---------------------------------------------------------------------------
INSERT INTO areas (id, property_id, name, floor, description) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Cellar',          'Basement', 'Beer cellar + plant'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Bar Floor',       'Ground',   'Public bar area'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'Kitchen',         'Ground',   'Commercial kitchen'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000021', 'Outpatients',     'Ground',   'OPD clinic block'),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000021', 'Theatres',        'First',    'Operating theatres 1-4'),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000021', 'Plant Room',      'Roof',     'AHUs, generator, sprinkler tanks'),
  ('e0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000026', 'Reception',       'Ground',   'Lobby + concierge'),
  ('e0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000026', 'Tenant Floors',   'Various',  'Levels 1-12 multi-tenant'),
  ('e0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000026', 'Plant Deck',      'Roof',     'Cooling towers, AHUs, BMS'),
  ('e0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000041', 'Mall',            'Ground',   'Main retail mall'),
  ('e0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000041', 'Food Court',      'First',    'Casual dining area'),
  ('e0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000041', 'Service Yard',    'Ground',   'Loading bays + back-of-house'),
  ('e0000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000050', 'Warehouse Floor', 'Ground',   'Pallet racking + dispatch'),
  ('e0000000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000050', 'Cold Store',      'Ground',   'Refrigerated zone -2 to 5°C'),
  ('e0000000-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-000000000013', 'Hall',            'Ground',   'Main entrance + assembly'),
  ('e0000000-0000-4000-8000-000000000016', 'd0000000-0000-4000-8000-000000000013', 'Plant Room',      'Roof',     'Boiler + AHU')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Assets — generated using SELECT ... FROM properties to keep file compact
-- ---------------------------------------------------------------------------
-- Each property gets a representative asset mix. Use deterministic uuid_v5-style
-- stitched IDs by property to keep idempotency.
INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-boiler-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Gas Boiler — Main', 'Heating', 'Potterton', 'Paramount Five 115',
  'POT-' || substr(p.id::text, 25, 8), '2018-06-15', 'active', '2025-02-01T09:00:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-fire-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Fire Alarm Panel', 'Fire Safety', 'Advanced', 'MxPro 5',
  'ADV-' || substr(p.id::text, 25, 8), '2020-03-10', 'active', '2025-02-01T09:05:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-emerg-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Emergency Lighting System', 'Fire Safety', 'Eaton', 'CG-Line',
  'EAT-' || substr(p.id::text, 25, 8), '2021-09-01', 'active', '2025-02-01T09:10:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-ac-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'AC Unit — VRF System', 'HVAC', 'Daikin', 'VRV IV',
  'DAI-' || substr(p.id::text, 25, 8), '2019-04-22', 'active', '2025-02-01T09:15:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Lifts on hospitality/healthcare/commercial/retail (skip industrial single-storey)
INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-lift-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Passenger Lift', 'Vertical Transport', 'Otis', 'Gen2',
  'OTI-' || substr(p.id::text, 25, 8), '2017-01-14', 'active', '2025-02-01T09:20:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Hospitality','Healthcare','Commercial','Retail','Education')
ON CONFLICT (id) DO NOTHING;

-- Water boosters on healthcare/commercial/retail
INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-water-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Cold Water Booster Set', 'Water Systems', 'Grundfos', 'Hydro MPC-E',
  'GRU-' || substr(p.id::text, 25, 8), '2020-11-08', 'active', '2025-02-01T09:25:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Healthcare','Commercial','Retail','Industrial')
ON CONFLICT (id) DO NOTHING;

-- Kitchen extracts on hospitality + education
INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-kitch-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Kitchen Extract Canopy', 'HVAC', 'Halton', 'KVI-UV',
  'HAL-' || substr(p.id::text, 25, 8), '2021-04-30', 'active', '2025-02-01T09:30:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Hospitality','Education','Healthcare')
ON CONFLICT (id) DO NOTHING;

-- Refrigeration on industrial cold-stores + retail food courts
INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-refrig-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Cold Store Refrigeration', 'Refrigeration', 'Bitzer', '4DES-7Y',
  'BIT-' || substr(p.id::text, 25, 8), '2019-08-15', 'active', '2025-02-01T09:35:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Industrial','Retail')
ON CONFLICT (id) DO NOTHING;

-- Diesel generators on healthcare + commercial
INSERT INTO assets (id, property_id, organisation_id, name, category, make, model, serial_number, install_date, status, created_at)
SELECT
  uuid_in(md5('asset-gen-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Standby Diesel Generator', 'Electrical', 'FG Wilson', 'P450-3',
  'FGW-' || substr(p.id::text, 25, 8), '2016-12-01', 'active', '2025-02-01T09:40:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Healthcare','Commercial')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Compliance items — generated per property by SELECT
-- Status distribution managed via offsets relative to current date 2026-04-25.
-- compliant: ~60% (next_due > +30 days)
-- due_soon : ~20% (next_due within 30 days)
-- overdue  : ~12% (next_due < today)
-- non_compliant: ~8% (overdue + flagged)
-- ---------------------------------------------------------------------------

-- Gas safety cert — annual — mostly compliant, some due_soon
INSERT INTO compliance_items (id, property_id, organisation_id, name, compliance_type, frequency, last_completed, next_due, status, created_at)
SELECT
  uuid_in(md5('comp-gas-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Gas Safety Certificate (CP12)', 'gas_safety', 'annual',
  '2025-09-15T09:00:00Z', '2026-09-15T09:00:00Z',
  CASE WHEN p.id::text < 'd0000000-0000-4000-8000-000000000010' THEN 'compliant' ELSE 'compliant' END,
  '2025-02-01T10:00:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Hospitality','Education','Healthcare','Commercial','Retail')
ON CONFLICT (id) DO NOTHING;

-- EICR — every 5 years; mix of compliant/due_soon/overdue
INSERT INTO compliance_items (id, property_id, organisation_id, name, compliance_type, frequency, last_completed, next_due, status, created_at)
SELECT
  uuid_in(md5('comp-eicr-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'EICR — Fixed Wiring Test', 'electrical', 'annual',
  '2021-05-10T09:00:00Z',
  CASE
    WHEN substr(p.id::text, 35, 1) IN ('1','2','3','4','5') THEN '2026-05-10T09:00:00Z'
    WHEN substr(p.id::text, 35, 1) IN ('6','7') THEN '2026-04-10T09:00:00Z'
    WHEN substr(p.id::text, 35, 1) IN ('8') THEN '2026-03-15T09:00:00Z'
    ELSE '2026-09-10T09:00:00Z'
  END,
  CASE
    WHEN substr(p.id::text, 35, 1) IN ('1','2','3','4','5') THEN 'due_soon'
    WHEN substr(p.id::text, 35, 1) IN ('6','7') THEN 'due_soon'
    WHEN substr(p.id::text, 35, 1) IN ('8') THEN 'overdue'
    ELSE 'compliant'
  END,
  '2025-02-01T10:05:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Fire risk assessment — annual — mostly compliant
INSERT INTO compliance_items (id, property_id, organisation_id, name, compliance_type, frequency, last_completed, next_due, status, created_at)
SELECT
  uuid_in(md5('comp-fra-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Fire Risk Assessment', 'fire_safety', 'annual',
  '2025-11-01T09:00:00Z', '2026-11-01T09:00:00Z',
  'compliant',
  '2025-02-01T10:10:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Legionella risk assessment — every 2y, monthly checks → some overdue
INSERT INTO compliance_items (id, property_id, organisation_id, name, compliance_type, frequency, last_completed, next_due, status, created_at)
SELECT
  uuid_in(md5('comp-leg-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Legionella Risk Assessment', 'water_safety', 'annual',
  '2024-04-25T09:00:00Z',
  CASE
    WHEN substr(p.id::text, 35, 1) IN ('1','9') THEN '2026-04-15T09:00:00Z'
    WHEN substr(p.id::text, 35, 1) IN ('a','b') THEN '2026-04-25T09:00:00Z'
    ELSE '2026-04-25T09:00:00Z'
  END,
  CASE
    WHEN substr(p.id::text, 35, 1) IN ('1','9') THEN 'overdue'
    WHEN substr(p.id::text, 35, 1) IN ('a','b') THEN 'non_compliant'
    ELSE 'compliant'
  END,
  '2025-02-01T10:15:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Lift LOLER — every 6 months; education + commercial + healthcare + retail + hospitality
INSERT INTO compliance_items (id, property_id, organisation_id, name, compliance_type, frequency, last_completed, next_due, status, created_at)
SELECT
  uuid_in(md5('comp-loler-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  'Lift LOLER Inspection', 'lifting_equipment', 'six_monthly',
  '2025-12-01T09:00:00Z',
  CASE
    WHEN substr(p.id::text, 35, 1) IN ('2','3') THEN '2026-05-15T09:00:00Z'
    WHEN substr(p.id::text, 35, 1) IN ('4') THEN '2026-04-30T09:00:00Z'
    ELSE '2026-06-01T09:00:00Z'
  END,
  CASE
    WHEN substr(p.id::text, 35, 1) IN ('2','3','4') THEN 'due_soon'
    ELSE 'compliant'
  END,
  '2025-02-01T10:20:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND p.site_type IN ('Hospitality','Healthcare','Commercial','Retail','Education')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Maintenance Plans — one per major asset
-- ---------------------------------------------------------------------------
-- Boiler annual service
INSERT INTO maintenance_plans (id, property_id, asset_id, organisation_id, name, frequency, last_completed, next_due, is_active, created_at)
SELECT
  uuid_in(md5('plan-boiler-' || p.id::text)::cstring),
  p.id,
  uuid_in(md5('asset-boiler-' || p.id::text)::cstring),
  p.organisation_id,
  'Boiler — Annual Service', 'annual',
  '2025-09-15T09:00:00Z', '2026-09-15T09:00:00Z', true, '2025-02-05T09:00:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- AC quarterly
INSERT INTO maintenance_plans (id, property_id, asset_id, organisation_id, name, frequency, last_completed, next_due, is_active, created_at)
SELECT
  uuid_in(md5('plan-ac-' || p.id::text)::cstring),
  p.id,
  uuid_in(md5('asset-ac-' || p.id::text)::cstring),
  p.organisation_id,
  'AC VRF — Quarterly Filter & Inspection', 'quarterly',
  '2026-01-15T09:00:00Z', '2026-04-15T09:00:00Z', true, '2025-02-05T09:05:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Emergency lighting monthly
INSERT INTO maintenance_plans (id, property_id, asset_id, organisation_id, name, frequency, last_completed, next_due, is_active, created_at)
SELECT
  uuid_in(md5('plan-emerg-' || p.id::text)::cstring),
  p.id,
  uuid_in(md5('asset-emerg-' || p.id::text)::cstring),
  p.organisation_id,
  'Emergency Lighting — Monthly Function Test', 'monthly',
  '2026-04-01T09:00:00Z', '2026-05-01T09:00:00Z', true, '2025-02-05T09:10:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Fire alarm 6-monthly
INSERT INTO maintenance_plans (id, property_id, asset_id, organisation_id, name, frequency, last_completed, next_due, is_active, created_at)
SELECT
  uuid_in(md5('plan-fire-' || p.id::text)::cstring),
  p.id,
  uuid_in(md5('asset-fire-' || p.id::text)::cstring),
  p.organisation_id,
  'Fire Alarm — Six-Monthly Service', 'six_monthly',
  '2025-12-01T09:00:00Z', '2026-06-01T09:00:00Z', true, '2025-02-05T09:15:00Z'
FROM properties p WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Engineers — 5 (one mirrored to profile 'Emma Brooks')
-- ---------------------------------------------------------------------------
INSERT INTO engineers (id, organisation_id, profile_id, name, email, phone, trade, skills, status, notes, created_at) VALUES
  ('ee100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'Emma Brooks',    'emma.brooks@northwind-pm.example',   '+44 7700 900201', 'Multi-skilled',  ARRAY['gas','electrical','hvac'],          'active', 'Senior engineer. Lead on healthcare contracts.', '2025-01-12T09:00:00Z'),
  ('ee100000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'Oliver Hughes',  'oliver.hughes@northwind-pm.example', '+44 7700 900202', 'Electrical',    ARRAY['electrical','testing','fire_alarm'], 'active', 'NICEIC qualified.',                              '2025-01-12T09:05:00Z'),
  ('ee100000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'Priya Shah',     'priya.shah@northwind-pm.example',    '+44 7700 900203', 'Gas / Heating', ARRAY['gas','heating','plumbing'],         'active', 'Gas Safe registered. Lead on hospitality.',     '2025-01-12T09:10:00Z'),
  ('ee100000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 'Callum Reid',    'callum.reid@northwind-pm.example',   '+44 7700 900204', 'HVAC / F-Gas',  ARRAY['hvac','fgas','refrigeration'],      'active', 'F-Gas Cat 1. Cold-store specialist.',           '2025-01-12T09:15:00Z'),
  ('ee100000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000007', 'Fiona Macleod',  'fiona.macleod@northwind-pm.example', '+44 7700 900205', 'Mechanical',    ARRAY['plumbing','water','legionella'],    'active', 'L8 / Legionella competent person.',             '2025-01-12T09:20:00Z')
ON CONFLICT (id) DO NOTHING;

-- Engineer accreditations — 2-3 each
INSERT INTO engineer_accreditations (id, engineer_id, organisation_id, accreditation_type, registration_number, issue_date, expiry_date, status) VALUES
  ('99000000-0000-4000-8000-000000000001', 'ee100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Gas Safe',      '511872', '2024-04-01', '2027-04-01', 'valid'),
  ('99000000-0000-4000-8000-000000000002', 'ee100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'NICEIC',        'NIC-22001','2023-06-12','2026-06-12', 'valid'),
  ('99000000-0000-4000-8000-000000000003', 'ee100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'F-Gas Cat 1',   'FGAS-77410','2022-09-30','2027-09-30','valid'),
  ('99000000-0000-4000-8000-000000000004', 'ee100000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'NICEIC',        'NIC-22002','2024-01-15','2027-01-15', 'valid'),
  ('99000000-0000-4000-8000-000000000005', 'ee100000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'IPAF 3a/3b',    'IPAF-118832','2025-03-01','2030-03-01','valid'),
  ('99000000-0000-4000-8000-000000000006', 'ee100000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Gas Safe',      '511873', '2024-05-20', '2027-05-20','valid'),
  ('99000000-0000-4000-8000-000000000007', 'ee100000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'WaterSafe',     'WS-44511','2024-02-01','2027-02-01', 'valid'),
  ('99000000-0000-4000-8000-000000000008', 'ee100000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'F-Gas Cat 1',   'FGAS-77411','2023-10-10','2028-10-10','valid'),
  ('99000000-0000-4000-8000-000000000009', 'ee100000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'IPAF 3a/3b',    'IPAF-118833','2024-04-08','2029-04-08','valid'),
  ('99000000-0000-4000-8000-000000000010', 'ee100000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Legionella L8', 'L8-22501','2024-09-12','2027-09-12','valid'),
  ('99000000-0000-4000-8000-000000000011', 'ee100000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'NICEIC',        'NIC-22003','2023-11-22','2026-11-22','valid')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Subcontractors — 3 specialists
-- ---------------------------------------------------------------------------
INSERT INTO subcontractors (id, organisation_id, company_name, contact_person, email, phone, trade, status, notes, created_at) VALUES
  ('66000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Apex Lift Services',     'Liam Donovan',  'dispatch@apexlift.example',     '+44 20 7946 8801', 'Lifts',       'approved', 'Preferred for Otis Gen2 escalator works. SafeContractor accredited.', '2025-01-13T09:00:00Z'),
  ('66000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Severn Plumbing Co',     'Helen Davies',  'ops@severnplumb.example',       '+44 117 555 8802', 'Plumbing',    'approved', 'L8 / WaterSafe partner — south-west and Wales coverage.',              '2025-01-13T09:05:00Z'),
  ('66000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Brightway Electrical',   'Adam Whitcomb', 'jobs@brightway-elec.example',   '+44 161 555 8803', 'Electrical',  'approved', 'NICEIC contractor — capacity for >1MW commissioning.',                  '2025-01-13T09:10:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11. Jobs — mix of statuses, 50+ rows. Generated where helpful.
-- ---------------------------------------------------------------------------
-- 15 completed jobs across past 30 days (PPM emergency lighting tests)
INSERT INTO jobs (id, property_id, organisation_id, maintenance_plan_id, title, description, status, priority, scheduled_date, completed_date, is_callout, sla_priority, job_type, created_at)
SELECT
  uuid_in(md5('job-comp-emerg-' || p.id::text)::cstring),
  p.id, p.organisation_id,
  uuid_in(md5('plan-emerg-' || p.id::text)::cstring),
  'Emergency Lighting Monthly Test — Apr 2026',
  'Monthly function test of all emergency lighting units.',
  'completed', 'medium',
  '2026-04-01T09:00:00Z', '2026-04-01T11:30:00Z',
  false, 'p3', 'planned',
  '2026-03-25T09:00:00Z'
FROM properties p
WHERE p.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND substr(p.id::text, 35, 1) IN ('1','2','3','4','5','6','7','8','9','a','b','c','d','e','f')
LIMIT 15
ON CONFLICT (id) DO NOTHING;

-- 8 scheduled-this-week jobs (date 2026-04-25..2026-05-02)
INSERT INTO jobs (id, property_id, organisation_id, maintenance_plan_id, title, description, status, priority, scheduled_date, is_callout, sla_priority, job_type, created_at) VALUES
  ('cc100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'Kitchen Extract Deep Clean — Crown & Anchor',  'Six-monthly LEV deep clean and TR19 certificate.',                'scheduled', 'medium',  '2026-04-26T08:00:00Z', false, 'p3', 'planned',  '2026-04-19T09:00:00Z'),
  ('cc100000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'Quarterly AHU Service — Edgbaston Theatres',     'Filter change, belt + bearing inspection on AHU 1-3.',            'scheduled', 'high',    '2026-04-27T07:00:00Z', false, 'p2', 'planned',  '2026-04-19T09:05:00Z'),
  ('cc100000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000026', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'BMS Health Check — Finsbury Avenue One',         'Quarterly BMS audit + temperature trend review.',                  'scheduled', 'medium',  '2026-04-28T18:00:00Z', false, 'p3', 'planned',  '2026-04-19T09:10:00Z'),
  ('cc100000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'Mall AHU Quarterly Service — Trafford Plaza',    'Filter + belt change. Coil clean. Damper inspection.',             'scheduled', 'medium',  '2026-04-28T22:00:00Z', false, 'p3', 'planned',  '2026-04-19T09:15:00Z'),
  ('cc100000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000050', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'F-Gas Leak Inspection — Cross Green DC1',        '12-month leak check on cold-store refrigeration plant.',           'scheduled', 'high',    '2026-04-29T06:00:00Z', false, 'p2', 'planned',  '2026-04-19T09:20:00Z'),
  ('cc100000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'PAT Testing — Lambeth Hill Primary',              'Annual PAT testing — clinical and office equipment.',             'scheduled', 'medium',  '2026-04-30T08:00:00Z', false, 'p3', 'planned',  '2026-04-19T09:25:00Z'),
  ('cc100000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'Boiler Annual Service — The Black Swan',          'Service Potterton P5 boiler. Flue test, gas tightness.',           'scheduled', 'medium',  '2026-05-01T09:00:00Z', false, 'p3', 'planned',  '2026-04-19T09:30:00Z'),
  ('cc100000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000001', NULL,                                                          'Generator Load Test — Aldridge London',           'Bi-annual generator load test (4-hour run).',                       'scheduled', 'high',    '2026-05-02T07:00:00Z', false, 'p2', 'planned',  '2026-04-19T09:35:00Z')
ON CONFLICT (id) DO NOTHING;

-- 5 in-progress jobs
INSERT INTO jobs (id, property_id, organisation_id, maintenance_plan_id, title, description, status, priority, scheduled_date, is_callout, sla_priority, job_type, created_at) VALUES
  ('cc200000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', NULL, 'Reactive: Beer Cellar Cooling Failure',          'Cellar at 14°C — immediate repair to coil.',         'in_progress', 'urgent',  '2026-04-25T07:30:00Z', true,  'p1', 'reactive', '2026-04-25T07:00:00Z'),
  ('cc200000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000001', NULL, 'Reactive: Theatre AHU Alarm — Edgbaston',         'BMS alarm on AHU3 high static. Investigate damper.',  'in_progress', 'high',    '2026-04-25T08:00:00Z', true,  'p2', 'reactive', '2026-04-25T07:45:00Z'),
  ('cc200000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000001', NULL, 'Mall Lift 2 — Stuck on level 1 (Trafford)',       'Otis Gen2 fault code 4-7. Awaiting subcontractor.',  'in_progress', 'high',    '2026-04-25T09:00:00Z', true,  'p2', 'reactive', '2026-04-25T08:30:00Z'),
  ('cc200000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000050', 'a0000000-0000-4000-8000-000000000001', NULL, 'Cold Store Door Seal Repair — Cross Green DC1',   'Seal compromised — temp drift +3°C overnight.',       'in_progress', 'high',    '2026-04-25T06:30:00Z', true,  'p2', 'reactive', '2026-04-25T05:45:00Z'),
  ('cc200000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000026', 'a0000000-0000-4000-8000-000000000001', NULL, 'BMS Override — Finsbury Avenue (tenant comfort)',  'Tenant on L7 reporting cold; investigate VAV.',       'in_progress', 'medium',  '2026-04-25T10:00:00Z', false, 'p3', 'reactive', '2026-04-25T09:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- 4 pending / scheduled but unassigned
INSERT INTO jobs (id, property_id, organisation_id, maintenance_plan_id, title, description, status, priority, scheduled_date, is_callout, sla_priority, job_type, created_at) VALUES
  ('cc300000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000019', 'a0000000-0000-4000-8000-000000000001', NULL, 'Asbestos Re-Survey — Birmingham Northfield High', 'Triennial asbestos register update.',                'scheduled', 'medium',  '2026-05-12T09:00:00Z', false, 'p3', 'planned',  '2026-04-15T10:00:00Z'),
  ('cc300000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000044', 'a0000000-0000-4000-8000-000000000001', NULL, 'Heritage Survey — Selfridges Facade (Bullring)',   'External facade survey ahead of 2027 cyclic clean.',  'scheduled', 'low',     '2026-05-15T09:00:00Z', false, 'p4', 'planned',  '2026-04-15T10:05:00Z'),
  ('cc300000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000034', 'a0000000-0000-4000-8000-000000000001', NULL, 'Cooling Tower Risk Assessment — Edinburgh Quay 2', 'L8 cooling tower review.',                            'scheduled', 'medium',  '2026-05-18T09:00:00Z', false, 'p3', 'planned',  '2026-04-15T10:10:00Z'),
  ('cc300000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', NULL, 'Listed Building Lighting Survey — Edinburgh',      'Heritage-friendly emergency lighting scoping.',       'scheduled', 'low',     '2026-05-20T09:00:00Z', false, 'p4', 'planned',  '2026-04-15T10:15:00Z')
ON CONFLICT (id) DO NOTHING;

-- 6 follow-up / failed-access (story flavour)
INSERT INTO jobs (id, property_id, organisation_id, maintenance_plan_id, title, description, status, priority, scheduled_date, is_callout, sla_priority, job_type, created_at) VALUES
  ('cc400000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000001', NULL, 'Vaccine Fridge Alarm — Aldridge Manchester',       'Alarm tripped overnight. Engineer attended; sensor replaced. Awaiting calibration cert.', 'follow_up_required', 'high',   '2026-04-22T07:00:00Z', true,  'p2', 'reactive', '2026-04-21T22:30:00Z'),
  ('cc400000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000001', NULL, 'PAT Testing — Cheltenham Grange',                  'Site closed unexpectedly — half-term inset day. Reschedule to 2026-05-04.',                'failed_access',      'medium', '2026-04-20T08:00:00Z', false, 'p3', 'planned',  '2026-04-13T10:00:00Z'),
  ('cc400000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000028', 'a0000000-0000-4000-8000-000000000001', NULL, 'BMS Sensor Replacement — Paddington Central',       'Faulty sensor on L4 VAV box. Awaiting parts (5 working day lead).',                       'follow_up_required', 'medium', '2026-04-19T18:00:00Z', false, 'p3', 'reactive', '2026-04-19T17:30:00Z'),
  ('cc400000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000045', 'a0000000-0000-4000-8000-000000000001', NULL, 'Glass Roof Inspection — Cabot Circus',              'High wind cancelled MEWP. Reschedule with weather window.',                                'failed_access',      'low',    '2026-04-18T09:00:00Z', false, 'p4', 'planned',  '2026-04-12T10:00:00Z'),
  ('cc400000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000037', 'a0000000-0000-4000-8000-000000000001', NULL, 'Pedestrian Zone Access Issue — Cornmarket Oxford',  'Council enforcement officer turned van away — needed permit. Reschedule with permit.',     'failed_access',      'medium', '2026-04-17T11:00:00Z', false, 'p3', 'planned',  '2026-04-10T10:00:00Z'),
  ('cc400000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000051', 'a0000000-0000-4000-8000-000000000001', NULL, 'Refrigeration Compressor Alarm — Trafford DC2',     'Alarm cleared on attendance — recommend full F-Gas leak test (booked).',                  'follow_up_required', 'high',   '2026-04-16T05:30:00Z', true,  'p1', 'reactive', '2026-04-16T04:50:00Z')
ON CONFLICT (id) DO NOTHING;

-- 12 more completed jobs (reactive call-outs from past 30 days)
INSERT INTO jobs (id, property_id, organisation_id, title, description, status, priority, scheduled_date, completed_date, is_callout, sla_priority, job_type, created_at) VALUES
  ('cc500000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Pump Failure — The Royal Oak Camden',          'Booster pump tripped. Reset and tested OK.',          'completed', 'high',   '2026-04-08T18:30:00Z', '2026-04-08T20:15:00Z', true,  'p2', 'reactive', '2026-04-08T18:00:00Z'),
  ('cc500000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'Toilet Leak — Westbrook Academy',               'Cubicle 3 supply pipe split. Replaced.',              'completed', 'medium', '2026-04-09T11:00:00Z', '2026-04-09T13:30:00Z', true,  'p3', 'reactive', '2026-04-09T10:30:00Z'),
  ('cc500000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000027', 'a0000000-0000-4000-8000-000000000001', 'AHU Alarm — Cannon Place',                       'High return air temp. Belt slipped — replaced.',      'completed', 'high',   '2026-04-10T20:00:00Z', '2026-04-10T22:30:00Z', false, 'p2', 'reactive', '2026-04-10T19:30:00Z'),
  ('cc500000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000033', 'a0000000-0000-4000-8000-000000000001', 'BMS Comms Loss — Wellington Place',              'Comms restored after switch reboot. Patch applied.',  'completed', 'medium', '2026-04-12T08:00:00Z', '2026-04-12T09:45:00Z', false, 'p3', 'reactive', '2026-04-12T07:30:00Z'),
  ('cc500000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000043', 'a0000000-0000-4000-8000-000000000001', 'Escalator Fault — Liverpool ONE',                'Liverpool ONE escalator step gap fault. Cleaned and reset.','completed','high', '2026-04-12T13:00:00Z', '2026-04-12T15:00:00Z', true,  'p2', 'reactive', '2026-04-12T12:30:00Z'),
  ('cc500000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000052', 'a0000000-0000-4000-8000-000000000001', 'Forklift Charger Trip — Hams Hall',              'Charging station OCPP fault. Replaced module.',       'completed', 'high',   '2026-04-13T03:00:00Z', '2026-04-13T05:00:00Z', true,  'p2', 'reactive', '2026-04-13T02:30:00Z'),
  ('cc500000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Listed Window Repair — White Hart Cambridge',    'Heritage-spec leaded glazing panel replaced.',        'completed', 'low',    '2026-04-14T10:00:00Z', '2026-04-14T15:00:00Z', false, 'p4', 'reactive', '2026-04-13T16:00:00Z'),
  ('cc500000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000001', 'Theatre AHU Filter — Aldridge Bristol',          'Differential pressure alarm — filters changed.',      'completed', 'medium', '2026-04-15T05:00:00Z', '2026-04-15T07:30:00Z', false, 'p3', 'planned',  '2026-04-14T16:00:00Z'),
  ('cc500000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000048', 'a0000000-0000-4000-8000-000000000001', 'Roof Leak — St David''s Cardiff',                'Trade-time roof leak in mall — temporary patch.',     'completed', 'high',   '2026-04-15T19:00:00Z', '2026-04-15T22:00:00Z', true,  'p2', 'reactive', '2026-04-15T18:30:00Z'),
  ('cc500000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000001', 'Lobby Lighting Failure — Brindleyplace',         'Driver replaced on lobby chandelier circuit.',        'completed', 'medium', '2026-04-17T17:00:00Z', '2026-04-17T19:30:00Z', false, 'p3', 'reactive', '2026-04-17T16:30:00Z'),
  ('cc500000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'Beer Line Steam Burst — The George Leeds',       'Cellar steam line failure — re-routed and lagged.',   'completed', 'urgent', '2026-04-18T16:00:00Z', '2026-04-18T19:30:00Z', true,  'p1', 'reactive', '2026-04-18T15:30:00Z'),
  ('cc500000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000054', 'a0000000-0000-4000-8000-000000000001', 'Generator Auto-Start Fail — Daventry DIRFT',     'Battery failed start cycle — replaced. Tested OK.',    'completed', 'high',   '2026-04-20T09:00:00Z', '2026-04-20T11:30:00Z', false, 'p2', 'planned',  '2026-04-19T16:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. Engineer Assignments — link engineers to their jobs
-- ---------------------------------------------------------------------------
-- Use deterministic UUID derived from job+engineer pair
INSERT INTO engineer_assignments (id, job_id, engineer_id, assigned_at)
SELECT
  uuid_in(md5('assign-' || j.id::text)::cstring),
  j.id,
  CASE
    WHEN j.title ILIKE '%boiler%'   OR j.title ILIKE '%gas%'      THEN 'b0000000-0000-4000-8000-000000000005'
    WHEN j.title ILIKE '%lift%'     OR j.title ILIKE '%escalator%'THEN 'b0000000-0000-4000-8000-000000000004'
    WHEN j.title ILIKE '%fire%'     OR j.title ILIKE '%alarm%'    THEN 'b0000000-0000-4000-8000-000000000004'
    WHEN j.title ILIKE '%cold%'     OR j.title ILIKE '%refrig%'   OR j.title ILIKE '%f-gas%' OR j.title ILIKE '%cellar%' THEN 'b0000000-0000-4000-8000-000000000006'
    WHEN j.title ILIKE '%water%'    OR j.title ILIKE '%legionella%' OR j.title ILIKE '%toilet%' OR j.title ILIKE '%pump%' OR j.title ILIKE '%cooling tower%' THEN 'b0000000-0000-4000-8000-000000000007'
    ELSE 'b0000000-0000-4000-8000-000000000003'
  END,
  COALESCE(j.scheduled_date, j.created_at)
FROM jobs j
WHERE j.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 13. Service Reports — for completed jobs (sample)
-- ---------------------------------------------------------------------------
INSERT INTO service_reports (id, job_id, organisation_id, engineer_id, notes, outcome, submitted_at)
SELECT
  uuid_in(md5('report-' || j.id::text)::cstring),
  j.id, j.organisation_id,
  'b0000000-0000-4000-8000-000000000003',
  'Works completed in line with scope. No additional defects identified. Cert issued via portal.',
  'pass',
  j.completed_date
FROM jobs j
WHERE j.organisation_id = 'a0000000-0000-4000-8000-000000000001'
  AND j.status = 'completed'
  AND j.completed_date IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 14. Quotes — 8 across statuses
-- ---------------------------------------------------------------------------
INSERT INTO quotes (id, organisation_id, client_id, property_id, quote_number, status, subtotal, tax, total, valid_until, notes, created_at) VALUES
  ('ff000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'QT-2026-0101', 'approved',  4250.00,  850.00,  5100.00, '2026-05-15', 'Cellar cooling refurb — replace evaporator + recommission.',                  '2026-04-05T10:00:00Z'),
  ('ff000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000021', 'QT-2026-0102', 'approved', 12500.00, 2500.00, 15000.00, '2026-05-20', 'Edgbaston theatre AHU3 — full refurbishment programme.',                      '2026-04-06T11:00:00Z'),
  ('ff000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000026', 'QT-2026-0103', 'sent',      6800.00, 1360.00,  8160.00, '2026-05-25', 'BMS sensor upgrade pack — 12 zones.',                                          '2026-04-08T09:30:00Z'),
  ('ff000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000041', 'QT-2026-0104', 'sent',      3450.00,  690.00,  4140.00, '2026-05-30', 'Mall AHU coil clean + chemistry.',                                            '2026-04-10T14:00:00Z'),
  ('ff000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000050', 'QT-2026-0105', 'draft',     8900.00, 1780.00, 10680.00, '2026-06-01', 'Cold-store door seal pack + HVAC tuning across DC1.',                          '2026-04-15T15:00:00Z'),
  ('ff000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000019', 'QT-2026-0106', 'draft',      550.00,  110.00,   660.00, '2026-06-05', 'Asbestos re-survey — Birmingham Northfield.',                                  '2026-04-17T10:00:00Z'),
  ('ff000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000028', 'QT-2026-0107', 'rejected',  2100.00,  420.00,  2520.00, '2026-04-15', 'BMS sensor replacement — quoted but landlord covered.',                        '2026-04-08T16:00:00Z'),
  ('ff000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000042', 'QT-2026-0108', 'approved', 14750.00, 2950.00, 17700.00, '2026-06-15', 'Westfield mall — three-stage CT clean + bio dose programme.',                  '2026-04-12T10:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 15. Invoices — 12 (paid / outstanding / overdue / draft)
-- ---------------------------------------------------------------------------
INSERT INTO invoices (id, organisation_id, client_id, quote_id, property_id, invoice_number, status, subtotal, tax, total, due_date, paid_date, created_at) VALUES
  -- Paid ×4
  ('11000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'ff000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'INV-2026-0201', 'paid',         4250.00,  850.00,  5100.00, '2026-04-20', '2026-04-18', '2026-03-21T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'ff000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000021', 'INV-2026-0202', 'paid',        12500.00, 2500.00, 15000.00, '2026-04-22', '2026-04-21', '2026-03-22T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'ff000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000042', 'INV-2026-0203', 'paid',        14750.00, 2950.00, 17700.00, '2026-04-25', '2026-04-23', '2026-03-25T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', NULL,                                  'd0000000-0000-4000-8000-000000000050', 'INV-2026-0204', 'paid',         2150.00,  430.00,  2580.00, '2026-04-15', '2026-04-12', '2026-03-15T09:00:00Z'),
  -- Sent / outstanding ×2
  ('11000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', NULL,                                  'd0000000-0000-4000-8000-000000000026', 'INV-2026-0205', 'sent',         3850.00,  770.00,  4620.00, '2026-05-10', NULL,         '2026-04-10T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', NULL,                                  'd0000000-0000-4000-8000-000000000014', 'INV-2026-0206', 'sent',          950.00,  190.00,  1140.00, '2026-05-12', NULL,         '2026-04-12T09:00:00Z'),
  -- Overdue ×2 (>30 days)
  ('11000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', NULL,                                  'd0000000-0000-4000-8000-000000000028', 'INV-2026-0207', 'overdue',      6480.00, 1296.00,  7776.00, '2026-03-15', NULL,         '2026-02-15T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', NULL,                                  'd0000000-0000-4000-8000-000000000043', 'INV-2026-0208', 'overdue',      2240.00,  448.00,  2688.00, '2026-03-20', NULL,         '2026-02-20T09:00:00Z'),
  -- Draft ×4
  ('11000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', NULL,                                  'd0000000-0000-4000-8000-000000000005', 'INV-2026-0209', 'draft',        1200.00,  240.00,  1440.00, '2026-05-31', NULL,         '2026-04-22T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', NULL,                                  'd0000000-0000-4000-8000-000000000023', 'INV-2026-0210', 'draft',         580.00,  116.00,   696.00, '2026-05-31', NULL,         '2026-04-22T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', NULL,                                  'd0000000-0000-4000-8000-000000000054', 'INV-2026-0211', 'draft',         985.00,  197.00,  1182.00, '2026-05-31', NULL,         '2026-04-22T09:00:00Z'),
  ('11000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', NULL,                                  'd0000000-0000-4000-8000-000000000033', 'INV-2026-0212', 'draft',        2750.00,  550.00,  3300.00, '2026-05-31', NULL,         '2026-04-22T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 16. Actions / Defects — 15
-- ---------------------------------------------------------------------------
INSERT INTO actions (id, organisation_id, property_id, asset_id, title, description, status, priority, due_date, assigned_to, created_at) VALUES
  ('44000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', NULL, 'Replace cellar evap coil',                'Coil leak — evaporator replacement scoped.',                            'open',         'high',   '2026-05-02', 'b0000000-0000-4000-8000-000000000005', '2026-04-25T07:30:00Z'),
  ('44000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000023', NULL, 'Calibrate vaccine fridge sensor',          'New sensor fitted — calibration cert pending.',                          'in_progress', 'high',   '2026-04-28', 'b0000000-0000-4000-8000-000000000005', '2026-04-22T08:00:00Z'),
  ('44000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000028', NULL, 'BMS sensor replacement (L4 VAV)',          'Awaiting parts (5 working day lead).',                                   'open',         'medium', '2026-04-30', 'b0000000-0000-4000-8000-000000000004', '2026-04-19T17:30:00Z'),
  ('44000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000041', NULL, 'Trafford Mall — escalator step gap',       'Recurring fault — recommend full overhaul.',                              'open',         'high',   '2026-05-05', 'b0000000-0000-4000-8000-000000000004', '2026-04-12T15:30:00Z'),
  ('44000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000017', NULL, 'PAT testing — Cheltenham reschedule',       'Half-term inset day caused failed access.',                              'open',         'medium', '2026-05-04', 'b0000000-0000-4000-8000-000000000002', '2026-04-20T09:00:00Z'),
  ('44000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000045', NULL, 'Cabot Circus glass roof — wind reschedule', 'Awaiting weather window for MEWP works.',                               'open',         'low',    '2026-05-10', 'b0000000-0000-4000-8000-000000000002', '2026-04-18T10:00:00Z'),
  ('44000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000037', NULL, 'Cornmarket vehicle permit',                 'Council enforcement requires permit ahead of next visit.',              'open',         'medium', '2026-05-08', 'b0000000-0000-4000-8000-000000000002', '2026-04-17T11:30:00Z'),
  ('44000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000051', NULL, 'F-Gas leak test — Trafford DC2',           'Recommend full plant leak test after compressor alarm.',                'in_progress', 'high',   '2026-04-29', 'b0000000-0000-4000-8000-000000000006', '2026-04-16T05:30:00Z'),
  ('44000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', NULL, 'Greyhound Bristol — refuse area lock',     'New lock issued — keys to scheduler.',                                  'completed',   'low',    '2026-04-15', 'b0000000-0000-4000-8000-000000000002', '2026-04-08T10:00:00Z'),
  ('44000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000010', NULL, 'George Leeds — beer-line steam re-route',  'Permanent fix to be quoted — temp re-route in place.',                  'open',         'urgent', '2026-04-30', 'b0000000-0000-4000-8000-000000000005', '2026-04-18T19:30:00Z'),
  ('44000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000031', NULL, 'Brindleyplace lobby chandelier driver',     'Replaced — review for spare to be held on site.',                        'completed',   'medium', '2026-04-22', 'b0000000-0000-4000-8000-000000000004', '2026-04-17T17:00:00Z'),
  ('44000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000048', NULL, 'St David''s roof leak — permanent fix',     'Temp patch in place — roofer scheduled for permanent fix.',             'open',         'high',   '2026-05-06', 'b0000000-0000-4000-8000-000000000007', '2026-04-15T22:00:00Z'),
  ('44000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000054', NULL, 'Daventry generator battery spare',          'Hold spare battery in van for next visit.',                              'completed',   'medium', '2026-04-25', 'b0000000-0000-4000-8000-000000000004', '2026-04-20T11:30:00Z'),
  ('44000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000050', NULL, 'Cross Green DC1 — door seal kit refresh',   'Order door seal kit — stock all four bays.',                             'in_progress', 'medium', '2026-05-03', 'b0000000-0000-4000-8000-000000000002', '2026-04-25T06:30:00Z'),
  ('44000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000026', NULL, 'Finsbury Avenue — VAV review',              'Tenant comfort report on L7 — review BMS strategy.',                    'in_progress', 'medium', '2026-05-01', 'b0000000-0000-4000-8000-000000000004', '2026-04-25T10:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 17. Documents — 10 representative
-- ---------------------------------------------------------------------------
INSERT INTO documents (id, organisation_id, property_id, name, file_url, mime_type, document_type, expiry_date, uploaded_by, uploaded_at) VALUES
  ('77000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000021', 'EICR_2024_AldgridgeEdgbaston.pdf',                'storage://documents/77000001.pdf', 'application/pdf', 'eicr',          '2029-05-10', 'b0000000-0000-4000-8000-000000000001', '2024-05-10T09:00:00Z'),
  ('77000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'GasSafetyCertificate_CrownAnchor_2025.pdf',       'storage://documents/77000002.pdf', 'application/pdf', 'gas_safety',    '2026-09-15', 'b0000000-0000-4000-8000-000000000005', '2025-09-15T15:00:00Z'),
  ('77000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000026', 'FRA_FinsburyAvenueOne_2025.pdf',                  'storage://documents/77000003.pdf', 'application/pdf', 'fra',           '2026-11-01', 'b0000000-0000-4000-8000-000000000001', '2025-11-01T11:00:00Z'),
  ('77000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000041', 'LegionellaRA_TraffordPlaza.pdf',                  'storage://documents/77000004.pdf', 'application/pdf', 'water_safety',  '2026-04-25', 'b0000000-0000-4000-8000-000000000007', '2024-04-25T13:00:00Z'),
  ('77000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000050', 'F-GasLeakLog_CrossGreenDC1.pdf',                   'storage://documents/77000005.pdf', 'application/pdf', 'fgas',          '2026-12-31', 'b0000000-0000-4000-8000-000000000006', '2025-12-31T16:00:00Z'),
  ('77000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'AsbestosRegister_WhiteHart_2024.pdf',             'storage://documents/77000006.pdf', 'application/pdf', 'asbestos',      NULL,         'b0000000-0000-4000-8000-000000000001', '2024-03-12T10:00:00Z'),
  ('77000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000022', 'PATTesting_AldgridgeLondon_2025.pdf',             'storage://documents/77000007.pdf', 'application/pdf', 'pat',           '2026-04-30', 'b0000000-0000-4000-8000-000000000004', '2025-04-30T13:00:00Z'),
  ('77000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000033', 'BMS_SequenceOfOps_WellingtonPlace.pdf',           'storage://documents/77000008.pdf', 'application/pdf', 'om_manual',     NULL,         'b0000000-0000-4000-8000-000000000001', '2024-09-01T15:30:00Z'),
  ('77000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000044', 'LiftLOLER_RiversideBullring.pdf',                 'storage://documents/77000009.pdf', 'application/pdf', 'loler',         '2026-06-01', 'b0000000-0000-4000-8000-000000000004', '2025-12-01T14:00:00Z'),
  ('77000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000013', 'PortableAppliance_LambethHill_2025.pdf',          'storage://documents/77000010.pdf', 'application/pdf', 'pat',           '2026-04-30', 'b0000000-0000-4000-8000-000000000004', '2025-04-30T11:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 18. Contracts — one per client + one extra
-- ---------------------------------------------------------------------------
INSERT INTO contracts (id, organisation_id, client_id, title, start_date, end_date, value, services_included, frequency_commitment, sla_notes, status, created_at) VALUES
  ('55000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Greene King PPM + Reactive — 12 sites',    '2025-04-01', '2026-03-31', 184500.00, 'PPM, gas, kitchen extract, reactive',           'PPM monthly visits + 24/7 reactive',           'Cat 1 response 2h / Cat 2 4h / Cat 3 24h',     'active',  '2025-03-15T09:00:00Z'),
  ('55000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Mercer & Hole Schools — Term-time SLA',     '2025-09-01', '2026-08-31',  92000.00, 'Compliance, PPM, term-time call-outs',          'Termly compliance + holiday PPM',              'Holiday weeks priority. DBS engineers only.',  'active',  '2025-08-20T10:00:00Z'),
  ('55000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Aldridge Healthcare — Critical Estate SLA','2025-04-01', '2027-03-31', 425000.00, 'Critical engineering — full PPM + reactive',    'Continuous coverage incl. theatres / fridges', 'P1 1h / P2 2h / P3 8h. 24/7 hot spare.',      'active',  '2025-03-10T11:00:00Z'),
  ('55000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Fitzgerald Estates — Multi-site PPM',       '2025-01-01', '2026-12-31', 312000.00, 'Statutory + PPM + minor works to £5k',           'Quarterly PPM with monthly statutory checks',   'P1 4h / P2 8h / P3 5d',                        'active',  '2024-12-01T14:00:00Z'),
  ('55000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'Riverside Retail — Trading-hour SLA',       '2025-04-01', '2026-03-31', 248000.00, 'Public area PPM + reactive (trading hours)',     'Out-of-hours preferred for plant works',        'Public area P1 1h / P2 4h',                    'active',  '2025-03-12T16:00:00Z'),
  ('55000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Newman Logistics — 24/7 Cold-chain Cover',  '2025-06-01', '2027-05-31', 376000.00, 'Refrigeration, cold-store, generator, F-Gas',    '24/7 365 days incl. bank hols',                'P1 1h / cold-chain breach triggers escalation','active',  '2025-05-15T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 19. Knowledge Base — 5 articles
-- ---------------------------------------------------------------------------
INSERT INTO kb_articles (id, organisation_id, title, content, category, tags, author_id, author_name, is_published, created_at) VALUES
  ('88000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'How to schedule a PPM visit',
   E'Step 1: Open Maintenance > Plans.\nStep 2: Filter by client or property.\nStep 3: Click "Generate Job" on a plan that is due.\nStep 4: Pick a time-window and assign an engineer.\nTip: Use the bulk action bar to schedule multiple plans at once.',
   'Operations', ARRAY['ppm','scheduling'], 'b0000000-0000-4000-8000-000000000001', 'Sarah Mitchell', true, '2025-02-15T10:00:00Z'),
  ('88000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Reading a compliance dashboard',
   E'Compliance status colours follow the Haumea design system: green = compliant, amber = due_soon, red = overdue, dark red = non_compliant.\nThe dashboard ages items relative to today; click any chip to drill into the underlying property.',
   'Compliance', ARRAY['compliance','dashboard','status'], 'b0000000-0000-4000-8000-000000000001', 'Sarah Mitchell', true, '2025-02-20T10:00:00Z'),
  ('88000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   'Raising a call-out from the client portal',
   E'1. Log in to the portal and select the affected site.\n2. Click "Report a problem" — choose a category.\n3. Add a brief description and (optionally) a photo.\nA P1/P2 call-out auto-pages the on-call engineer; P3 enters the dispatch queue.',
   'Portal', ARRAY['portal','callout','client'], 'b0000000-0000-4000-8000-000000000002', 'James Patel', true, '2025-03-05T11:00:00Z'),
  ('88000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   'Engineer mobile field guide',
   E'On the field engineer view (/dashboard/field):\n- Today: your scheduled jobs.\n- Tap a job to check in (GPS captured).\n- Take before/after photos directly on-device.\n- Tap "Complete" to upload a service report and capture customer signature.',
   'Field', ARRAY['mobile','field','engineer'], 'b0000000-0000-4000-8000-000000000003', 'Emma Brooks', true, '2025-03-10T11:00:00Z'),
  ('88000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   'Setting up auto-job generation',
   E'Maintenance plans can auto-spawn jobs in fixed or rolling mode.\nFixed: a calendar cadence (e.g. 1st Mon of each month).\nRolling: schedule N days after last completion.\nEnable in Settings > Maintenance > Auto-generate.',
   'Operations', ARRAY['ppm','automation'], 'b0000000-0000-4000-8000-000000000001', 'Sarah Mitchell', true, '2025-03-15T09:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 20. Notifications — 8 recent for the demo user (Sarah Mitchell)
-- ---------------------------------------------------------------------------
INSERT INTO notifications (id, user_id, organisation_id, title, message, read, notification_type, link, created_at) VALUES
  ('33000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Reactive call-out: P1',          'Beer Cellar Cooling Failure at Crown & Anchor (P1).',                  false, 'callout',          '/dashboard/jobs/cc200000-0000-4000-8000-000000000001', '2026-04-25T07:05:00Z'),
  ('33000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Compliance overdue',             'Legionella RA at Crown & Anchor is now overdue.',                       false, 'compliance_overdue','/dashboard/compliance',                                 '2026-04-25T05:00:00Z'),
  ('33000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Quote sent',                     'QT-2026-0103 sent to Fitzgerald Office Estates (£8,160).',              false, 'quote_sent',       '/dashboard/quotes/ff000000-0000-4000-8000-000000000003',  '2026-04-08T09:30:00Z'),
  ('33000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Invoice paid',                   'Aldridge Healthcare paid INV-2026-0202 (£15,000).',                     true,  'invoice_paid',     '/dashboard/invoices/11000000-0000-4000-8000-000000000002', '2026-04-21T16:00:00Z'),
  ('33000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Invoice overdue',                'INV-2026-0207 (Fitzgerald) is 41 days overdue.',                        false, 'invoice_overdue',  '/dashboard/invoices/11000000-0000-4000-8000-000000000007', '2026-04-25T08:00:00Z'),
  ('33000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Job completed',                  'Generator Auto-Start Fail at Daventry DIRFT — completed.',              true,  'job_completed',    '/dashboard/jobs/cc500000-0000-4000-8000-000000000012',  '2026-04-20T11:30:00Z'),
  ('33000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'New action assigned',            'BMS sensor replacement assigned to Oliver Hughes.',                     true,  'action_assigned',  '/dashboard/actions/44000000-0000-4000-8000-000000000003', '2026-04-19T17:30:00Z'),
  ('33000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Document uploaded',              'F-GasLeakLog_CrossGreenDC1.pdf uploaded (Newman Logistics).',           true,  'document_uploaded','/dashboard/documents',                                  '2025-12-31T16:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 21. Timeline Events — 30+ recent
-- ---------------------------------------------------------------------------
-- Generate one timeline event per job + a handful of other event types.
INSERT INTO timeline_events (id, organisation_id, property_id, client_id, job_id, event_type, description, user_id, created_at)
SELECT
  uuid_in(md5('tl-job-' || j.id::text)::cstring),
  j.organisation_id, j.property_id,
  (SELECT client_id FROM properties WHERE id = j.property_id),
  j.id,
  CASE j.status
    WHEN 'completed'           THEN 'job_completed'
    WHEN 'in_progress'         THEN 'job_started'
    WHEN 'failed_access'       THEN 'job_failed_access'
    WHEN 'follow_up_required'  THEN 'job_follow_up'
    ELSE 'job_created'
  END,
  j.title,
  'b0000000-0000-4000-8000-000000000002',
  COALESCE(j.completed_date, j.scheduled_date, j.created_at)
FROM jobs j
WHERE j.organisation_id = 'a0000000-0000-4000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- A handful of non-job events
INSERT INTO timeline_events (id, organisation_id, property_id, client_id, event_type, description, user_id, created_at) VALUES
  ('22100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', NULL, 'c0000000-0000-4000-8000-000000000001', 'client_created',         'Client "Greene King Pubs Ltd" was onboarded.',                      'b0000000-0000-4000-8000-000000000001', '2025-01-12T10:00:00Z'),
  ('22100000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', NULL, 'c0000000-0000-4000-8000-000000000003', 'contract_signed',         'Aldridge Healthcare signed Critical Estate SLA (£425k).',           'b0000000-0000-4000-8000-000000000001', '2025-03-10T11:00:00Z'),
  ('22100000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'compliance_overdue',     'Legionella RA at Crown & Anchor is overdue.',                       NULL, '2026-04-25T00:01:00Z'),
  ('22100000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000003', 'quote_approved',          'Edgbaston theatre AHU3 refurb (QT-2026-0102) approved (£15,000).',  'b0000000-0000-4000-8000-000000000001', '2026-04-07T11:00:00Z'),
  ('22100000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-000000000003', 'invoice_paid',            'INV-2026-0202 paid (£15,000) by Aldridge Healthcare.',              'b0000000-0000-4000-8000-000000000001', '2026-04-21T16:00:00Z'),
  ('22100000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', NULL, NULL,                                  'engineer_added',          'Engineer Callum Reid added to the dispatch pool.',                   'b0000000-0000-4000-8000-000000000001', '2025-01-12T09:30:00Z'),
  ('22100000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000050', 'c0000000-0000-4000-8000-000000000006', 'document_uploaded',       'F-Gas leak log uploaded for Cross Green DC1.',                      'b0000000-0000-4000-8000-000000000006', '2025-12-31T16:00:00Z'),
  ('22100000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000041', 'c0000000-0000-4000-8000-000000000005', 'action_created',          'New action raised: Trafford Mall escalator step gap.',              'b0000000-0000-4000-8000-000000000002', '2026-04-12T15:30:00Z')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =============================================================================
-- Done. Northwind demo seed loaded successfully.
-- =============================================================================
