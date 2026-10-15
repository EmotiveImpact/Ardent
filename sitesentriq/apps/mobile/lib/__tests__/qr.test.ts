import { afterEach, describe, expect, it, vi } from 'vitest'

// qr.ts imports the supabase client + offline queue at module level. The pure
// tests below only need stubs; the recordQrCheckin tests drive them.
const insertCalls: unknown[] = []
const enqueueCalls: { kind: string; table: string; payload: { id?: string } }[] = []
let insertError: { message: string } | null = null

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'eng-1' } } } })) },
    from: vi.fn(() => ({
      insert: vi.fn(async (row: unknown) => {
        insertCalls.push(row)
        return { error: insertError }
      }),
    })),
  },
}))
vi.mock('@/lib/offline-queue', () => ({
  enqueue: vi.fn(async (action: { kind: string; table: string; payload: { id?: string } }) => {
    enqueueCalls.push(action)
    return 'queued-id'
  }),
  // Deterministic so the shared-id assertion is exact.
  uuidv4: vi.fn(() => 'stamped-uuid-0001'),
}))
vi.mock('@/lib/write-gate', () => ({
  shouldQueueOfflineWrite: vi.fn(async () => false),
}))

import { parseScanPayload, buildQrCheckinRow, recordQrCheckin } from '../qr'

afterEach(() => {
  insertCalls.length = 0
  enqueueCalls.length = 0
  insertError = null
  vi.clearAllMocks()
})

describe('parseScanPayload', () => {
  it('recognises an asset UUID (case-insensitive, trimmed)', () => {
    const parsed = parseScanPayload('  3F2504E0-4F89-41D3-9A0C-0305E82C3301 ')
    expect(parsed).toEqual({
      entityType: 'asset',
      entityId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      raw: '3F2504E0-4F89-41D3-9A0C-0305E82C3301',
    })
  })

  it('records non-UUID payloads verbatim as unknown', () => {
    const parsed = parseScanPayload('https://example.com/asset/42')
    expect(parsed.entityType).toBe('unknown')
    expect(parsed.entityId).toBeNull()
    expect(parsed.raw).toBe('https://example.com/asset/42')
  })
})

describe('buildQrCheckinRow', () => {
  it('builds the field_events row with metadata + rounded accuracy', () => {
    const row = buildQrCheckinRow({
      organisationId: 'org-1',
      jobId: 'job-1',
      engineerId: 'eng-1',
      parsed: parseScanPayload('3f2504e0-4f89-41d3-9a0c-0305e82c3301'),
      coords: { latitude: 53.3498, longitude: -6.2603, accuracy: 8.7 },
    })
    expect(row).toMatchObject({
      organisation_id: 'org-1',
      job_id: 'job-1',
      engineer_id: 'eng-1',
      event_type: 'qr_checkin',
      latitude: 53.3498,
      longitude: -6.2603,
      accuracy_metres: 9,
      metadata: {
        entity_type: 'asset',
        entity_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      },
    })
  })

  it('tolerates missing engineer and coords (offline basement scan)', () => {
    const row = buildQrCheckinRow({
      organisationId: 'org-1',
      jobId: 'job-1',
      parsed: parseScanPayload('plant-room-3'),
    })
    expect(row).toMatchObject({
      engineer_id: null,
      latitude: null,
      longitude: null,
      accuracy_metres: null,
      metadata: { entity_type: 'unknown', entity_id: null, raw: 'plant-room-3' },
    })
  })
})

describe('recordQrCheckin — lost-response idempotency', () => {
  it('online success: one insert, no queue, stamped id', async () => {
    const res = await recordQrCheckin({ organisationId: 'org-1', jobId: 'job-1', raw: 'asset-x' })
    expect(res).toEqual({ queued: false })
    expect(insertCalls).toHaveLength(1)
    expect((insertCalls[0] as { id?: string }).id).toBe('stamped-uuid-0001')
    expect(enqueueCalls).toHaveLength(0)
  })

  it('lost response: the fallback enqueue reuses the SAME id as the online insert (dedupes on replay)', async () => {
    insertError = { message: 'Network request failed' }
    const res = await recordQrCheckin({ organisationId: 'org-1', jobId: 'job-1', raw: 'asset-x' })
    expect(res).toEqual({ queued: true })
    // Online insert was attempted, then queued as a fallback — both with one id.
    expect(insertCalls).toHaveLength(1)
    expect(enqueueCalls).toHaveLength(1)
    const onlineId = (insertCalls[0] as { id?: string }).id
    expect(onlineId).toBe('stamped-uuid-0001')
    expect(enqueueCalls[0].payload.id).toBe(onlineId)
  })

  it('explicit offline (queue:true): single queued insert, never an online attempt', async () => {
    const res = await recordQrCheckin({ organisationId: 'org-1', jobId: 'job-1', raw: 'asset-x', queue: true })
    expect(res).toEqual({ queued: true })
    expect(insertCalls).toHaveLength(0)
    expect(enqueueCalls).toHaveLength(1)
    expect(enqueueCalls[0].payload.id).toBe('stamped-uuid-0001')
  })
})
