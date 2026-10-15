import { supabase } from '@/lib/supabase'
import type { NotificationType } from '@/lib/constants'
import { postSlackNotification } from '@/lib/integrations/slack/post'
import type { SlackSeverity } from '@/lib/integrations/slack/types'
import { featureFlags } from '@/lib/feature-flags'

export interface CreateNotificationParams {
  userId: string
  orgId: string
  type: NotificationType
  title: string
  message: string
  linkUrl?: string
  // Optional Slack hints — defaults derived from `type` if omitted.
  slackSeverity?: SlackSeverity
  slackContext?: { property?: string; client?: string }
}

// ── Notification preferences (00112) ────────────────────────────────────────
// Maps a raw notification_type to the Settings pref CATEGORY it belongs to.
// Types absent here have no governing toggle → always delivered.
const TYPE_TO_PREF_KEY: Record<string, string> = {
  compliance_due: 'compliance_due',
  compliance_overdue: 'compliance_due',
  certificate_expiring: 'compliance_due',
  visit_booked: 'visit_reminders',
  visit_reminder: 'visit_reminders',
  invoice_due_soon: 'invoice_reminders',
  invoice_overdue: 'invoice_reminders',
  action_overdue: 'overdue_actions',
  quote_approved: 'quote_approvals',
  quote_rejected: 'quote_approvals',
  quote_awaiting_approval: 'quote_approvals',
}

type PrefEntry = { inApp?: boolean; email?: boolean }
type PrefsMap = Map<string, Record<string, PrefEntry>>

/** Fetch prefs for the given users via the org-scoped reader. Missing = default. */
async function fetchPrefs(userIds: string[]): Promise<PrefsMap> {
  const map: PrefsMap = new Map()
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return map
  try {
    const { data } = await supabase.rpc('notification_prefs_for', { p_user_ids: unique })
    for (const row of (data ?? []) as { user_id: string; prefs: Record<string, PrefEntry> | null }[]) {
      map.set(row.user_id, row.prefs ?? {})
    }
  } catch {
    /* default-allow on any error */
  }
  return map
}

/** Is the in-app channel enabled for (user, type)? Default true. */
function inAppAllowed(prefs: PrefsMap, userId: string, type: string): boolean {
  const key = TYPE_TO_PREF_KEY[type]
  if (!key) return true
  return prefs.get(userId)?.[key]?.inApp !== false
}

/**
 * Fire-and-forget push fan-out — fans to BOTH browser Web Push (via
 * `send-push`) and mobile Expo push (via `send-expo-push` since
 * Sprint 2A) so users get pinged on every device they've subscribed.
 *
 * Gated behind `featureFlags.pushNotifications`. Errors are swallowed —
 * push delivery must never block the in-app notification (the row in
 * `notifications` is the source of truth). The edge functions
 * short-circuit to `{ sent: 0 }` when the target user has no active
 * subscriptions / tokens, so the cost is negligible for users who
 * haven't opted in.
 */
async function dispatchPush(params: {
  userIds: string[]
  title: string
  body: string
  link?: string
}): Promise<void> {
  if (!featureFlags.pushNotifications) return
  if (params.userIds.length === 0) return
  // Run both fan-outs in parallel. Each catches its own errors so a
  // failure on one transport doesn't take the other down.
  const body = {
    user_ids: params.userIds,
    title: params.title,
    body: params.body,
    link: params.link,
  }
  await Promise.all([
    supabase.functions.invoke('send-push', { body }).catch((err) => {
      console.debug('[notifications] web push dispatch threw (non-blocking):', err)
    }),
    supabase.functions.invoke('send-expo-push', { body }).catch((err) => {
      console.debug('[notifications] expo push dispatch threw (non-blocking):', err)
    }),
  ])
}

/**
 * Create a single in-app notification for a user.
 * Inserts into the `notifications` table via Supabase.
 *
 * After a successful insert, also fire-and-forget a Slack post via the
 * `slack-post-notification` edge function. The Slack call is wrapped so any
 * failure (Slack offline, type disabled, threshold below severity) never
 * blocks the in-app notification.
 */
