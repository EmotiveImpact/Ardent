-- Fix: UPSERT profile for the org admin user
-- The previous seed used UPDATE which silently fails if the row doesn't exist

INSERT INTO profiles (id, email, full_name, role, organisation_id)
VALUES (
  '24df9e59-f612-4040-8d4c-48616bbdd72c',
  'emotiveimpact@gmail.com',
  'Augustus Edem',
  'org_admin',
  (SELECT id FROM organisations WHERE slug = 'haumea')
)
ON CONFLICT (id) DO UPDATE SET
  organisation_id = (SELECT id FROM organisations WHERE slug = 'haumea'),
  role = 'org_admin',
  full_name = 'Augustus Edem',
  email = 'emotiveimpact@gmail.com';
