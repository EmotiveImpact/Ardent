/**
 * Per-user GPS consent gate for field mode.
 *
 * Stored in localStorage under `fos:field-gps-consent:{user_id}`.
 * Values: 'granted' | 'declined' | undefined (never asked).
 *
 * The consent banner is shown the first time GPS would be invoked. The
 * "Disable location" toggle in profile settings sets value to 'declined'.
 */

const KEY_PREFIX = 'fos:field-gps-consent:'

export type ConsentValue = 'granted' | 'declined'

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function getGpsConsent(userId: string | undefined): ConsentValue | null {
  if (!userId) return null
  const ls = safeStorage()
  if (!ls) return null
  const v = ls.getItem(key(userId))
  return v === 'granted' || v === 'declined' ? v : null
}

export function setGpsConsent(userId: string | undefined, value: ConsentValue): void {
  if (!userId) return
  const ls = safeStorage()
  if (!ls) return
  ls.setItem(key(userId), value)
}

export function clearGpsConsent(userId: string | undefined): void {
  if (!userId) return
  const ls = safeStorage()
  if (!ls) return
  ls.removeItem(key(userId))
}
