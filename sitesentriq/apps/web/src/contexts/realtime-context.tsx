import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  useRealtimeSubscriptions,
  type RealtimeConnectionStatus,
  type RealtimeEventSnapshot,
} from '@/hooks/use-realtime-subscriptions'
import { usePresence } from '@/hooks/use-presence'

interface RealtimeCtx {
  status: RealtimeConnectionStatus
  presenceCount: number
  perTable: Record<string, RealtimeConnectionStatus>
  lastEvent: RealtimeEventSnapshot | null
}

const RealtimeContext = createContext<RealtimeCtx>({
  status: 'idle',
  presenceCount: 0,
  perTable: {},
  lastEvent: null,
})

/**
 * Mounts the org-scoped realtime subscriptions + presence channel exactly
 * once for the dashboard, and exposes the aggregate connection status and
 * presence count to descendants (topbar, etc.).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, perTable, lastEvent } = useRealtimeSubscriptions()
  const { count } = usePresence()

  const contextValue = useMemo(
    () => ({ status, presenceCount: count, perTable, lastEvent }),
    [status, count, perTable, lastEvent],
  )

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtimeContext() {
  return useContext(RealtimeContext)
}
