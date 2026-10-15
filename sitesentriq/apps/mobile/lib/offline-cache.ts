import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_PREFIX = 'haumea:read-cache:v1'
export const READ_CACHE_STALE_MS = 15 * 60 * 1000

interface CacheEnvelope<T> {
  data: T
  updatedAt: string
}

function cacheKey(userId: string, resource: string): string {
  return `${CACHE_PREFIX}:${userId}:${resource}`
}

/** Keys include auth.uid() so a shared handset never shows another engineer's data. */
export async function readOfflineCache<T>(userId: string, resource: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, resource))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>
    if (!parsed.updatedAt || !('data' in parsed)) return null
    return { data: parsed.data as T, updatedAt: parsed.updatedAt }
  } catch {
    // A corrupt/part-written cache must never stop the live query.
    return null
  }
}

export async function writeOfflineCache<T>(userId: string, resource: string, data: T): Promise<string> {
  const updatedAt = new Date().toISOString()
  await AsyncStorage.setItem(cacheKey(userId, resource), JSON.stringify({ data, updatedAt }))
  return updatedAt
}

export function cacheIsStale(updatedAt: string, now = Date.now()): boolean {
  const timestamp = new Date(updatedAt).getTime()
  return !Number.isFinite(timestamp) || now - timestamp > READ_CACHE_STALE_MS
}
