-- ============================================================
-- Migration 00029: Stock / Parts Tracking (Wave 9 / Builder 9D)
-- Adds:
--   - stock_items        (parts catalogue per organisation)
--   - stock_movements    (audit trail: receipt / usage / adjustment / transfer / write_off)
--   - low_stock_view     (read-only convenience view of items at/below reorder point)
--   - seed_default_stock_items(org_id)  — opt-in seed of generic items
--
-- Triggers:
--   - apply_stock_movement       — adjusts stock_items.current_qty when a movement is inserted
--   - notify_low_stock           — fires a notification when an item drops to/below reorder point
--
-- RLS:
--   - org members can read their org's stock + movements
--   - engineers / scheduler / org_admin / super_admin can insert movements
--   - org_admin / super_admin can manage stock items
-- ============================================================

-- ── 1. stock_items table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  sku                      text,
  name                     text NOT NULL,
  category                 text NOT NULL DEFAULT 'other',
  -- expected categories: filter, gasket, valve, sensor, lamp, fuse, other
  description              text,
  unit                     text NOT NULL DEFAULT 'each',
  -- expected: each, metres, litres
  unit_cost                numeric(12, 2) NOT NULL DEFAULT 0,
  supplier_name            text,
  supplier_part_number     text,
  reorder_point            integer NOT NULL DEFAULT 5,
  reorder_qty              integer NOT NULL DEFAULT 10,
  current_qty              integer NOT NULL DEFAULT 0,
  location                 text,
  notes                    text,
  image_url                text,
  archived                 boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- SKU is unique per org for non-archived items (allows soft-deleted records to share an SKU).
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_org_sku_active
  ON stock_items (organisation_id, sku)
  WHERE archived = false AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_items_org_name
  ON stock_items (organisation_id, name);

CREATE INDEX IF NOT EXISTS idx_stock_items_org_category
  ON stock_items (organisation_id, category);

-- ── 2. stock_movements table ──────────────────────────────

CREATE TABLE IF NOT EXISTS stock_movements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  stock_item_id            uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  movement_type            text NOT NULL
                             CHECK (movement_type IN ('receipt','usage','adjustment','transfer','write_off')),
  quantity                 integer NOT NULL,
  -- positive for in (receipt / positive adjustment), negative for out
  -- (usage / write_off / negative adjustment / outbound transfer)
  unit_cost_at_time        numeric(12, 2),
  related_job_id           uuid REFERENCES jobs(id) ON DELETE SET NULL,
  related_engineer_id      uuid REFERENCES engineers(id) ON DELETE SET NULL,
  related_purchase_order   text,
  reason                   text,
  performed_by_user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  performed_at             timestamptz NOT NULL DEFAULT now(),
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_performed
  ON stock_movements (stock_item_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_performed
  ON stock_movements (organisation_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_job
  ON stock_movements (related_job_id)
  WHERE related_job_id IS NOT NULL;

-- ── 3. Low-stock convenience view ─────────────────────────

CREATE OR REPLACE VIEW low_stock_view AS
  SELECT
    id,
    organisation_id,
    sku,
    name,
    category,
    current_qty,
    reorder_point,
    reorder_qty,
    unit,
    location,
    supplier_name
  FROM stock_items
  WHERE archived = false
    AND current_qty <= reorder_point;

-- ── 4. Triggers — keep current_qty in sync ────────────────

CREATE OR REPLACE FUNCTION public.touch_stock_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_items_touch ON stock_items;
CREATE TRIGGER stock_items_touch
  BEFORE UPDATE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_stock_updated_at();

-- Apply movement to stock_items.current_qty.
-- We trust the sign of `quantity` (caller writes negative for outbound), and
-- additionally clamp the resulting qty at zero so a stale/duplicate write
-- can't push a balance negative.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  new_qty integer;
  reorder integer;
  prev_qty integer;
  item_name text;
  org_id uuid;
BEGIN
  UPDATE stock_items
     SET current_qty = GREATEST(0, current_qty + NEW.quantity),
         updated_at  = now()
   WHERE id = NEW.stock_item_id
   RETURNING current_qty, reorder_point, name, organisation_id
        INTO new_qty, reorder, item_name, org_id;

  -- Capture the previous qty for the low-stock notification trigger.
  prev_qty := new_qty - NEW.quantity;

  -- Fire low-stock notification only when this movement crossed the threshold
  -- (avoid spamming when an already-low item gets used again).
  IF new_qty IS NOT NULL
     AND reorder IS NOT NULL
     AND new_qty <= reorder
     AND prev_qty > reorder THEN
    INSERT INTO notifications (
      user_id,
      organisation_id,
      notification_type,
      title,
      message,
      link_url,
      read
    )
    SELECT
      p.id,
      org_id,
      'compliance_due',  -- reuse existing in-app type until a stock_low type is added
      'Stock low: ' || item_name,
      item_name || ' is at ' || new_qty || ' (reorder point ' || reorder || ').',
      '/dashboard/stock/' || NEW.stock_item_id::text,
      false
    FROM profiles p
    WHERE p.organisation_id = org_id
      AND p.role IN ('org_admin','super_admin');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_apply ON stock_movements;
CREATE TRIGGER stock_movements_apply
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ── 5. RLS ────────────────────────────────────────────────

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- stock_items — org members read; org_admins / super_admins manage.
CREATE POLICY "stock_items_select"
  ON stock_items FOR SELECT
  USING (organisation_id = public.organisation_id());

CREATE POLICY "stock_items_insert"
  ON stock_items FOR INSERT
  WITH CHECK (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin')
    )
  );

CREATE POLICY "stock_items_update"
  ON stock_items FOR UPDATE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin')
    )
  )
  WITH CHECK (organisation_id = public.organisation_id());

