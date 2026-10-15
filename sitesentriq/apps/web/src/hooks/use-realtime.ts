import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrganisation } from '@/hooks/use-organisation'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

const DEV_MODE = !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'
const LOG_REALTIME = import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface UseRealtimeSubscriptionOptions {
  /** Table to subscribe to */
  table: string
  /** Optional additional filter string, e.g. "user_id=eq.xxx" */
  filter?: string
  /** TanStack Query keys to invalidate on any change */
  queryKeys?: string[][]
  /** Callback for specific event handling */
  onEvent?: (event: RealtimeEvent, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
  /** Whether subscription is enabled (defaults to true) */
  enabled?: boolean
}

/**
 * Reusable hook that subscribes to Supabase Realtime postgres_changes
 * for INSERT/UPDATE/DELETE on a given table. On events, it invalidates
 * relevant TanStack Query caches and optionally calls a custom handler.
 */
export function useRealtimeSubscription({
  table,
  filter,
  queryKeys = [],
  onEvent,
  enabled = true,
}: UseRealtimeSubscriptionOptions) {
  const queryClient = useQueryClient()
  const { organisation } = useOrganisation()
  const [status, setStatus] = useState<RealtimeStatus>('disconnected')
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Stable callback ref to avoid re-subscribing when onEvent changes
  const onEventRef = useRef(onEvent)
  const queryKeysRef = useRef(queryKeys)

  useEffect(() => {
    onEventRef.current = onEvent
    queryKeysRef.current = queryKeys
  }, [onEvent, queryKeys])

  const invalidateAll = useCallback(() => {
    const keys = queryKeysRef.current
    if (keys.length > 0) {
      keys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key })
      })
    } else {
      // Default: invalidate queries matching the table name
      queryClient.invalidateQueries({ queryKey: [table] })
    }
  }, [queryClient, table])

  useEffect(() => {
    // Skip in DEV_MODE — no real Supabase connection
    if (DEV_MODE || !enabled) return

    // Build a single Supabase Realtime filter. Postgres changes currently
    // accepts one filter expression; comma-joining org + custom filters creates
    // invalid subscriptions and was why user-scoped notifications could lag.
    const orgId = organisation?.id
    const fullFilter = filter ?? (orgId ? `organisation_id=eq.${orgId}` : undefined)
    if (!fullFilter) return

    const channelName = `realtime:${table}:${fullFilter || 'all'}`

    const channelConfig: {
      event: '*'
      schema: 'public'
      table: string
      filter?: string
    } = {
      event: '*',
      schema: 'public',
      table,
    }
    if (fullFilter) {
      channelConfig.filter = fullFilter
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        channelConfig,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const eventType = payload.eventType as RealtimeEvent
          if (LOG_REALTIME) {
            console.debug(`[realtime] ${table} ${eventType}`)
          }
          // Invalidate TanStack Query cache
          invalidateAll()
          // Call custom handler
          onEventRef.current?.(eventType, payload)
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected')
        } else if (subscriptionStatus === 'CLOSED') {
          setStatus('disconnected')
        } else if (subscriptionStatus === 'CHANNEL_ERROR') {
          setStatus('error')
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [table, filter, enabled, organisation?.id, invalidateAll])

  const effectiveStatus =
    DEV_MODE || !enabled || (!filter && !organisation?.id) ? 'disconnected' : status

  return { status: effectiveStatus }
}

/**
 * Hook to track the overall Supabase Realtime connection status.
 * Aggregates multiple subscription statuses into a single indicator.
 */
export function useRealtimeStatus(statuses: RealtimeStatus[]): RealtimeStatus {
  if (statuses.length === 0) return 'disconnected'
  if (statuses.some((s) => s === 'error')) return 'error'
  if (statuses.every((s) => s === 'connected')) return 'connected'
  if (statuses.some((s) => s === 'connecting')) return 'connecting'
  return 'disconnected'
}
