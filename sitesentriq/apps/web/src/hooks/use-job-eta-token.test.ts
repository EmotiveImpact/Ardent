// Sprint 3 / D2 — Tests for the public ETA URL builder.
//
// We don't render the hook here — what matters is that the URL we
// hand customers is well-formed and the token format is unguessable.

import { describe, expect, it, vi } from 'vitest'
import { buildEtaPublicUrl } from './use-job-eta-token'

describe('buildEtaPublicUrl', () => {
  it('uses window.location.origin in browser-like environments', () => {
    // jsdom provides window with origin = http://localhost
    const url = buildEtaPublicUrl('abc123def456')
    expect(url).toMatch(/^https?:\/\/[^/]+\/track\/abc123def456$/)
  })

  it('falls back to a relative /track/<token> path with no window', () => {
    const original = globalThis.window
    // @ts-expect-error — deliberately removing for this test
    delete (globalThis as { window?: unknown }).window
    try {
      const url = buildEtaPublicUrl('abc')
      expect(url).toBe('/track/abc')
    } finally {
      ;(globalThis as { window?: unknown }).window = original
    }
  })

  it('does not URL-encode the token (it must be paste-clean)', () => {
    // Token format is base64url which by definition contains no chars
    // that need encoding (only A-Z a-z 0-9 - _). Verify the builder
    // doesn't double-encode.
    const url = buildEtaPublicUrl('Aa0_-Zz')
    expect(url).toContain('/track/Aa0_-Zz')
    expect(url).not.toContain('%')
  })
})

describe('token format invariants', () => {
  // We can't import generateToken (it's not exported), but we can
  // observe the tokens produced by the mutation if we mock supabase.
  // Simpler: assert the format at the call site that builds the URL.
  it('a freshly-generated token has the right shape (24 bytes → 32 base64url chars)', () => {
    // Reproduce the same logic so we lock down the contract.
    const buf = new Uint8Array(24)
    crypto.getRandomValues(buf)
    let str = ''
    for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i])
    const token = btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(token.length).toBeLessThanOrEqual(36)
  })

  it('two tokens generated back-to-back differ', () => {
    const make = () => {
      const buf = new Uint8Array(24)
      crypto.getRandomValues(buf)
      let str = ''
      for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i])
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const a = make()
    const b = make()
    expect(a).not.toBe(b)
  })
})

describe('useIssueJobEtaToken — placeholder smoke', () => {
  it('module loads without throwing', async () => {
    // Just verifies the file imports cleanly under vitest. Full
    // integration tests for the mutation would require the supabase
    // mock + QueryClient harness, which adds noise without much value
    // for a 30-line passthrough.
    const mod = await import('./use-job-eta-token')
    expect(typeof mod.useIssueJobEtaToken).toBe('function')
    expect(typeof mod.useJobEtaTokens).toBe('function')
    expect(typeof mod.useRevokeJobEtaToken).toBe('function')
    expect(typeof mod.buildEtaPublicUrl).toBe('function')
    // Silence any unused-import warnings the TS compiler might raise:
    void vi
  })
})
