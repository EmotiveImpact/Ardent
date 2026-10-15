// Sprint 2 / C2 — Tests for the cert auto-mint gates.
//
// We're locking down the SAFETY logic, not the renderer. A wrongly-
// minted certificate is a regulatory issue (we'd be issuing a CP12 for
// a job that didn't actually pass a gas safety check). The four gates
// are: idempotency, report-must-exist, outcome-must-be-pass, and
// type-must-be-non-generic. Each gets a test.
//
// generateCertificate itself is the hot path that does the heavy
// react-dom/server rendering + storage upload — we mock it so these
// tests run in jsdom without spinning up the whole pipeline.

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_auto_mint__ = sb
  return { supabase: sb }
})

vi.mock('@/lib/timeline', () => ({
  logTimelineEvent: vi.fn(async () => undefined),
}))

// Mock generateCertificate so we don't actually render anything.
const generateCertificate = vi.fn(async () => ({
  id: 'cert-1',
  certificate_number: 'CP12-2026-0001',
  html_url: 'org/cert-1.html',
  pdf_url: null,
  signed_url: 'https://example/cert.html',
  signed_pdf_url: null,
  pdf_render_mode: 'unknown' as const,
  type: 'gas_safety' as const,
}))

vi.mock('@/lib/certificates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/certificates')>(
    '@/lib/certificates',
  )
  return {
    ...actual,
    generateCertificate: (...args: unknown[]) => generateCertificate(...args),
    inferCertificateType: actual.inferCertificateType,
  }
})

import { maybeAutoMintCertificate } from './auto-mint'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>)
  .__sb_auto_mint__ as SupabaseMockBuilder

beforeEach(() => {
  sb.reset()
  generateCertificate.mockClear()
})

// Helper: queue the responses for the standard happy-path call sequence.
//   1. existing certs check (idempotency)            → maybeSingle
//   2. service_reports lookup (outcome gate)         → maybeSingle
//   3. jobs row                                      → single
//   4. job_assets join lookup                        → maybeSingle
//   5. (if 4 returned a non-generic asset) we never reach further gates
function queueHappyPath(opts: {
  existing?: { id: string } | null
  reportOutcome?: string | null
  asset?: { id: string; category: string; name: string } | null
  job?: Record<string, unknown> | null
} = {}) {
  const {
    existing = null,
    reportOutcome = 'pass',
    asset = { id: 'a-1', category: 'Gas Boiler', name: 'Boiler 1' },
    job = {
      id: 'job-1',
      organisation_id: 'org-1',
      title: 'Annual gas safety inspection',
      property_id: 'prop-1',
    },
  } = opts

  sb.queueResults([
    { data: existing, error: null },
    reportOutcome === null
      ? { data: null, error: null }
      : { data: { outcome: reportOutcome }, error: null },
    { data: job, error: null },
    asset
      ? { data: { asset_id: asset.id, assets: asset }, error: null }
      : { data: null, error: null },
    // Fallback queries for asset / compliance_item / etc — covered by
    // sticky setResult since our happy path doesn't reach them.
  ])
}

describe('maybeAutoMintCertificate — gates', () => {
  it('skips when a certificate already exists for the job (idempotency)', async () => {
    queueHappyPath({ existing: { id: 'existing-cert' } })

    const result = await maybeAutoMintCertificate('job-1')

    expect(result).toEqual({ status: 'skipped', reason: 'already_exists' })
    expect(generateCertificate).not.toHaveBeenCalled()
  })

  it('skips when no service report has been submitted yet', async () => {
    queueHappyPath({ reportOutcome: null })

    const result = await maybeAutoMintCertificate('job-1')

    expect(result).toEqual({ status: 'skipped', reason: 'no_report' })
    expect(generateCertificate).not.toHaveBeenCalled()
  })

  it('skips when the service report did not pass (fail)', async () => {
    queueHappyPath({ reportOutcome: 'fail' })

    const result = await maybeAutoMintCertificate('job-1')

    expect(result).toEqual({ status: 'skipped', reason: 'not_pass' })
    expect(generateCertificate).not.toHaveBeenCalled()
  })

  it('skips when the report outcome is incomplete (no auto-mint on partial work)', async () => {
    queueHappyPath({ reportOutcome: 'incomplete' })
    const result = await maybeAutoMintCertificate('job-1')
    expect(result).toEqual({ status: 'skipped', reason: 'not_pass' })
    expect(generateCertificate).not.toHaveBeenCalled()
  })

  it('skips when the asset/title cannot be mapped to a known template', async () => {
    // No asset link, no compliance item, generic-sounding title.
    sb.queueResults([
      { data: null, error: null },                                // no existing cert
      { data: { outcome: 'pass' }, error: null },                 // report passed
      {
        data: {
          id: 'job-1',
          organisation_id: 'org-1',
          title: 'Routine site walk',
          property_id: 'prop-1',
        },
        error: null,
      },
      { data: null, error: null }, // job_assets join → no row
      { data: null, error: null }, // jobs.asset_id fallback → no row
      { data: null, error: null }, // compliance_items lookup → no row
    ])

    const result = await maybeAutoMintCertificate('job-1')
    expect(result).toEqual({ status: 'skipped', reason: 'no_template_match' })
    expect(generateCertificate).not.toHaveBeenCalled()
  })
})

describe('maybeAutoMintCertificate — happy path', () => {
  it('mints a gas_safety certificate when the linked asset is a gas boiler', async () => {
    queueHappyPath()
    const result = await maybeAutoMintCertificate('job-1')

    expect(result).toEqual({
      status: 'minted',
      certificate_id: 'cert-1',
      certificate_number: 'CP12-2026-0001',
      type: 'gas_safety',
    })
    expect(generateCertificate).toHaveBeenCalledTimes(1)
    expect(generateCertificate.mock.calls[0][0]).toEqual({
      jobId: 'job-1',
      type: 'gas_safety',
      outcome: 'pass',
    })
  })

  it('mints from job-title when the asset link is missing but the title is unambiguous', async () => {
    sb.queueResults([
      { data: null, error: null },                                // no existing cert
      { data: { outcome: 'pass' }, error: null },                 // passed
      {
        data: {
          id: 'job-1',
          organisation_id: 'org-1',
          title: 'EICR — annual electrical inspection',
          property_id: 'prop-1',
        },
        error: null,
      },
      { data: null, error: null }, // no job_assets
      { data: null, error: null }, // no jobs.asset_id
      { data: null, error: null }, // no compliance_items
      // Title fallback fires — no further DB calls.
    ])

    const result = await maybeAutoMintCertificate('job-1')
    expect(result.status).toBe('minted')
    expect(generateCertificate.mock.calls[0][0]).toMatchObject({
      jobId: 'job-1',
      type: 'eicr',
    })
  })

  it('returns error status when generateCertificate throws', async () => {
    queueHappyPath()
    generateCertificate.mockRejectedValueOnce(new Error('storage upload denied'))

    const result = await maybeAutoMintCertificate('job-1')
    expect(result).toEqual({ status: 'error', reason: 'storage upload denied' })
  })
})
