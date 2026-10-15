// Fire-and-forget client helper that asks the `slack-post-notification`
// edge function to push a Slack message after an in-app notification lands.
// Defensive: any error is swallowed so the main flow is never blocked.

import { supabase } from '@/lib/supabase'
import type { SlackSeverity } from './types'
import type { NotificationType } from '@/lib/constants'
import { DEFAULT_SEVERITY } from './blocks'

export interface PostSlackNotificationInput {
  orgId: string
  type: NotificationType | string
  title: string
  body: string
  link?: string
  severity?: SlackSeverity
  context?: { property?: string; client?: string }
}

/**
 * Best-effort: try to post the notification to Slack. If the edge function
 * isn't deployed, the org isn't connected, or the call fails — we silently
 * swallow the error. The in-app notification is the source of truth.
 */
export async function postSlackNotification(input: PostSlackNotificationInput): Promise<void> {
  try {
    const severity =
      input.severity ?? DEFAULT_SEVERITY[input.type as NotificationType] ?? 'info'

    // Don't await — fire and forget. We still wrap in try/catch in case
    // `supabase.functions.invoke` itself throws synchronously.
    void supabase.functions.invoke('slack-post-notification', {
      body: {
        org_id: input.orgId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? undefined,
        severity,
        context: input.context ?? undefined,
      },
    }).catch((err) => {
      // Edge function may simply not be deployed — that's fine.
      console.debug('[slack] post failed (non-blocking):', err?.message ?? err)
    })
  } catch (err) {
    console.debug('[slack] post invocation threw (non-blocking):', err)
  }
}
