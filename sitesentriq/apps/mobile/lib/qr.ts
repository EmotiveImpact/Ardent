// QR proof-of-presence helpers (00118, trust wave W2-T8).
//
// Scanning an asset/property QR while ON A JOB records a `qr_checkin`
// field event — hard attendance evidence for SLA disputes (the 00117
// trigger stamps it as response-met evidence server-side). The parse +
// row-building logic is pure and unit-tested; the recorder is offline-aware
// (single insert action — replay-idempotent via the queue's stamped PK).

import { supabase } from '@/lib/supabase'
import { enqueue, uuidv4 } from '@/lib/offline-queue'
import { shouldQueueOfflineWrite } from '@/lib/write-gate'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ParsedScan {
  entityType: 'asset' | 'unknown'
  entityId: string | null
  raw: string
}

/** Asset QR codes carry the asset's UUID (the existing scan→asset flow).
 *  Anything else is recorded verbatim as 'unknown' — the evidence value is
 *  the scan itself, not our ability to resolve it. */
export function parseScanPayload(raw: string): ParsedScan {
  const trimmed = raw.trim()
  if (UUID_RE.test(trimmed)) {
    return { entityType: 'asset', entityId: trimmed.toLowerCase(), raw: trimmed }
  }
  return { entityType: 'unknown', entityId: null, raw: trimmed }
}

export interface QrCheckinRowInput {
  organisationId: string
  jobId: string
  engineerId?: string | null
  parsed: ParsedScan
  coords?: { latitude: number; longitude: number; accuracy?: number | null } | null
}

/** The field_events insert row for a QR check-in. Pure — unit-tested. */
export function buildQrCheckinRow(input: QrCheckinRowInput): Record<string, unknown> {
  return {
    organisation_id: input.organisationId,
    job_id: input.jobId,
    engineer_id: input.engineerId ?? null,
    event_type: 'qr_checkin',
    latitude: input.coords?.latitude ?? null,
    longitude: input.coords?.longitude ?? null,
    accuracy_metres: input.coords?.accuracy != null ? Math.round(input.coords.accuracy) : null,
    metadata: {
      entity_type: input.parsed.entityType,
      entity_id: input.parsed.entityId,
      raw: input.parsed.raw,
    },
  }
}

/** Record the check-in: online → direct insert; offline → queued (the queue
 *  stamps a row PK so a replay converges). Throws on hard failures so the
 *  scan screen can show feedback. */
export async function recordQrCheckin(input: {
  organisationId: string
  jobId: string
  raw: string
  coords?: QrCheckinRowInput['coords']
  /** Test seam / caller-known offline state. */
  queue?: boolean
}): Promise<{ queued: boolean }> {
  const { data: { session } } = await supabase.auth.getSession()
  const row = buildQrCheckinRow({
    organisationId: input.organisationId,
    jobId: input.jobId,
    engineerId: session?.user?.id ?? null,
    parsed: parseScanPayload(input.raw),
    coords: input.coords,
  })
  // Stamp the PK client-side ONCE so the online insert and any fallback replay
  // target the SAME id. Without this, a lost-response insert (the row commits
  // but the 200 never arrives — the basement-signal case) would enqueue a
  // fallback with a fresh uuid → two qr_checkin events → duplicated SLA
  // attendance evidence. With a shared id, the replay hits the field_events PK
  // (23505) and the queue's isDuplicateKey path treats it as already-landed.
  if (row.id == null) row.id = uuidv4()

  if (input.queue || await shouldQueueOfflineWrite()) {
    await enqueue({ kind: 'insert', table: 'field_events', payload: row })
    return { queued: true }
  }
  // A half-connected cellar can leave PostgREST unresolved for minutes. Race
  // it with a watchdog, then queue the SAME stamped id; a late server success
  // and the replay converge on the primary key instead of duplicating evidence.
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ error: { message: string } }>(resolve => {
    watchdog = setTimeout(() => resolve({ error: { message: 'QR check-in timed out' } }), 4_000)
  })
  const { error } = await Promise.race([supabase.from('field_events').insert(row), timeout])
  if (watchdog) clearTimeout(watchdog)
  if (error) {
    // Network-ish failure → fall back to the queue rather than losing evidence.
    // Same id as the online attempt, so a row that actually landed dedupes.
    await enqueue({ kind: 'insert', table: 'field_events', payload: row })
    return { queued: true }
  }
  return { queued: false }
}
