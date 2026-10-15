// supabase/functions/quickbooks-push-invoice/index.ts
// Push a Facilities OS invoice to QuickBooks Online (US).
// Deploy with: supabase functions deploy quickbooks-push-invoice
//
// Body schema: { invoice_id: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const QB_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? ''
const QB_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? ''
const QB_ENV = (Deno.env.get('QUICKBOOKS_ENV') ?? 'production').toLowerCase()
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QB_API_BASE = QB_ENV === 'sandbox'
  ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
  : 'https://quickbooks.api.intuit.com/v3/company'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

interface QbConnRow {
  id: string
  organisation_id: string
  quickbooks_realm_id: string
  refresh_token: string
  access_token: string | null
  expires_at: string | null
  default_tax_code_ref: string | null
  default_income_account_ref: string | null
}

async function refreshIfNeeded(admin: SupabaseClient, conn: QbConnRow): Promise<string> {
  const now = Date.now()
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0
  if (conn.access_token && expiresAt > now + 60_000) return conn.access_token

  const basic = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
  })
  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`QuickBooks refresh failed: ${res.status} ${err}`)
  }
  const tok = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const newExpires = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  await admin
    .from('quickbooks_connections')
    .update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: newExpires,
    })
    .eq('organisation_id', conn.organisation_id)
  await admin.from('accounting_sync_log').insert({
    organisation_id: conn.organisation_id,
    provider: 'quickbooks',
    action: 'refresh_token',
    status: 'success',
  })
  return tok.access_token
}

