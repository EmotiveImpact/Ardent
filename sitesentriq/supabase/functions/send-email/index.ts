// supabase/functions/send-email/index.ts
// Supabase Edge Function for sending emails via Resend.
// Deploy with: supabase functions deploy send-email
// Required env: RESEND_API_KEY (set in Supabase Dashboard > Edge Functions > Secrets)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

// The shape `createClient(url, key)` actually returns. Using this for helper
// params (instead of `ReturnType<typeof createClient>`, whose default generics
// resolve to a `never` schema that the concrete client isn't assignable to)
// lets the service-role admin client pass type-checking cleanly.
type AdminDbClient = SupabaseClient<any, 'public', any>

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'
const RESEND_URL = 'https://api.resend.com/emails'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_USER_ROLES = new Set(['org_admin', 'scheduler'])

// ── Brand constants ──────────────────────────────────

const BRAND_COLOR = '#08c4ae'
const BRAND_DARK = '#0f1225'
const TEXT_COLOR = '#374151'
const TEXT_MUTED = '#9ca3af'

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; organisation_id: string; role: string }

interface EmailRequest {
  type?: string
  template?: string
  to?: string
  data?: Record<string, unknown>
  organisation_id?: string
  org_id?: string
  [key: string]: unknown
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split('.')
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isServiceRoleJwt(jwt: string): boolean {
  // Trust the JWT role claim: verify_jwt=true gateway already validated signature.
  // String equality against SUPABASE_SERVICE_ROLE_KEY broke on key rotation.
  return decodeJwtPayload(jwt)?.role === 'service_role'
}

async function resolveCallerContext(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) {
    return jsonResponse({ error: 'missing_authorization' }, 401)
  }

  if (isServiceRoleJwt(jwt)) {
    return { kind: 'service_role' }
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'invalid_authorization' }, 401)
  }

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile?.organisation_id || !profile.role) {
    return jsonResponse({ error: 'profile_organisation_not_found' }, 403)
  }

  return {
    kind: 'user',
    organisation_id: String(profile.organisation_id),
    role: String(profile.role),
  }
}

function stringRecord(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  )
}

