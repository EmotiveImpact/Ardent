import { useState, useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import {
  drainOfflineQueue,
  listDeadLetterActions,
  listPendingActions,
  retryDeadLetters,
  subscribeOfflineQueue,
  type OfflineAction,
} from '@/lib/offline-queue'

/**
 * Single source of truth for "are we offline" + drives the offline mutation
 * queue's drain pass.
 *
 * On reconnect (NetInfo flips from offline → online) we kick `drainOfflineQueue`
 * — any pending check-in / check-out / signature / photo storage upload +
 * metadata insert that was captured while offline will be applied in FIFO
 * order. Failures stay queued for the next drain pass.
 *
 * Returns:
 *   - isOffline: whether the device currently has no internet
 *   - pending: count of queued actions awaiting drain (refreshed on every
 *              connectivity event, used by OfflineBanner to show "N pending")
 */
export function useOffline() {
  const [isOffline, setIsOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [pendingActions, setPendingActions] = useState<OfflineAction[]>([])
  const [failedActions, setFailedActions] = useState<OfflineAction[]>([])

  async function refreshQueue() {
    const [nextPending, nextFailed] = await Promise.all([
      listPendingActions(),
      listDeadLetterActions(),
    ])
    setPendingActions(nextPending)
    setFailedActions(nextFailed)
    setPending(nextPending.length)
    setFailed(nextFailed.length)
  }

  useEffect(() => {
    let prevOffline: boolean | null = null

    // Drain whenever we're online — drainOfflineQueue() no-ops on an empty queue,
    // so this is cheap. Critical for the relaunch case: an engineer makes offline
    // writes, kills the app while offline, then reopens it where signal already
    // exists — the NetInfo offline→online flip never fires that session, so without
    // a launch/foreground drain the queued work would sit in storage forever.
    async function maybeDrain() {
      try {
        const state = await NetInfo.fetch()
        if (state.isConnected && state.isInternetReachable) {
          await drainOfflineQueue().catch(() => {})
        }
      } catch {
        /* ignore */
      }
      await refreshQueue()
    }

    // On mount (app launch / first render of a screen using the banner).
    void maybeDrain()

    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !(state.isConnected && state.isInternetReachable)
      setIsOffline(offline)

      // Mid-session reconnect (offline → online).
      if (prevOffline === true && offline === false) {
        drainOfflineQueue()
          .catch(() => {/* swallow — next reconnect retries */})
          .finally(refreshQueue)
      } else {
        refreshQueue()
      }

      prevOffline = offline
    })

    // Returning to the foreground (e.g. reopened in coverage after backgrounding).
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void maybeDrain()
    })
    const unsubscribeQueue = subscribeOfflineQueue(() => { void refreshQueue() })

    return () => {
      unsubscribe()
      unsubscribeQueue()
      appStateSub.remove()
    }
  }, [])

  async function retryFailed() {
    await retryDeadLetters()
    if (!isOffline) await drainOfflineQueue().catch(() => {})
    await refreshQueue()
  }

  async function syncNow() {
    if (!isOffline) await drainOfflineQueue().catch(() => {})
    await refreshQueue()
  }

  return { isOffline, pending, failed, pendingActions, failedActions, retryFailed, syncNow }
}
