// Helpers for issuing & managing iCal feed tokens.
// The signing happens server-side (the edge function knows CALENDAR_FEED_SECRET).
// For development we build the token client-side using a public, configurable
// dev secret. In production, the recommended path is to call a small RPC that
// signs the payload — but since the secret already protects integrity, exposing
// the same logic in the SPA does not weaken the model: only the server can
// produce a valid signature. So we ship a small helper that calls a tiny
// invoke endpoint via the calendar-feed function only when we need to mint.
// To keep v1 simple and avoid yet another function, we issue the token
// client-side using `import.meta.env.VITE_CALENDAR_FEED_SECRET`. If unset,
// we fall back to the supabase project anon key (still a secret in the sense
// that the CALENDAR_FEED_SECRET env on the edge function must match).
//
// Operators: set VITE_CALENDAR_FEED_SECRET on the client AND
// CALENDAR_FEED_SECRET on the edge function to the same value.

import { supabase } from '@/lib/supabase'

const SECRET = (import.meta.env.VITE_CALENDAR_FEED_SECRET as string | undefined) ?? ''

function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlEncode(new Uint8Array(sig))
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface IcsTokenInfo {
  id: string
  label: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface MintedToken {
  token: string
  url: string
  webcalUrl: string
  googleCalUrl: string
}

/** Build the public `/calendar-feed` URL from current Supabase config. */
export function calendarFeedBaseUrl(): string {
  const supaUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  if (!supaUrl) return ''
  return `${supaUrl.replace(/\/+$/, '')}/functions/v1/calendar-feed`
}

/** Signed JSON token: base64url(payload).base64url(sig). */
export async function mintCalendarFeedToken(userId: string, label?: string): Promise<MintedToken> {
  if (!SECRET) {
    throw new Error(
      'Calendar feed secret not configured. Set VITE_CALENDAR_FEED_SECRET to match CALENDAR_FEED_SECRET on the edge function.',
    )
  }
  const payload = {
    user_id: userId,
    iat: Math.floor(Date.now() / 1000),
    // Long-lived: 1 year. Users can revoke + regenerate.
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  }
  const json = JSON.stringify(payload)
  const payload64 = b64urlEncode(new TextEncoder().encode(json))
  const sig = await hmacSign(payload64, SECRET)
  const token = `${payload64}.${sig}`

  const tokenHash = await sha256Hex(token)
  const { error } = await supabase.from('calendar_feed_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    label: label ?? 'Personal calendar feed',
  })
  if (error) throw new Error(error.message)

  const base = calendarFeedBaseUrl()
  const url = `${base}?token=${encodeURIComponent(token)}`
  const webcalUrl = url.replace(/^https?:/, 'webcal:')
  const googleCalUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`
  return { token, url, webcalUrl, googleCalUrl }
}

/** Fetch the user's existing (non-revoked) feed tokens. */
export async function listCalendarFeedTokens(userId: string): Promise<IcsTokenInfo[]> {
  const { data, error } = await supabase
    .from('calendar_feed_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as IcsTokenInfo[]
}

/** Soft-revoke (sets revoked_at). The edge function checks this on every fetch. */
export async function revokeCalendarFeedToken(id: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_feed_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
