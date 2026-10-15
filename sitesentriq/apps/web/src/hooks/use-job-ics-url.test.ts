// Strategic 2 / S2 — Tests for the ICS subscription URL builder.
//
// We test pure URL shape only — no network, no React. The edge
// function deployment is verified separately via curl.

import { describe, expect, it } from 'vitest'
import { buildIcsUrl, buildWebcalUrl } from './use-job-ics-url'

describe('buildIcsUrl', () => {
  it('returns the path-param URL shape under /functions/v1/public-job-eta-ics/<token>', () => {
    const url = buildIcsUrl('Aa0_-Zz_token_with_32_chars_aaaa')
    expect(url).toMatch(
      /^https?:\/\/[^/]+\/functions\/v1\/public-job-eta-ics\/Aa0_-Zz_token_with_32_chars_aaaa$/,
    )
  })

  it('encodeURIComponents the token to defend against unexpected chars', () => {
    // Real tokens are base64url so this is a no-op for them, but a
    // caller passing "/" or "?" must not break the URL shape.
    const url = buildIcsUrl('weird/token?with=stuff')
    expect(url).toContain('weird%2Ftoken%3Fwith%3Dstuff')
    // Ensure NO PII / query string snuck in:
    expect(url).not.toContain('?')
    expect(url).not.toContain('&')
  })

  it('contains no PII or job-identifying data — only the opaque token', () => {
    // The whole reason for using a token is so the customer URL
    // carries nothing about the property, engineer, address, or org.
    const token = 'tok_abc123def456ghi789jkl0'
    const url = buildIcsUrl(token)
    expect(url).not.toMatch(/property|engineer|address|client|email|name/i)
    expect(url).toContain(`/${token}`)
  })
})

describe('buildWebcalUrl', () => {
  it('swaps the protocol for one-tap macOS/iOS import', () => {
    const https = buildIcsUrl('abc')
    const webcal = buildWebcalUrl('abc')
    expect(webcal.startsWith('webcal://')).toBe(true)
    // Path remains identical apart from protocol so calendar clients
    // resolve to the same resource.
    expect(webcal.slice('webcal://'.length)).toBe(https.replace(/^https?:\/\//, ''))
  })
})
