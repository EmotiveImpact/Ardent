import NetInfo from '@react-native-community/netinfo'
import { pendingCount } from '@/lib/offline-queue'

/**
 * The only connectivity/order gate for mobile mutations. Even with signal, a
 * new write queues behind older work so reconnect cannot reorder job states.
 */
export async function shouldQueueOfflineWrite(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch()
    if (!(state.isConnected && state.isInternetReachable)) return true
  } catch {
    // Let a direct attempt run; its call site still falls back to enqueue.
  }
  try {
    return (await pendingCount()) > 0
  } catch {
    return false
  }
}
