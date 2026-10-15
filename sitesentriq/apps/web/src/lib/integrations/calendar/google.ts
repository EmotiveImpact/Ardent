// Google Calendar OAuth + sync helpers (client side).
// All heavy lifting lives in the `google-calendar-sync` edge function.
// We just (a) drive the OAuth redirect from the browser, (b) post the code
// back through the edge function, and (c) read connection state from the
// `google_calendar_tokens` table via RLS.

import { supabase } from '@/lib/supabase'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'].join(' ')

export interface GoogleCalendarConnection {
  user_id: string
  calendar_id: string | null
  connected_at: string
  last_synced_at: string | null
  last_error: string | null
}

/** Build the user-visible OAuth URL. Caller redirects the browser here. */
export function buildGoogleOAuthUrl(redirectUri: string, state: string): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/** Fetch the current user's connection row, if any. */
export async function getGoogleConnection(userId: string): Promise<GoogleCalendarConnection | null> {
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, calendar_id, connected_at, last_synced_at, last_error')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[google-calendar] fetch connection failed:', error.message)
    return null
  }
  return (data as GoogleCalendarConnection | null) ?? null
}

export async function connectGoogleCalendar(code: string, redirectUri: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'connect', code, redirect_uri: redirectUri },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'disconnect' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
}

export async function syncGoogleCalendarNow(): Promise<{ synced: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'sync' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return { synced: data?.synced ?? 0, failed: data?.failed ?? 0 }
}

/** Fire-and-forget single-job push. Never throws — UI must keep working. */
export async function syncJobToGoogleCalendar(userId: string, jobId: string): Promise<void> {
  try {
    const conn = await getGoogleConnection(userId)
    if (!conn) return
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'sync_job', job_id: jobId },
    })
  } catch (err) {
    console.warn('[google-calendar] background sync failed (ignored):', err)
  }
}