export async function createNotification(params: CreateNotificationParams) {
  const { userId, orgId, type, title, message, linkUrl, slackSeverity, slackContext } = params

  // Respect the recipient's in-app notification preference (00112). When they've
  // turned this category off, skip the in-app insert AND the push (default-allow
  // when there's no pref/row).
  if (TYPE_TO_PREF_KEY[type]) {
    const prefs = await fetchPrefs([userId])
    if (!inAppAllowed(prefs, userId, type)) return null
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      organisation_id: orgId,
      notification_type: type,
      title,
      message,
      link: linkUrl ?? null,
      read: false,
    })
    .select()
    .single()

  if (error) {
    console.error('[notifications] Failed to create notification:', error.message)
    return null
  }

  // Fire-and-forget Slack post. Errors are swallowed inside postSlackNotification.
  try {
    void postSlackNotification({
      orgId,
      type,
      title,
      body: message,
      link: linkUrl,
      severity: slackSeverity,
      context: slackContext,
    })
  } catch (slackErr) {
    console.debug('[notifications] Slack post threw (non-blocking):', slackErr)
  }

  // Fire-and-forget Web Push. No-op when feature flag is off or user has
  // no active subscriptions.
  void dispatchPush({
    userIds: [userId],
    title,
    body: message,
    link: linkUrl,
  })

  return data
}

/**
 * Create notifications for multiple users in a single batch insert.
 * Useful for notifying an entire team or all org admins at once.
 */
export async function createBulkNotifications(
  notifications: CreateNotificationParams[]
) {
  if (notifications.length === 0) return []

  // Respect each recipient's in-app preference (00112) — drop recipients who
  // turned this category off (default-allow when no pref/row).
  const prefs = await fetchPrefs(notifications.map((n) => n.userId))
  const allowed = notifications.filter((n) => inAppAllowed(prefs, n.userId, n.type))
  if (allowed.length === 0) return []

  const rows = allowed.map((n) => ({
    user_id: n.userId,
    organisation_id: n.orgId,
    notification_type: n.type,
    title: n.title,
    message: n.message,
    link: n.linkUrl ?? null,
    read: false,
  }))

  const { data, error } = await supabase
    .from('notifications')
    .insert(rows)
    .select()

  if (error) {
    console.error('[notifications] Failed to create bulk notifications:', error.message)
    return []
  }

  // Fire-and-forget: post a single Slack message per (org, type, title) combo
  // rather than spamming once per user. We dedupe by org_id + type + title so
  // a fan-out to 12 admins still results in one Slack post.
  try {
    const seen = new Set<string>()
    for (const n of allowed) {
      const key = `${n.orgId}::${n.type}::${n.title}`
      if (seen.has(key)) continue
      seen.add(key)
      void postSlackNotification({
        orgId: n.orgId,
        type: n.type,
        title: n.title,
        body: n.message,
        link: n.linkUrl,
        severity: n.slackSeverity,
        context: n.slackContext,
      })
    }
  } catch (slackErr) {
    console.debug('[notifications] Slack bulk post threw (non-blocking):', slackErr)
  }

  // Fire-and-forget Web Push fan-out. Group by (title, message, linkUrl) so
  // an "asset due" notification sent to 12 admins becomes one edge function
  // call with 12 user IDs — far cheaper than 12 separate invocations.
  try {
    const groups = new Map<string, { title: string; body: string; link?: string; userIds: string[] }>()
    for (const n of allowed) {
      const key = `${n.title}::${n.message}::${n.linkUrl ?? ''}`
      const existing = groups.get(key)
      if (existing) {
        existing.userIds.push(n.userId)
      } else {
        groups.set(key, {
          title: n.title,
          body: n.message,
          link: n.linkUrl,
          userIds: [n.userId],
        })
      }
    }
    for (const g of groups.values()) {
      void dispatchPush(g)
    }
  } catch (pushErr) {
    console.debug('[notifications] push bulk dispatch threw (non-blocking):', pushErr)
  }

  return data ?? []
}