function isUsableEmail(value: string | null | undefined): value is string {
  if (!value) return false
  if (/[\r\n<>]/.test(value)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// 'invite' legitimately targets a brand-new address (someone not yet in the
// org). Every other template type is sent to an address that already lives in
// the org's own data (client / contact / supplier / team-member), so for those
// we require the recipient to belong to the caller's org — otherwise an
// org_admin/scheduler could use the platform's sending reputation to blast
// branded mail to arbitrary strangers (spam/phishing relay).
const INVITE_TEMPLATE_TYPES = new Set(['invite'])

async function recipientBelongsToOrg(
  admin: AdminDbClient,
  orgId: string,
  email: string,
): Promise<boolean> {
  const e = email.toLowerCase().trim()
  const probes: Array<PromiseLike<{ data: unknown[] | null }>> = [
    admin.from('clients').select('id').eq('organisation_id', orgId).ilike('contact_email', e).limit(1),
    admin.from('profiles').select('id').eq('organisation_id', orgId).ilike('email', e).limit(1),
    admin.from('subcontractors').select('id').eq('organisation_id', orgId).ilike('email', e).limit(1),
    admin.from('property_contacts').select('id').eq('organisation_id', orgId).ilike('email', e).limit(1),
    // Purchase-order emails go to a supplier's contact_email.
    admin.from('suppliers').select('id').eq('organisation_id', orgId).ilike('contact_email', e).limit(1),
  ]
  const results = await Promise.all(
    probes.map((p) => Promise.resolve(p).then((r) => (r.data?.length ?? 0) > 0).catch(() => false)),
  )
  return results.some(Boolean)
}

function formatFrom(name: string | null | undefined, email: string | null | undefined): string {
  if (!isUsableEmail(email)) return FROM_EMAIL
  const display = (name || 'Haumea').replace(/["<>\r\n]/g, '').trim() || 'Haumea'
  return `${display} <${email}>`
}

async function resolveFromAddress(
  adminClient: AdminDbClient,
  organisationId: string | null,
): Promise<string> {
  if (!organisationId) return FROM_EMAIL

  const { data, error } = await adminClient
    .from('organisations')
    .select('name, support_email')
    .eq('id', organisationId)
    .maybeSingle()

  if (error) {
    console.warn('[send-email] org sender lookup failed:', error.message)
    return FROM_EMAIL
  }

  return formatFrom(data?.name as string | null | undefined, data?.support_email as string | null | undefined)
}

function normaliseEmailRequest(body: EmailRequest): {
  type: string
  to: string
  templateData: Record<string, string>
  serviceOrgId: string | null
} | null {
  const type = typeof body.type === 'string' ? body.type : typeof body.template === 'string' ? body.template : ''
  const to = typeof body.to === 'string' ? body.to : ''
  if (!type || !to) return null

  const data: Record<string, unknown> = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
    ? body.data
    : {}
  const rest = { ...body }
  delete rest.type
  delete rest.template
  delete rest.data
  delete rest.from
  delete rest.from_email
  delete rest.organisation_id
  delete rest.org_id

  const serviceOrgId =
    typeof body.organisation_id === 'string'
      ? body.organisation_id
      : typeof body.org_id === 'string'
        ? body.org_id
        : null

  return {
    type,
    to,
    serviceOrgId,
    templateData: {
      to,
      ...stringRecord(data),
      ...stringRecord(rest),
    },
  }
}

// ── HTML email wrapper ───────────────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:${BRAND_DARK};padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Haumea</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-align:center;">
            Sent by Haumea &mdash; Facilities Management Platform
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;margin-top:8px;">${text}</a>`
}

// ── Email templates ──────────────────────────────────

function inviteTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { recipientName, role, inviterName, organisationName, signupUrl } = data
  const orgLabel = organisationName || 'the team'
  const inviterLabel = inviterName ? ` by ${inviterName}` : ''

  return {
    subject: `You've been invited to join ${orgLabel} on Haumea`,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">You're Invited!</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${recipientName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        You've been invited${inviterLabel} to join <strong>${orgLabel}</strong> on Haumea as a <strong>${role || 'team member'}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Click the button below to set up your account and get started.
      </p>
      ${button('Accept Invitation', signupUrl || '#')}
      <p style="margin:16px 0 0;font-size:12px;color:${TEXT_MUTED};">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    `),
  }
}

function invoiceReminderTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { clientName, invoiceNumber, amountDue, dueDate, invoiceUrl } = data

  return {
    subject: `Payment Reminder: Invoice ${invoiceNumber}`,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Payment Reminder</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${clientName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> for <strong>${amountDue}</strong> is due on <strong>${dueDate}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Invoice</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${invoiceNumber}</p>
        </td><td align="right">
          <p style="margin:0 0 8px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Amount Due</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${amountDue}</p>
        </td></tr>
      </table>
      ${invoiceUrl ? button('View Invoice', invoiceUrl) : ''}
      <p style="margin:16px 0 0;font-size:13px;color:${TEXT_MUTED};">
        If you've already made this payment, please disregard this reminder.
      </p>
    `),
  }
}

function complianceAlertTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { recipientName, assetName, complianceType, status, dueDate, propertyName } = data

  const statusColor = status === 'overdue' ? '#ef4444' : status === 'due_soon' ? '#f59e0b' : BRAND_COLOR
  const statusLabel = status === 'overdue' ? 'Overdue' : status === 'due_soon' ? 'Due Soon' : status

  return {
    subject: `Compliance Alert: ${complianceType} — ${statusLabel}`,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Compliance Alert</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${recipientName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        A compliance item requires your attention:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td colspan="2">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Status</p>
          <span style="display:inline-block;background-color:${statusColor};color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">${statusLabel}</span>
        </td></tr>
        <tr><td style="padding-top:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Asset</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:${BRAND_DARK};">${assetName}</p>
        </td><td style="padding-top:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Type</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:${BRAND_DARK};">${complianceType}</p>
        </td></tr>
        <tr><td style="padding-top:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Property</p>
          <p style="margin:0;font-size:14px;color:${TEXT_COLOR};">${propertyName}</p>
        </td><td style="padding-top:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Due Date</p>
          <p style="margin:0;font-size:14px;color:${TEXT_COLOR};">${dueDate}</p>
        </td></tr>
      </table>
    `),
  }
}

function jobNotificationTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { recipientName, jobReference, propertyName, scheduledDate, description } = data

  return {
    subject: `Job Notification: ${jobReference}`,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Job Update</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${recipientName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        You have a job update for reference <strong>${jobReference}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Property</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:${BRAND_DARK};">${propertyName}</p>
        </td><td align="right">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Scheduled</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:${BRAND_DARK};">${scheduledDate}</p>
        </td></tr>
      </table>
      ${description ? `<p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">${description}</p>` : ''}
    `),
  }
}

function quoteApprovalTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { clientName, quoteNumber, totalAmount, validUntil, approvalUrl, propertyName } = data

  return {
    subject: `Quote ${quoteNumber} — Review & Approve`,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Quote for Your Review</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${clientName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        A new quote has been prepared for your review.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Quote</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${quoteNumber}</p>
        </td><td align="right">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Total</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${totalAmount}</p>
        </td></tr>
        ${propertyName ? `<tr><td style="padding-top:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Property</p>
          <p style="margin:0;font-size:14px;color:${TEXT_COLOR};">${propertyName}</p>
        </td><td style="padding-top:12px;" align="right">
          ${validUntil ? `<p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Valid Until</p>
          <p style="margin:0;font-size:14px;color:${TEXT_COLOR};">${validUntil}</p>` : ''}
        </td></tr>` : ''}
      </table>
      ${approvalUrl ? button('Review Quote', approvalUrl) : ''}
      <p style="margin:16px 0 0;font-size:13px;color:${TEXT_MUTED};">
        If you have questions about this quote, please contact your account manager.
      </p>
    `),
  }
}

function purchaseOrderTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { supplierName, poNumber, totalAmount, orderDate, expectedDate, deliveryAddress, poUrl } = data

  return {
    subject: `Purchase Order ${poNumber}`,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Purchase Order</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${supplierName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Please find purchase order <strong>${poNumber}</strong> for processing.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">PO Number</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${poNumber}</p>
        </td><td align="right">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Total</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${totalAmount}</p>
        </td></tr>
        <tr><td style="padding-top:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Order Date</p>
          <p style="margin:0;font-size:14px;color:${TEXT_COLOR};">${orderDate || '-'}</p>
        </td><td style="padding-top:12px;" align="right">
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Expected</p>
          <p style="margin:0;font-size:14px;color:${TEXT_COLOR};">${expectedDate || '-'}</p>
        </td></tr>
      </table>
      ${deliveryAddress ? `<p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;"><strong>Delivery address:</strong><br>${deliveryAddress}</p>` : ''}
      ${poUrl ? button('Open Purchase Order', poUrl) : ''}
    `),
  }
}

function trackingLinkTemplate(data: Record<string, string>): { subject: string; html: string } {
  const { recipientName, engineerName, propertyName, arrivalWindow, trackUrl } = data
  const engineerLabel = engineerName ? `${engineerName} is` : 'Your engineer is'

  return {
    subject: 'Your engineer is on the way — track live',
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Your engineer is on the way</h2>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        Hi ${recipientName || 'there'},
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        ${engineerLabel} on the way${propertyName ? ` to <strong>${propertyName}</strong>` : ''}. You can follow their live location and estimated arrival on the tracking page below — no login needed.
      </p>
      ${
        arrivalWindow
          ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Estimated arrival</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND_DARK};">${arrivalWindow}</p>
        </td></tr>
      </table>`
          : ''
      }
      ${trackUrl ? button('Track live', trackUrl) : ''}
      <p style="margin:16px 0 0;font-size:13px;color:${TEXT_MUTED};">
        The tracking page updates automatically as your engineer travels.
      </p>
    `),
  }
}

// ── Template dispatcher ──────────────────────────────

function getTemplate(type: string, data: Record<string, string>): { subject: string; html: string } | null {
  switch (type) {
    case 'invite':
      return inviteTemplate(data)
    case 'invoice_reminder':
      return invoiceReminderTemplate(data)
    case 'compliance_alert':
      return complianceAlertTemplate(data)
    case 'job_notification':
      return jobNotificationTemplate(data)
    case 'quote_approval':
      return quoteApprovalTemplate(data)
    case 'purchase_order':
      return purchaseOrderTemplate(data)
    case 'tracking_link':
      return trackingLinkTemplate(data)
    default:
      return null
  }
}

// ── Main handler ─────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  if (caller.kind === 'user' && !ALLOWED_USER_ROLES.has(caller.role)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  try {
    const body = (await req.json()) as EmailRequest
    const parsed = normaliseEmailRequest(body)

    if (!parsed) {
      return jsonResponse({ error: 'Missing required fields: type, to' }, 400)
    }

    if (!RESEND_API_KEY) {
      console.error('[send-email] RESEND_API_KEY is not configured')
      return jsonResponse({ error: 'Email service not configured' }, 500)
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Recipient guard for user-context callers: the address must be well-formed,
    // and (for non-invite templates) must belong to the caller's org. Service-role
    // callers are internal automation and trusted.
    if (caller.kind === 'user') {
      if (!isUsableEmail(parsed.to)) {
        return jsonResponse({ error: 'Invalid recipient address' }, 400)
      }
      if (
        !INVITE_TEMPLATE_TYPES.has(parsed.type) &&
        !(await recipientBelongsToOrg(adminClient, caller.organisation_id, parsed.to))
      ) {
        return jsonResponse({ error: 'Recipient is not part of your organisation' }, 403)
      }
    }

    const senderOrgId = caller.kind === 'service_role' ? parsed.serviceOrgId : caller.organisation_id
    const fromAddress = await resolveFromAddress(adminClient, senderOrgId)

    const template = getTemplate(parsed.type, parsed.templateData)
    if (!template) {
      return jsonResponse({ error: `Unknown email type: ${parsed.type}` }, 400)
    }

    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [parsed.to],
        subject: template.subject,
        html: template.html,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('[send-email] Resend API error:', result)
      return jsonResponse({ error: result.message || 'Failed to send email' }, res.status)
    }

    return jsonResponse({ success: true, id: result.id }, 200)
  } catch (err) {
    console.error('[send-email] Unexpected error:', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
