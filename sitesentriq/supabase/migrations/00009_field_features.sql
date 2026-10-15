-- Field engineer features: signatures, GPS, job costing, recurring jobs, parts

-- Signatures on jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_signature_url text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS engineer_signature_url text;

-- GPS check-in/check-out
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkin_lat numeric;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkin_lng numeric;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkout_lat numeric;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkout_lng numeric;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkin_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS checkout_at timestamptz;

-- Recurring jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurring_frequency text
  CHECK (recurring_frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurring_parent_id uuid REFERENCES jobs(id);

-- Job costing
CREATE TABLE IF NOT EXISTS job_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  cost_type text NOT NULL CHECK (cost_type IN ('labour', 'materials', 'travel', 'other')),
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_costs_job_id ON job_costs(job_id);

-- RLS for job_costs
ALTER TABLE job_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_costs_select" ON job_costs FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "job_costs_insert" ON job_costs FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "job_costs_update" ON job_costs FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "job_costs_delete" ON job_costs FOR DELETE
  USING (organisation_id = public.organisation_id());

-- Parts inventory
CREATE TABLE IF NOT EXISTS parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  name text NOT NULL,
  sku text,
  unit_cost numeric NOT NULL DEFAULT 0,
  stock_level integer NOT NULL DEFAULT 0,
  reorder_threshold integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_organisation ON parts(organisation_id);
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_select" ON parts FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "parts_insert" ON parts FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "parts_update" ON parts FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "parts_delete" ON parts FOR DELETE
  USING (organisation_id = public.organisation_id());

-- Job-parts junction
CREATE TABLE IF NOT EXISTS job_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES parts(id),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_cost_at_use numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_parts_job ON job_parts(job_id);
ALTER TABLE job_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_parts_select" ON job_parts FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "job_parts_insert" ON job_parts FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "job_parts_update" ON job_parts FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "job_parts_delete" ON job_parts FOR DELETE
  USING (organisation_id = public.organisation_id());

-- Stripe on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_checkout_url text;
