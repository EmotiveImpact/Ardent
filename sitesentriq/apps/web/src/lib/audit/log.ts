// src/lib/audit/log.ts
// Writer for the audit log. Inserts a row into `system_audit_events`
// with the current user / org from the auth context.
//
// Use this for events that DON'T already write to timeline_events —
// auth events (sign-in / sign-out / password change), role changes,
// billing webhook side-effects, etc. CRUD on business entities still
// flows through `logTimelineEvent` (src/lib/timeline.ts).

import { supabase } from '@/lib/supabase'
import type { AuditSeverity } from './types'

export interface LogAuditEventParams {
  /** Org id is read from the calling profile/session if omitted. */
  organisationId?: string
  /** Actor id — defaults to the current auth user. Pass `null` for system events. */
  actorUserId?: string | null
  actorEmail?: string | null
  /** `<domain>.<verb>` form — e.g. `user.signed_in`, `user.role_changed`. */
  action: string
  entityType?: string
  entityId?: string
  summary: string
  metadata?: Record<string, unknown>
  severity?: AuditSeverity
}

/**
 * Insert a row into `system_audit_events`. RLS allows any org member
 * to insert into their own org. Failures are logged but never thrown —
 * audit logging must never block the user-facing flow.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  try {
    let organisationId = params.organisationId
    let actorUserId: string | null | undefined = params.actorUserId
    let actorEmail = params.actorEmail ?? null

    // Fill in org + actor from the current session when not supplied.
    if (!organisationId || actorUserId === undefined) {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user ?? null
      if (user) {
        if (actorUserId === undefined) actorUserId = user.id
        if (!actorEmail) actorEmail = user.email ?? null

        if (!organisationId) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('organisation_id, email')
            .eq('id', user.id)
            .maybeSingle()
          if (prof?.organisation_id) organisationId = prof.organisation_id as string
          if (!actorEmail && prof?.email) actorEmail = prof.email as string
        }
      }
    }

    if (!organisationId) {
      // No org context — quietly drop. Pre-onboarding users have no org yet.
      return
    }

    // Best-effort user agent capture (no IP — that needs a server side hop).
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null

    const { error } = await supabase
      .from('system_audit_events')
      .insert({
        organisation_id: organisationId,
        actor_user_id: actorUserId === null ? null : actorUserId ?? null,
        actor_email: actorEmail,
        action: params.action,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        summary: params.summary,
        metadata: params.metadata ?? null,
        ip_address: null,
        user_agent: userAgent,
        severity: params.severity ?? 'info',
      })

    if (error) {
       
      console.warn('[audit] failed to log event:', error.message)
    }
  } catch (err) {
     
    console.warn('[audit] logAuditEvent threw:', err)
  }
}
