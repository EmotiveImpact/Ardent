import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value) }),
  },
}))

import { cacheIsStale, readOfflineCache, writeOfflineCache } from '../offline-cache'

beforeEach(() => storage.clear())

describe('offline read cache', () => {
  it('keeps the same resource isolated per signed-in user', async () => {
    await writeOfflineCache('engineer-a', 'my-jobs', [{ id: 'job-a' }])
    await writeOfflineCache('engineer-b', 'my-jobs', [{ id: 'job-b' }])

    expect((await readOfflineCache<Array<{ id: string }>>('engineer-a', 'my-jobs'))?.data[0].id).toBe('job-a')
    expect((await readOfflineCache<Array<{ id: string }>>('engineer-b', 'my-jobs'))?.data[0].id).toBe('job-b')
  })

  it('marks data stale after the field cache window', () => {
    const updatedAt = '2026-08-08T10:00:00.000Z'
    expect(cacheIsStale(updatedAt, new Date('2026-08-08T10:10:00.000Z').getTime())).toBe(false)
    expect(cacheIsStale(updatedAt, new Date('2026-08-08T10:16:00.000Z').getTime())).toBe(true)
  })

  it('ignores corrupt cache entries', async () => {
    storage.set('haumea:read-cache:v1:engineer-a:job:1', '{broken')
    await expect(readOfflineCache('engineer-a', 'job:1')).resolves.toBeNull()
  })
})
