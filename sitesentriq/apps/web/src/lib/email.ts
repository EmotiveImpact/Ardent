import { supabase } from '@/lib/supabase'

// ── Email Template Types ─────────────────────────────

export type EmailType =
  | 'invite'
  | 'invoice_reminder'
  | 'compliance_alert'
  | 'job_notification'
  | 'quote_approval'
  | 'purchase_order'
  | 'tracking_link'

export interface SendEmailResult {
  success: boolean
  error?: string
}

// ── Payload Types ────────────────────────────────────

export interface InviteEmailPayload {
  to: string
  recipientName: string
  role: string
  inviterName?: string
  organisationName?: string
  signupUrl: string
}

export interface InvoiceReminderPayload {
  to: string
  clientName: string
  invoiceNumber: string
  amountDue: string
  dueDate: string
  invoiceUrl?: string
}

export interface ComplianceAlertPayload {
  to: string
  recipientName: string
  assetName: string
  complianceType: string
  status: string
  dueDate: string
  propertyName: string
}

export interface JobNotificationPayload {
  to: string
  recipientName: string
  jobReference: string
  propertyName: string
  scheduledDate: string
  description?: string
  /**
   * Optional auto-updating ICS subscription URL — when supplied, the
   * job notification template includes a "Subscribe in your calendar"
   * line so the customer's calendar block stays in sync with the
   * engineer's live ETA. Strategic 2 / S2.
   * Build with `buildIcsUrl(token)` from @/hooks/use-job-ics-url.
   */
  etaIcsUrl?: string
}

export interface TrackingLinkPayload {
  to: string
  recipientName?: string
  engineerName?: string
  propertyName?: string
  /** Human-readable arrival window, e.g. "14:00 – 14:30". */
  arrivalWindow?: string
  /** Public /track/<token> URL the customer opens. */
  trackUrl: string
}

export interface QuoteApprovalPayload {
  to: string
  clientName: string
  quoteNumber: string
  totalAmount: string
  validUntil?: string
  approvalUrl?: string
  propertyName?: string
}

export interface PurchaseOrderEmailPayload {
  to: string
  supplierName: string
  poNumber: string
  totalAmount: string
  orderDate?: string
  expectedDate?: string
  deliveryAddress?: string
  poUrl?: string
}

// Maps an email template type to the Settings notification CATEGORY whose EMAIL
// channel governs it (00112). Types absent here are never gated (e.g. invite,
// purchase_order, tracking_link — they target new users / suppliers / customers).
const EMAIL_TYPE_TO_PREF_KEY: Partial<Record<EmailType, string>> = {
  invoice_reminder: 'invoice_reminders',
  compliance_alert: 'compliance_due',
  job_notification: 'visit_reminders',
  quote_approval: 'quote_approvals',
}

/**
 * If the recipient is an INTERNAL user (a profiles row in the caller's org) who
 * turned off the EMAIL channel for this category, skip the send. Client/supplier
 * recipients (no profiles row) and any lookup failure default to SENDING. Reads
 * the recipient's prefs via the org-scoped SECURITY DEFINER reader (the table's
 * own RLS only exposes the caller's own row).
 */
async function recipientOptedOutOfEmail(emailType: EmailType, to: string | undefined): Promise<boolean> {
  const prefKey = EMAIL_TYPE_TO_PREF_KEY[emailType]
  if (!prefKey || !to) return false
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', to)
      .maybeSingle()
    const userId = (prof as { id?: string } | null)?.id
    if (!userId) return false // external recipient — not governed by a user pref
    const { data } = await supabase.rpc('notification_prefs_for', { p_user_ids: [userId] })
    const prefs = (data as { prefs: Record<string, { email?: boolean }> | null }[] | null)?.[0]?.prefs
    return prefs?.[prefKey]?.email === false
  } catch {
    return false // default-allow on any error
  }
}

// ── Core send function ───────────────────────────────

async function invokeEmailFunction<T extends object>(
  emailType: EmailType,
  payload: T
): Promise<SendEmailResult> {
  try {
    if (await recipientOptedOutOfEmail(emailType, (payload as { to?: string }).to)) {
      // Recipient disabled the email channel for this category — treat as a
      // successful no-op so callers (often fire-and-forget) don't error.
      return { success: true }
    }

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { type: emailType, ...(payload as Record<string, unknown>) },
    })

    if (error) {
      console.error(`[email] Edge Function error (${emailType}):`, error.message)
      return { success: false, error: error.message }
    }

    if (data?.error) {
      console.error(`[email] Send failed (${emailType}):`, data.error)
      return { success: false, error: data.error }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error sending email'
    console.error(`[email] Exception (${emailType}):`, message)
    return { success: false, error: message }
  }
}

// ── Typed email functions ────────────────────────────

/**
 * Send an invite email to a new team member with a signup link.
 */
export async function sendInviteEmail(payload: InviteEmailPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('invite', payload)
}

/**
 * Send a payment reminder email for an outstanding invoice.
 */
export async function sendInvoiceReminder(payload: InvoiceReminderPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('invoice_reminder', payload)
}

/**
 * Send a compliance alert email when an item is due or overdue.
 */
export async function sendComplianceAlert(payload: ComplianceAlertPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('compliance_alert', payload)
}

/**
 * Send a job notification email (e.g., job assigned, scheduled).
 */
export async function sendJobNotification(payload: JobNotificationPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('job_notification', payload)
}

/**
 * Email the public live-tracking link to a customer/site contact.
 * "Your engineer is on the way — track live".
 */
export async function sendTrackingLink(payload: TrackingLinkPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('tracking_link', payload)
}

/**
 * Send a quote for client approval via email.
 */
export async function sendQuoteApproval(payload: QuoteApprovalPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('quote_approval', payload)
}

/**
 * Send a purchase order to a supplier.
 */
export async function sendPurchaseOrder(payload: PurchaseOrderEmailPayload): Promise<SendEmailResult> {
  return invokeEmailFunction('purchase_order', payload)
}

// ── Generic wrapper + digest helpers ─────────────────

/**
 * Generic helper that fans out to the `send-email` edge function.
 * Used for one-off transactional sends where a typed wrapper is overkill.
 *
 * Example:
 *   await sendEmail({
 *     to: 'finance@acme.com',
 *     template: 'invoice_reminder',
 *     data: { clientName: 'Acme', invoiceNumber: 'INV-001', amountDue: '£1,200', dueDate: '12 May' }
 *   })
 */
export async function sendEmail<T extends Record<string, unknown>>(args: {
  to: string
  subject?: string
  template: EmailType
  data?: T
}): Promise<SendEmailResult> {
  return invokeEmailFunction(args.template, {
    to: args.to,
    subject: args.subject,
    ...(args.data ?? {}),
  })
}

/**
 * Trigger the weekly digest in preview mode for a single recipient.
 * Uses the `weekly-digest` edge function (separate from `send-email`).
 */
export async function triggerDigestPreview(userEmail: string): Promise<SendEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke('weekly-digest', {
      body: { preview: true, recipient: userEmail },
    })
    if (error) {
      console.error('[email] weekly-digest preview error:', error.message)
      return { success: false, error: error.message }
    }
    if (data?.error) {
      console.error('[email] weekly-digest preview failed:', data.error)
      return { success: false, error: data.error }
    }
    if (typeof data?.failed === 'number' && data.failed > 0) {
      const firstErr = (data.errors?.[0]?.error as string | undefined) ?? 'Send failed'
      return { success: false, error: firstErr }
    }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[email] weekly-digest preview exception:', message)
    return { success: false, error: message }
  }
}
