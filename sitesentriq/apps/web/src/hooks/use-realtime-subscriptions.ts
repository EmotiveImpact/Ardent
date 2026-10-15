import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOrganisation } from '@/hooks/use-organisation'
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'
const LOG_REALTIME = import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true'

export type RealtimeConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'idle'

export type RealtimeEventSource = 'broadcast' | 'postgres_changes'

export interface RealtimeEventSnapshot {
  table: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  source: RealtimeEventSource
  at: string
  keys: string[]
}

/**
 * Per-tenant table subscriptions. Each entry maps a Postgres table to the
 * TanStack Query keys we should invalidate when any INSERT / UPDATE / DELETE
 * fires for that org. Filter is `organisation_id=eq.<orgId>`.
 *
 * Wave 17 perf — the persistence layer (PersistQueryClientProvider in
 * main.tsx) caches query results to IndexedDB so reloads paint
 * instantly. THAT cache is only as fresh as the network round-trips
 * driving it. Realtime invalidations close the loop: when a colleague
 * mutates a row, every connected client's TanStack cache is marked
 * stale → refetched in the background → UI updates without a manual
 * refresh.
 *
 * `['dashboard']` is included as a prefix on every entity invalidation
 * because the dashboard KPI/hero-counter/needs-attention queries all
 * key off `['dashboard', ...]` and aggregate over multiple tables.
 *
 * NOTE: `notifications` is intentionally handled separately by
 * `use-realtime-notifications.ts`, which scopes by user_id and also fires
 * the toast + bell-ring callback. Duplicating it here would re-invalidate
 * for every user in the org.
 */
const TABLE_INVALIDATIONS: Array<{
  table: string
  keys: string[][]
}> = [
  // HOT operational entities only — these change often AND benefit from live
  // cross-user updates (they drive the dashboard KPIs + their own lists).
  //
  // PERF (2026-06-07): trimmed from 16 tables to these 6. Realtime polls the
  // WAL continuously and processes every change on published tables; a broad
  // 16-table publication was the dominant consumer of the project's Disk IO
  // budget (~75% of total DB time — see pg_stat_statements). The cold tables
  // below (clients, properties, assets, engineers, subcontractors,
  // maintenance_plans, documents, contracts, purchase_orders, suppliers) change
  // rarely and were removed from BOTH this client map AND the server
  // `supabase_realtime` publication (migration 00091). They now stay fresh via
  // TanStack's refetch-on-focus + staleTime, which is more than enough for
  // slow-changing reference data. Re-add a table here AND to the publication if
  // it ever needs true live updates.
  { table: 'jobs', keys: [['jobs'], ['analytics'], ['dashboard']] },
  { table: 'compliance_items', keys: [['compliance_items'], ['analytics'], ['dashboard']] },
  { table: 'actions', keys: [['actions'], ['analytics'], ['dashboard']] },
  { table: 'invoices', keys: [['invoices'], ['analytics'], ['dashboard']] },
  { table: 'quotes', keys: [['quotes'], ['analytics'], ['dashboard']] },
  { table: 'timeline_events', keys: [['timeline'], ['timeline_events']] },
]

const TABLE_INVALIDATIONS_BY_TABLE = new Map(
  TABLE_INVALIDATIONS.map((entry) => [entry.table, entry]),
)

type LiveRecord = Record<string, unknown>

interface LiveChangePayload {
  table: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: LiveRecord
  old: LiveRecord
}

function isRecord(value: unknown): value is LiveRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLivePayload(
  input: unknown,
  fallbackTable?: string,
): LiveChangePayload | null {
  const envelope = isRecord(input) ? input : {}
  const body = isRecord(envelope.payload) ? envelope.payload : envelope
  const eventValue = body.eventType ?? body.event ?? body.operation ?? body.type
  const eventType = typeof eventValue === 'string' ? eventValue.toUpperCase() : ''
  if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return null

  const tableValue = body.table ?? fallbackTable
  const table = typeof tableValue === 'string' ? tableValue : ''
  if (!table) return null

  return {
    table,
    eventType,
    new: isRecord(body.new) ? body.new : isRecord(body.record) ? body.record : {},
    old: isRecord(body.old) ? body.old : isRecord(body.old_record) ? body.old_record : {},
  }
}

