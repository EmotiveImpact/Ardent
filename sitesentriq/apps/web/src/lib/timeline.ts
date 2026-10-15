import { supabase } from '@/lib/supabase'
import type { TimelineEventType } from '@/lib/constants'

export interface LogTimelineEventParams {
  orgId: string
  propertyId?: string
  clientId?: string
  eventType: TimelineEventType
  description: string
  userId?: string
  metadata?: Record<string, unknown>
}

/**
 * Log a timeline / audit-trail event.
 * Inserts into the `timeline_events` table for per-site and per-client activity feeds.
 */
export async function logTimelineEvent(params: LogTimelineEventParams) {
  const { orgId, propertyId, clientId, eventType, description, userId, metadata } = params

  const { data, error } = await supabase
    .from('timeline_events')
    .insert({
      organisation_id: orgId,
      property_id: propertyId ?? null,
      client_id: clientId ?? null,
      event_type: eventType,
      description,
      user_id: userId ?? null,
      metadata: metadata ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[timeline] Failed to log event:', error.message)
    return null
  }

  return data
}
