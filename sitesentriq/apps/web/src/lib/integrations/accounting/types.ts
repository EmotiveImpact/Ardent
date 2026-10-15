// Shared types for accounting integrations (Xero, QuickBooks Online)
// Used by hooks, settings pages, and the shared status chip.

export type AccountingProvider = 'xero' | 'quickbooks'

// 'pushing' is the edge functions' in-flight idempotency claim (xero-/
// quickbooks-push-invoice). Normally transient; a stale claim (>10 min,
// crashed push) is re-claimable server-side and retryable from the UI.
export type AccountingStatus = 'none' | 'pushing' | 'pushed' | 'error' | 'disconnected'

export interface XeroConnection {
  id: string
  organisation_id: string
  xero_tenant_id: string
  xero_tenant_name: string | null
  expires_at: string | null
  scopes: string | null
  auto_push_on_sent: boolean
  default_tax_rate: string | null
  default_account_code: string | null
  connected_by_user_id: string | null
  connected_at: string
  last_synced_at: string | null
  disconnected_at: string | null
  created_at: string
}

export interface QuickBooksConnection {
  id: string
  organisation_id: string
  quickbooks_realm_id: string
  quickbooks_company_name: string | null
  expires_at: string | null
  scopes: string | null
  auto_push_on_sent: boolean
  default_tax_code_ref: string | null
  default_income_account_ref: string | null
  connected_by_user_id: string | null
  connected_at: string
  last_synced_at: string | null
  disconnected_at: string | null
  created_at: string
}

export interface AccountingSyncLogRow {
  id: string
  organisation_id: string
  invoice_id: string | null
  provider: AccountingProvider
  action: string
  status: 'success' | 'error'
  error: string | null
  external_id: string | null
  created_at: string
}

export interface InvoiceAccountingFields {
  xero_invoice_id?: string | null
  quickbooks_invoice_id?: string | null
  accounting_status?: AccountingStatus | null
  accounting_provider?: AccountingProvider | null
  accounting_pushed_at?: string | null
  accounting_error?: string | null
}