async function findOrCreateQbCustomer(
  accessToken: string,
  realmId: string,
  client: { name: string; contact_email?: string | null },
): Promise<string> {
  // Query by DisplayName
  const escName = client.name.replace(/'/g, "\\'")
  const queryUrl = `${QB_API_BASE}/${realmId}/query?query=${encodeURIComponent(
    `select * from Customer where DisplayName = '${escName}'`,
  )}&minorversion=65`
  const qRes = await fetch(queryUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (qRes.ok) {
    const qJson = await qRes.json() as { QueryResponse?: { Customer?: Array<{ Id: string }> } }
    const found = qJson.QueryResponse?.Customer
    if (found && found.length > 0) return found[0].Id
  }

  // Create
  const createBody: Record<string, unknown> = {
    DisplayName: client.name,
  }
  if (client.contact_email) {
    createBody.PrimaryEmailAddr = { Address: client.contact_email }
  }
  const createUrl = `${QB_API_BASE}/${realmId}/customer?minorversion=65`
  const cRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  })
  if (!cRes.ok) {
    const err = await cRes.text()
    throw new Error(`QuickBooks customer create failed: ${cRes.status} ${err}`)
  }
  const cJson = await cRes.json() as { Customer?: { Id: string } }
  if (!cJson.Customer?.Id) throw new Error('QuickBooks customer create returned no Id')
  return cJson.Customer.Id
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    return jsonResponse({ error: 'QUICKBOOKS_NOT_CONFIGURED' }, 200)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return jsonResponse({ error: 'Unauthorised' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorised' }, 401)
  const userId = userData.user.id

  const { data: profile } = await admin
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile?.organisation_id) return jsonResponse({ error: 'No organisation' }, 400)
  const organisationId = profile.organisation_id as string
  // Pushing an invoice to the accounting system is a finance/admin action.
  if (!['org_admin', 'finance', 'super_admin'].includes(profile.role as string)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  let body: { invoice_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  const invoiceId = body.invoice_id
  if (!invoiceId) return jsonResponse({ error: 'Missing invoice_id' }, 400)

  const { data: conn } = await admin
    .from('quickbooks_connections')
    .select('*')
    .eq('organisation_id', organisationId)
    .is('disconnected_at', null)
    .maybeSingle()
  if (!conn) return jsonResponse({ error: 'QuickBooks not connected for this organisation' }, 400)

  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select('*, clients(name, contact_email), invoice_lines(*)')
    .eq('id', invoiceId)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (invErr || !invoice) return jsonResponse({ error: 'Invoice not found' }, 404)

  // Fast path: already pushed (read snapshot).
  if (invoice.quickbooks_invoice_id || invoice.accounting_status === 'pushed') {
    return jsonResponse({
      success: true,
      already_pushed: true,
      quickbooks_invoice_id: invoice.quickbooks_invoice_id ?? null,
    })
  }
  // Atomic idempotency claim — flip accounting_status to 'pushing' ONLY if it
  // isn't already pushed/in-flight (no QB id yet AND status not 'pushing').
  // QuickBooks doesn't enforce DocNumber uniqueness, so the old read-then-act
  // guard let two concurrent retries/double-clicks BOTH POST and create a second
  // invoice in QBO (double-billing). Row-level UPDATE serialises them: the loser
  // matches 0 rows and bails. A failed push resets status to 'error' (catch
  // below), so it can be retried.
  //
  // Stale-claim reclaim: a crash BETWEEN the claim and the catch used to wedge
  // the invoice at 'pushing' forever. A 'pushing' row whose updated_at
  // (trigger-maintained, freshened by the claim itself) is older than 10 min is
  // treated as abandoned and re-claimable. Still race-safe — a concurrent fresh
  // claim re-stamps updated_at, so the loser's WHERE matches 0 rows.
  // 30 min, not 10: only reclaim a 'pushing' claim once it's well past any
  // plausible in-flight push, so a merely-slow push isn't re-POSTed as a
  // duplicate invoice (QuickBooks doesn't enforce DocNumber uniqueness).
  const stalePushingBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: claimed } = await admin
    .from('invoices')
    .update({ accounting_status: 'pushing' })
    .eq('id', invoiceId)
    .eq('organisation_id', organisationId)
    .is('quickbooks_invoice_id', null)
    .or(`accounting_status.is.null,accounting_status.neq.pushing,updated_at.lt.${stalePushingBefore}`)
    .select('id')
  if (!claimed || claimed.length === 0) {
    return jsonResponse({
      success: true,
      already_pushed: true,
      quickbooks_invoice_id: invoice.quickbooks_invoice_id ?? null,
    })
  }

  type Line = { description: string; quantity: number; unit_price: number; total: number }
  const lines: Line[] = (invoice.invoice_lines as Line[] | null) ?? []
  const clientName = (invoice.clients as { name?: string } | null)?.name ?? 'Client'
  const clientEmail = (invoice.clients as { contact_email?: string } | null)?.contact_email ?? null

  void userId

  try {
    const accessToken = await refreshIfNeeded(admin, conn as QbConnRow)
    const customerId = await findOrCreateQbCustomer(
      accessToken,
      conn.quickbooks_realm_id,
      { name: clientName, contact_email: clientEmail },
    )

    // Map line items to QB SalesItemLineDetail
    const qbLines = lines.map((line) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: line.total,
      Description: line.description,
      SalesItemLineDetail: {
        Qty: line.quantity,
        UnitPrice: line.unit_price,
        ItemRef: { value: '1' }, // default service item; real impl would map item refs
        TaxCodeRef: conn.default_tax_code_ref ? { value: conn.default_tax_code_ref } : undefined,
      },
    }))

    const qbInvoiceBody: Record<string, unknown> = {
      CustomerRef: { value: customerId },
      Line: qbLines,
      DocNumber: invoice.invoice_number,
      TxnDate: new Date(invoice.created_at).toISOString().slice(0, 10),
    }
    if (invoice.due_date) qbInvoiceBody.DueDate = invoice.due_date

    const pushUrl = `${QB_API_BASE}/${conn.quickbooks_realm_id}/invoice?minorversion=65`
    const pushRes = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(qbInvoiceBody),
    })
    const pushJson = await pushRes.json()
    if (!pushRes.ok) {
      throw new Error(`QuickBooks push failed: ${pushRes.status} ${JSON.stringify(pushJson)}`)
    }

    const qbInvoiceId: string | null = pushJson.Invoice?.Id ?? null
    const pushedAt = new Date().toISOString()

    await admin
      .from('invoices')
      .update({
        quickbooks_invoice_id: qbInvoiceId,
        accounting_status: 'pushed',
        accounting_provider: 'quickbooks',
        accounting_pushed_at: pushedAt,
        accounting_error: null,
      })
      .eq('id', invoiceId)

    await admin
      .from('quickbooks_connections')
      .update({ last_synced_at: pushedAt })
      .eq('organisation_id', organisationId)

    await admin.from('accounting_sync_log').insert({
      organisation_id: organisationId,
      invoice_id: invoiceId,
      provider: 'quickbooks',
      action: 'push_invoice',
      status: 'success',
      external_id: qbInvoiceId,
    })

    return jsonResponse({ success: true, quickbooks_invoice_id: qbInvoiceId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[quickbooks-push-invoice] error:', msg)
    await admin
      .from('invoices')
      .update({
        accounting_status: 'error',
        accounting_provider: 'quickbooks',
        accounting_error: msg.slice(0, 500),
      })
      .eq('id', invoiceId)
    await admin.from('accounting_sync_log').insert({
      organisation_id: organisationId,
      invoice_id: invoiceId,
      provider: 'quickbooks',
      action: 'push_invoice',
      status: 'error',
      error: msg.slice(0, 1000),
    })
    return jsonResponse({ error: msg }, 500)
  }
})