function removeDeletedRow(queryClient: QueryClient, queryKey: QueryKey, id: string) {
  queryClient.setQueriesData({ queryKey }, (current: unknown) => {
    if (!Array.isArray(current)) return current
    return current.filter((row) => !isRecord(row) || row.id !== id)
  })

  if (queryKey.length === 1) {
    queryClient.removeQueries({ queryKey: [queryKey[0], id], exact: true })
  }
}

function applyLiveChangeToCache(
  queryClient: QueryClient,
  payload: LiveChangePayload,
  keys: QueryKey[],
) {
  if (payload.eventType === 'DELETE') {
    const id = typeof payload.old.id === 'string' ? payload.old.id : null
    if (id) {
      keys.forEach((key) => removeDeletedRow(queryClient, key, id))
    }
  }

  keys.forEach((key) => {
    void queryClient.invalidateQueries({ queryKey: key, refetchType: 'active' })
  })
}

/**
 * Master realtime hook. Mount once at the dashboard layout level. Subscribes
 * to every table in TABLE_INVALIDATIONS, scoped to the current organisation,
 * and aggregates connection state into a single status indicator suitable
 * for a topbar pulse.
 */
export function useRealtimeSubscriptions() {
  const queryClient = useQueryClient()
  const { organisation } = useOrganisation()
  const { user } = useAuth()
  const orgId = organisation?.id
  const userId = user?.id

  const [statuses, setStatuses] = useState<Record<string, RealtimeConnectionStatus>>({})
  const [lastEvent, setLastEvent] = useState<RealtimeEventSnapshot | null>(null)
  const channelsRef = useRef<RealtimeChannel[]>([])

  const updateStatus = useCallback((table: string, status: RealtimeConnectionStatus) => {
    setStatuses((prev) => (prev[table] === status ? prev : { ...prev, [table]: status }))
  }, [])

  useEffect(() => {
    if (DEV_MODE || !orgId) return

    const filter = `organisation_id=eq.${orgId}`
    const orgBroadcastTopic = `org:${orgId}:changes`

    // Tear down any prior channels (org change / remount)
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch))
    channelsRef.current = []
    setStatuses({})
    setLastEvent(null)

    const handleLiveChange = (
      raw: unknown,
      source: RealtimeEventSource,
      fallbackTable?: string,
    ) => {
      const payload = normalizeLivePayload(raw, fallbackTable)
      if (!payload) return

      const entry = TABLE_INVALIDATIONS_BY_TABLE.get(payload.table)
      if (!entry) return
      const keys = entry.keys.map((key) => key.join('/'))

      if (LOG_REALTIME) {
        console.debug(
          `[realtime] ${source} ${payload.table} ${payload.eventType} →`,
          keys.join(', '),
        )
      }

      setLastEvent({
        table: payload.table,
        eventType: payload.eventType,
        source,
        at: new Date().toISOString(),
        keys,
      })
      applyLiveChangeToCache(queryClient, payload, entry.keys)

      // Lightweight UX: when an action's priority/status changes for
      // somebody else, surface a hint toast (not for self-initiated).
      // `actions` is delivered on BOTH transports (broadcast trigger + the
      // postgres_changes publication), so gate the toast on the broadcast
      // source only — otherwise the same change raises two identical toasts.
      // Cache invalidation above still runs for both (it's idempotent).
      if (
        source === 'broadcast' &&
        payload.table === 'actions' &&
        payload.eventType === 'UPDATE' &&
        payload.new.updated_by !== userId
      ) {
        const next = payload.new as { title?: string; status?: string; priority?: string }
        const previous = payload.old as { status?: string; priority?: string } | undefined
        if (previous && (previous.status !== next.status || previous.priority !== next.priority)) {
          toast.message(`Action updated: ${next.title ?? ''}`.trim(), {
            description: `${previous.status ?? '—'} → ${next.status ?? '—'} · ${next.priority ?? ''}`.trim(),
            duration: 3500,
          })
        }
      }
    }

    const broadcastChannel = supabase
      .channel(orgBroadcastTopic, { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, (payload) => handleLiveChange(payload, 'broadcast'))
      .on('broadcast', { event: 'UPDATE' }, (payload) => handleLiveChange(payload, 'broadcast'))
      .on('broadcast', { event: 'DELETE' }, (payload) => handleLiveChange(payload, 'broadcast'))
      .subscribe((subscriptionStatus, err) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          if (LOG_REALTIME) console.debug(`[realtime] broadcast subscribed → ${orgBroadcastTopic}`)
          updateStatus('broadcast', 'connected')
        } else if (subscriptionStatus === 'CHANNEL_ERROR') {
          if (LOG_REALTIME) console.error(`[realtime] broadcast CHANNEL_ERROR:`, err ?? '(no err detail)')
          updateStatus('broadcast', 'reconnecting')
        } else if (subscriptionStatus === 'TIMED_OUT') {
          if (LOG_REALTIME) console.warn(`[realtime] broadcast TIMED_OUT`)
          updateStatus('broadcast', 'reconnecting')
        } else if (subscriptionStatus === 'CLOSED') {
          if (LOG_REALTIME) console.warn(`[realtime] broadcast CLOSED`)
          updateStatus('broadcast', 'offline')
        }
      })

    channelsRef.current.push(broadcastChannel)

    TABLE_INVALIDATIONS.forEach(({ table }) => {
      updateStatus(table, 'connecting')

      const channel = supabase
        .channel(`fos:${table}:${orgId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            handleLiveChange({ ...payload, table }, 'postgres_changes', table)
          },
        )
        .subscribe((subscriptionStatus, err) => {
          // Diagnostic logging in prod too — surfaces silent failures
          // (CHANNEL_ERROR usually means RLS denied the subscription
          // or the user's JWT was rejected; TIMED_OUT means the WS
          // never completed the handshake — firewall / proxy issue).
          if (subscriptionStatus === 'SUBSCRIBED') {
            if (LOG_REALTIME) console.debug(`[realtime] subscribed → ${table} (org=${orgId})`)
            updateStatus(table, 'connected')
          } else if (subscriptionStatus === 'CHANNEL_ERROR') {
            if (LOG_REALTIME) console.error(`[realtime] CHANNEL_ERROR on ${table}:`, err ?? '(no err detail)')
            updateStatus(table, 'reconnecting')
          } else if (subscriptionStatus === 'TIMED_OUT') {
            if (LOG_REALTIME) console.warn(`[realtime] TIMED_OUT on ${table} — handshake never completed`)
            updateStatus(table, 'reconnecting')
          } else if (subscriptionStatus === 'CLOSED') {
            if (LOG_REALTIME) console.warn(`[realtime] CLOSED on ${table}`)
            updateStatus(table, 'offline')
          }
        })

      channelsRef.current.push(channel)
    })

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch))
      channelsRef.current = []
    }
  }, [orgId, userId, queryClient, updateStatus])

  // Aggregate per-table statuses → one indicator
  const aggregateStatus: RealtimeConnectionStatus = (() => {
    if (DEV_MODE || !orgId) return 'idle'
    const values = Object.entries(statuses)
      // Broadcast is the source of truth for instant cross-tab deletes.
      // Keep Postgres Changes statuses visible in perTable, but do not let
      // one filtered fallback channel make the topbar look disconnected.
      .filter(([key]) => key === 'broadcast' || !statuses.broadcast)
      .map(([, value]) => value)
    if (values.length === 0) return 'connecting'
    if (values.every((s) => s === 'connected')) return 'connected'
    if (values.some((s) => s === 'reconnecting')) return 'reconnecting'
    if (values.some((s) => s === 'connecting')) return 'connecting'
    if (values.every((s) => s === 'offline')) return 'offline'
    return 'reconnecting'
  })()

  return { status: aggregateStatus, perTable: statuses, lastEvent }
}
