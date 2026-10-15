// Strategic 1 follow-up — Tests for the public Trust URL helpers.
//
// We don't render the hooks here — the load-bearing pieces are the
// pure helpers (URL builder + slug validator) that decide what we
// publish. The mutation itself is a thin Supabase passthrough.

import { describe, expect, it } from 'vitest'
import { buildTrustUrl, isValidSlug, suggestSlug } from './use-trust-url'

describe('buildTrustUrl', () => {
  it('uses window.location.origin in browser-like environments', () => {
    // jsdom provides window with origin = http://localhost
    const url = buildTrustUrl('acme-fm')
    expect(url).toMatch(/^https?:\/\/[^/]+\/trust\/acme-fm$/)
  })

  it('falls back to a relative /trust/<slug> path with no window', () => {
    const original = globalThis.window
    // @ts-expect-error — deliberately removing for this test
    delete (globalThis as { window?: unknown }).window
    try {
      const url = buildTrustUrl('acme-fm')
      expect(url).toBe('/trust/acme-fm')
    } finally {
      ;(globalThis as { window?: unknown }).window = original
    }
  })

  it('does not URL-encode the slug (slugs are already URL-safe)', () => {
    const url = buildTrustUrl('acme-fm-2026')
    expect(url).toContain('/trust/acme-fm-2026')
    expect(url).not.toContain('%')
  })
})

describe('isValidSlug', () => {
  it('accepts 3-32 char lowercase a-z 0-9 hyphens', () => {
    expect(isValidSlug('acme')).toBe(true)
    expect(isValidSlug('acme-fm')).toBe(true)
    expect(isValidSlug('acme-fm-2026')).toBe(true)
    expect(isValidSlug('a1b2c3')).toBe(true)
    expect(isValidSlug('abc')).toBe(true) // exact min
    // exact max — 32 chars
    expect(isValidSlug('a'.repeat(32))).toBe(true)
  })

  it('rejects too-short, too-long, uppercase, and disallowed chars', () => {
    expect(isValidSlug('')).toBe(false)
    expect(isValidSlug('ab')).toBe(false) // too short
    expect(isValidSlug('a'.repeat(33))).toBe(false) // too long
    expect(isValidSlug('Acme')).toBe(false) // uppercase
    expect(isValidSlug('acme_fm')).toBe(false) // underscore
    expect(isValidSlug('acme.fm')).toBe(false) // dot
    expect(isValidSlug('acme fm')).toBe(false) // space
    expect(isValidSlug('acme/fm')).toBe(false) // slash
  })

  it('rejects leading/trailing hyphens and double hyphens', () => {
    expect(isValidSlug('-acme')).toBe(false)
    expect(isValidSlug('acme-')).toBe(false)
    expect(isValidSlug('acme--fm')).toBe(false)
  })
})

describe('suggestSlug', () => {
  it('lowercases and hyphenates words', () => {
    expect(suggestSlug('Acme FM')).toBe('acme-fm')
    expect(suggestSlug('ACME Facilities Management')).toBe('acme-facilities-management')
  })

  it('strips punctuation and collapses runs', () => {
    expect(suggestSlug('Acme & Co. Ltd!')).toBe('acme-co-ltd')
    expect(suggestSlug('   Acme   ')).toBe('acme')
  })

  it('caps at 32 chars and produces a valid slug', () => {
    const long = 'A very long organisation name that exceeds the limit'
    const out = suggestSlug(long)
    expect(out.length).toBeLessThanOrEqual(32)
    expect(isValidSlug(out)).toBe(true)
  })
})
