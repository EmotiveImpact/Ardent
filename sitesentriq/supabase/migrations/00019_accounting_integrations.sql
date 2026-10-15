-- ============================================================
-- Migration 00019: Accounting Integrations (Xero + QuickBooks)
-- Adds: xero_connections, quickbooks_connections,
--        invoices ALTER (accounting fields),
--        accounting_sync_log
-- ============================================================

-- ── 1. Xero connections ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS xero_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
  xero_tenant_id text NOT NULL,
  xero_tenant_name text,
  refresh_token text NOT NULL,
  access_token text,
  expires_at timestamptz,
  scopes text,
  auto_push_on_sent boolean DEFAULT false,
  default_tax_rate text,
  default_account_code text,
  connected_by_user_id uuid REFERENCES auth.users(id),
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xero_connections_org ON xero_connections(organisation_id);

ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;

-- Org members can read; only service role writes (Edge Function uses service key)
CREATE POLICY "xero_connections_select" ON xero_connections FOR SELECT
  USING (organisation_id = public.organisation_id());

-- ── 2. QuickBooks connections ───────────────────────────────

CREATE TABLE IF NOT EXISTS quickbooks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
  quickbooks_realm_id text NOT NULL,
  quickbooks_company_name text,
  refresh_token text NOT NULL,
  access_token text,
  expires_at timestamptz,
  scopes text,
  auto_push_on_sent boolean DEFAULT false,
  default_tax_code_ref text,
  default_income_account_ref text,
  connected_by_user_id uuid REFERENCES auth.users(id),
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quickbooks_connections_org ON quickbooks_connections(organisation_id);

ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quickbooks_connections_select" ON quickbooks_connections FOR SELECT
  USING (organisation_id = public.organisation_id());

-- ── 3. Invoices ALTER — accounting fields ───────────────────

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_invoice_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_invoice_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_status text DEFAULT 'none';
-- accounting_status values: 'none' | 'pushed' | 'error' | 'disconnected'
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_provider text;
-- accounting_provider values: 'xero' | 'quickbooks' | null
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_pushed_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_error text;

CREATE INDEX IF NOT EXISTS idx_invoices_xero_id ON invoices(xero_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_qb_id ON invoices(quickbooks_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_acct_status ON invoices(accounting_status);

-- ── 4. Sync log ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounting_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  provider text NOT NULL, -- 'xero' | 'quickbooks'
  action text NOT NULL,   -- 'connect' | 'disconnect' | 'push_invoice' | 'refresh_token'
  status text NOT NULL,   -- 'success' | 'error'
  error text,
  external_id text,       -- Xero invoice id / QuickBooks invoice id
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_sync_org ON accounting_sync_log(organisation_id);
CREATE INDEX IF NOT EXISTS idx_acct_sync_invoice ON accounting_sync_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_acct_sync_created ON accounting_sync_log(created_at DESC);

ALTER TABLE accounting_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_sync_log_select" ON accounting_sync_log FOR SELECT
  USING (organisation_id = public.organisation_id());

-- Note: writes to all 3 tables go through Edge Functions using the service role key,
-- which bypasses RLS. No INSERT/UPDATE/DELETE policies are defined for clients on purpose.