CREATE POLICY "stock_items_delete"
  ON stock_items FOR DELETE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin')
    )
  );

-- stock_movements — org members read; engineers/scheduler/org_admin/super_admin can insert.
CREATE POLICY "stock_movements_select"
  ON stock_movements FOR SELECT
  USING (organisation_id = public.organisation_id());

CREATE POLICY "stock_movements_insert"
  ON stock_movements FOR INSERT
  WITH CHECK (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin','scheduler','engineer')
    )
  );

-- Movements are append-only; no UPDATE/DELETE policies (admins can DELETE via service role if ever needed).

-- ── 6. seed_default_stock_items(org_id) helper ─────────────
-- NOT auto-invoked. Call from the dashboard / a seed script when an
-- organisation explicitly wants the starter catalogue.

CREATE OR REPLACE FUNCTION public.seed_default_stock_items(p_org_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  inserted integer;
BEGIN
  WITH ins AS (
    INSERT INTO stock_items
      (organisation_id, sku, name, category, description, unit, unit_cost,
       supplier_name, reorder_point, reorder_qty, current_qty, location)
    VALUES
      (p_org_id, 'CU-EL-12',  '1/2" copper compression elbow',          'valve',   '15mm copper compression elbow',                  'each',   2.40, 'Plumb Center',     10, 25, 0, 'Main warehouse — Shelf B3'),
      (p_org_id, 'CU-EL-22',  '3/4" copper compression elbow',          'valve',   '22mm copper compression elbow',                  'each',   3.60, 'Plumb Center',     10, 25, 0, 'Main warehouse — Shelf B3'),
      (p_org_id, 'SD-BAT-9V', 'Smoke detector battery — 9V',            'other',   'Long-life alkaline 9V for smoke alarms',         'each',   3.20, 'Toolstation',      24, 48, 0, 'Main warehouse — Shelf A1'),
      (p_org_id, 'T8-600',    'T8 fluorescent tube 600mm',              'lamp',    '18W cool white T8 600mm fluorescent',            'each',   4.10, 'Wholesaler Lighting', 12, 24, 0, 'Main warehouse — Shelf C2'),
      (p_org_id, 'LED-GU10',  'GU10 LED lamp 5W warm white',            'lamp',    '5W 3000K dimmable GU10 LED',                     'each',   2.80, 'Wholesaler Lighting', 20, 40, 0, 'Main warehouse — Shelf C1'),
      (p_org_id, 'FIL-AC-20', 'AC return air filter 20x20',             'filter',  'Pleated 20x20x1 MERV 8',                         'each',   6.50, 'HVAC Direct',      8,  16, 0, 'Main warehouse — Shelf D4'),
      (p_org_id, 'WSH-TAP-1', 'Tap washer set (assorted)',              'gasket',  'Rubber tap washer assortment pack',              'each',   1.80, 'Toolstation',      15, 30, 0, 'Main warehouse — Shelf B1'),
      (p_org_id, 'FUSE-13A',  '13A plug fuse',                          'fuse',    'BS 1362 13A cartridge fuse',                     'each',   0.40, 'CEF',              50, 100,0, 'Main warehouse — Shelf E1'),
      (p_org_id, 'CO-DET-A',  'Carbon monoxide detector',               'sensor',  '10-year sealed CO alarm',                        'each',  18.00, 'Toolstation',      6,  12, 0, 'Main warehouse — Shelf A2'),
      (p_org_id, 'BRG-RAD-1', 'Radiator bleed key',                     'other',   'Brass radiator bleed key',                       'each',   1.20, 'Plumb Center',     15, 30, 0, 'Main warehouse — Shelf B2'),
      (p_org_id, 'DUCT-TAPE', 'Duct tape 50mm x 50m',                   'other',   'High-tack cloth duct tape',                      'each',   4.90, 'Toolstation',      10, 20, 0, 'Main warehouse — Shelf F1'),
      (p_org_id, 'PIR-OUT',   'PIR outdoor sensor 180°',                'sensor',  'Outdoor passive infrared 180° sensor',           'each',  14.50, 'CEF',              4,  8,  0, 'Main warehouse — Shelf C3')
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted FROM ins;
  RETURN inserted;
END;
$$;

-- ── 7. Storage bucket ─────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('stock-images', 'stock-images', false)
ON CONFLICT (id) DO NOTHING;
