// supabase/functions/xero-push-invoice/index.ts
// Push a Facilities OS invoice to Xero (UK).
// Deploy with: supabase functions deploy xero-push-invoice
//
// Body schema: { invoice_id: string }
//
// Auth: requires user JWT. Resolves organisation, looks up xero_connections,
// refreshes access token if needed, finds-or-creates a Xero Contact for the client,
// then POSTs the invoice to /api.xro/2.0/Invoices.
//
// On success: writes xero_invoice_id, accounting_status='pushed', accounting_pushed_at,
// accounting_provider='xero' on the FOS invoice.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const XERO_CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') ?? ''
const XERO_CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_INVOICES_URL = 'https://api.xero.com/api.xro/2.0/Invoices'
const XERO_CONTACTS_URL = 'https://api.xero.com/api.xro/2.0/Contacts'

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

interface XeroConnRow {
  id: string
  organisation_id: string
  xero_tenant_id: string
  refresh_token: string
  access_token: string | null
  expires_at: string | null
  default_tax_rate: string | null
  default_account_code: string | null
}

async function refreshIfNeeded(admin: SupabaseClient, conn: XeroConnRow): Promise<string> {
  const now = Date.now()
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0
  // Refresh if access token is missing or expires within 60 seconds
  if (conn.access_token && expiresAt > now + 60_000) {
    return conn.access_token
  }

  const basic = btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
  })
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Xero refresh failed: ${res.status} ${err}`)
  }
  const tok = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const newExpires = new Date(Date.now() + tok.expires_in * 1000).toISOString()

  await admin
    .from('xero_connections')
    .update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: newExpires,
    })
    .eq('organisation_id', conn.organisation_id)

  await admin.from('accounting_sync_log').insert({
    organisation_id: conn.organisation_id,
    provider: 'xero',
    action: 'refresh_token',
    status: 'success',
  })

  return tok.access_token
}

async function findOrCreateXeroContact(
  accessToken: string,
  tenantId: string,
  client: { name: string; contact_email?: string | null },
): Promise<string> {
  // Try to find by name (Xero uses unique Name)
  const searchUrl = `${XERO_CONTACTS_URL}?where=${encodeURIComponent(`Name=="${client.name.replace(/"/g, '\\"')}"`)}`
  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
    },
  })
  if (searchRes.ok) {
    const found = await searchRes.json() as { Contacts?: Array<{ ContactID: string }> }
    if (found.Contacts && found.Contacts.length > 0) {
      return found.Contacts[0].ContactID
    }
  }

  // Create
  const createBody = {
    Contacts: [
      {
        Name: client.name,
        EmailAddress: client.contact_email ?? undefined,
      },
    ],
  }
  const createRes = await fetch(XERO_CONTACTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  })
  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Xero contact create failed: ${createRes.status} ${err}`)
  }
  const created = await createRes.json() as { Contacts: Array<{ ContactID: string }> }
  return created.Contacts[0].ContactID
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
    return jsonResponse({ error: 'XERO_NOT_CONFIGURED' }, 200)
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

  // Load connection
  const { data: conn } = await admin
    .from('xero_connections')
    .select('*')
    .eq('organisation_id', organisationId)
    .is('disconnected_at', null)
    .maybeSingle()
  if (!conn) {
    return jsonResponse({ error: 'Xero not connected for this organisation' }, 400)
  }

  // Load invoice + lines + client
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select('*, clients(name, contact_email), invoice_lines(*)')
    .eq('id', invoiceId)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (invErr || !invoice) return jsonResponse({ error: 'Invoice not found' }, 404)

  // Fast path: already pushed (read snapshot).
  if (invoice.xero_invoice_id || invoice.accounting_status === 'pushed') {
    return jsonResponse({
      success: true,
      already_pushed: true,
      xero_invoice_id: invoice.xero_invoice_id ?? null,
    })
  }
  // Atomic idempotency claim — flip accounting_status to 'pushing' ONLY if not
  // already pushed/in-flight. Xero doesn't enforce InvoiceNumber uniqueness, so
  // the old read-then-act guard let two concurrent retries/double-clicks both
  // POST and create a second ACCREC invoice (double-billing). Row-level UPDATE
  // serialises them: the loser matches 0 rows and bails. A failed push resets
  // status to 'error' (catch below), so it can be retried.
  //
  // Stale-claim reclaim: a crash BETWEEN the claim and the catch used to wedge
  // the invoice at 'pushing' forever (the claim filter never matched again).
  // A 'pushing' row whose updated_at (trigger-maintained, freshened by the
  // claim itself) is older than 10 min is treated as abandoned and re-claimable.
  // Still race-safe: a concurrent fresh claim re-stamps updated_at, so the
  // loser's WHERE matches 0 rows.
  // 30 min, not 10: a 'pushing' claim is only reclaimed once it's well past
  // any plausible in-flight push (function timeout + Xero latency + retries).
  // Reclaiming a merely-slow push too eagerly would POST a SECOND ACCREC
  // invoice (Xero doesn't enforce InvoiceNumber uniqueness — see below).
  const stalePushingBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: claimed } = await admin
    .from('invoices')
    .update({ accounting_status: 'pushing' })
    .eq('id', invoiceId)
    .eq('organisation_id', organisationId)
    .is('xero_invoice_id', null)
    .or(`accounting_status.is.null,accounting_status.neq.pushing,updated_at.lt.${stalePushingBefore}`)
    .select('id')
  if (!claimed || claimed.length === 0) {
    return jsonResponse({
      success: true,
      already_pushed: true,
      xero_invoice_id: invoice.xero_invoice_id ?? null,
    })
  }

  type Line = { description: string; quantity: number; unit_price: number; total: number }
  const lines: Line[] = (invoice.invoice_lines as Line[] | null) ?? []
  const clientName = (invoice.clients as { name?: string } | null)?.name ?? 'Client'
  const clientEmail = (invoice.clients as { contact_email?: string } | null)?.contact_email ?? null

  try {
    const accessToken = await refreshIfNeeded(admin, conn as XeroConnRow)
    const contactId = await findOrCreateXeroContact(accessToken, conn.xero_tenant_id, {
      name: clientName,
      contact_email: clientEmail,
    })

    const xeroLineItems = lines.map((line) => ({
      Description: line.description,
      Quantity: line.quantity,
      UnitAmount: line.unit_price,
      AccountCode: conn.default_account_code ?? '200',
      TaxType: conn.default_tax_rate ?? 'OUTPUT2',
      LineAmount: line.total,
    }))

    const xeroBody = {
      Invoices: [
        {
          Type: 'ACCREC',
          Contact: { ContactID: contactId },
          Date: new Date(invoice.created_at).toISOString().slice(0, 10),
          DueDate: invoice.due_date ?? undefined,
          InvoiceNumber: invoice.invoice_number,
          Reference: invoice.invoice_number,
          Status: 'AUTHORISED',
          LineAmountTypes: 'Exclusive',
          LineItems: xeroLineItems,
        },
      ],
    }

    const pushRes = await fetch(XERO_INVOICES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-Tenant-Id': conn.xero_tenant_id,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(xeroBody),
    })
    const pushJson = await pushRes.json()
    if (!pushRes.ok) {
      throw new Error(`Xero push failed: ${pushRes.status} ${JSON.stringify(pushJson)}`)
    }

    const xeroInvoiceId = pushJson.Invoices?.[0]?.InvoiceID ?? null
    const pushedAt = new Date().toISOString()

    await admin
      .from('invoices')
      .update({
        xero_invoice_id: xeroInvoiceId,
        accounting_status: 'pushed',
        accounting_provider: 'xero',
        accounting_pushed_at: pushedAt,
        accounting_error: null,
      })
      .eq('id', invoiceId)

    await admin
      .from('xero_connections')
      .update({ last_synced_at: pushedAt })
      .eq('organisation_id', organisationId)

    await admin.from('accounting_sync_log').insert({
      organisation_id: organisationId,
      invoice_id: invoiceId,
      provider: 'xero',
      action: 'push_invoice',
      status: 'success',
      external_id: xeroInvoiceId,
    })

    return jsonResponse({ success: true, xero_invoice_id: xeroInvoiceId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[xero-push-invoice] error:', msg)
    await admin
      .from('invoices')
      .update({
        accounting_status: 'error',
        accounting_provider: 'xero',
        accounting_error: msg.slice(0, 500),
      })
      .eq('id', invoiceId)
    await admin.from('accounting_sync_log').insert({
      organisation_id: organisationId,
      invoice_id: invoiceId,
      provider: 'xero',
      action: 'push_invoice',
      status: 'error',
      error: msg.slice(0, 1000),
    })
    return jsonResponse({ error: msg }, 500)
  }
})
