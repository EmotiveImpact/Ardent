-- Seed organisation and link user
INSERT INTO organisations (name, slug) VALUES ('Haumea', 'haumea');

UPDATE profiles SET
  organisation_id = (SELECT id FROM organisations WHERE slug = 'haumea'),
  role = 'org_admin',
  full_name = 'Augustus Edem'
WHERE id = '24df9e59-f612-4040-8d4c-48616bbdd72c';
