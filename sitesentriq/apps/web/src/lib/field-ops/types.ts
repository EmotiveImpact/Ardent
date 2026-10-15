/**
 * Field-ops shared types.
 *
 * `field_events` is an append-only audit log of on-site activity.
 */

export type FieldEventType =
  | 'travel_started'
  | 'arrived'
  | 'working_started'
  | 'paused'
  | 'resumed'
  | 'working_completed'
  | 'signature_captured'
  | 'qr_checkin'

export interface FieldEvent {
  id: string
  organisation_id: string
  job_id: string
  engineer_id: string | null
  event_type: FieldEventType
  latitude: number | null
  longitude: number | null
  accuracy_metres: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export const FIELD_EVENT_LABELS: Record<FieldEventType, string> = {
  travel_started: 'Travel started',
  arrived: 'Arrived on site',
  working_started: 'Working',
  paused: 'Paused',
  resumed: 'Resumed',
  working_completed: 'Work complete',
  signature_captured: 'Signature captured',
  // Proof-of-presence (00118, W2-T8): engineer scanned a site/asset QR on the
  // job — SLA attendance evidence (the scanned entity is in metadata).
  qr_checkin: 'Proof of presence (QR scan)',
}

export type FieldStage =
  | 'not_started'
  | 'travelling'
  | 'arrived'
  | 'working'
  | 'completed'

export function deriveStage(events: FieldEvent[] | undefined | null): FieldStage {
  if (!events || events.length === 0) return 'not_started'
  // events are assumed ordered most-recent first OR oldest-first; we only
  // care about the latest meaningful state, so derive from a reduce.
  let stage: FieldStage = 'not_started'
  for (const e of events) {
    switch (e.event_type) {
      case 'travel_started':
        if (stage === 'not_started') stage = 'travelling'
        break
      case 'arrived':
        if (stage === 'not_started' || stage === 'travelling') stage = 'arrived'
        break
      case 'working_started':
      case 'resumed':
        if (stage !== 'completed') stage = 'working'
        break
      case 'working_completed':
        stage = 'completed'
        break
    }
  }
  return stage
}

export const STAGE_LABELS: Record<FieldStage, string> = {
  not_started: 'Not started',
  travelling: 'Travel',
  arrived: 'On site',
  working: 'Working',
  completed: 'Completed',
}
