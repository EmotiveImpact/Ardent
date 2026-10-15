// src/lib/audit/queries.ts
// TanStack Query hooks + filter helpers for the audit log page.

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AuditFilters, AuditLogRow } from './types'

export const PAGE_SIZE = 50
export const EXPORT_CAP = 10_000

/**
 * Build a Supabase query against `audit_log_view` from the current
 * filter state. Caller appends `.range(...)` for pagination.
 */
function buildAuditQuery(filters: AuditFilters) {
  let q = supabase
    .from('audit_log_view')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.fromDate) q = q.gte('created_at', filters.fromDate)
  if (filters.toDate) q = q.lte('created_at', filters.toDate)

  if (filters.actorIds && filters.actorIds.length > 0) {
    q = q.in('actor_user_id', filters.actorIds)
  }

  if (filters.entityTypes && filters.entityTypes.length > 0) {
    q = q.in('entity_type', filters.entityTypes)
  }

  if (filters.severities && filters.severities.length > 0) {
    q = q.in('severity', filters.severities)
  }

  if (filters.actionPrefixes && filters.actionPrefixes.length > 0) {
    // PostgREST `or` filter: action.ilike.job.%,action.ilike.invoice.%
    const orParts = filters.actionPrefixes
      .map((p) => `action.ilike.${escapeLike(p)}.%`)
      .join(',')
    q = q.or(orParts)
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${escapeLike(filters.search.trim())}%`
    // Search summary and the JSON-stringified metadata. We can't do
    // ILIKE on jsonb directly — use the `metadata::text` cast via
    // PostgREST's `metadata.cs.` operator only matches JSON containment,
    // so we accept "summary" matches as the primary search and rely on
    // the action column for keywords too.
    q = q.or(`summary.ilike.${term},action.ilike.${term},actor_email.ilike.${term}`)
  }

  return q
}

function escapeLike(value: string): string {
  // PostgREST ilike chokes on commas / parens / asterisks inside values.
  return value.replace(/[,()*]/g, ' ')
}

interface AuditPage {
  rows: AuditLogRow[]
  total: number | null
  nextOffset: number | null
}

/**
 * Infinite scroll over `audit_log_view`. The cursor is a numeric offset
 * (PostgREST .range()). We page in 50-row chunks.
 */
export function useAuditLog(filters: AuditFilters) {
  return useInfiniteQuery<AuditPage, Error, InfiniteData<AuditPage>, readonly unknown[], number>({
    queryKey: ['audit_log_view', filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam ?? 0
      const { data, error, count } = await buildAuditQuery(filters)
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) throw error
      const rows = (data ?? []) as AuditLogRow[]
      const nextOffset = rows.length === PAGE_SIZE ? offset + PAGE_SIZE : null
      return { rows, total: count ?? null, nextOffset }
    },
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 15_000,
  })
}

/**
 * Loads the org's profile list for the actor multi-select. Cached
 * heavily — the list rarely changes.
 */
export function useAuditActors() {
  return useQuery({
    queryKey: ['audit_actors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name', { ascending: true })
      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        full_name: string | null
        email: string
        role: string
      }>
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Distinct action prefixes seen in the org's audit log — used to
 * populate the "Action category" multi-select.
 */
export function useAuditActionCategories() {
  return useQuery({
    queryKey: ['audit_action_categories'],
    queryFn: async () => {
      // Pull a recent slice and derive prefixes client-side. This is
      // good enough for the multi-select UX without needing a custom
      // RPC.
      const { data, error } = await supabase
        .from('audit_log_view')
        .select('action')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      const prefixes = new Set<string>()
      for (const row of data ?? []) {
        const action = (row as { action: string }).action
        const prefix = action.split('.')[0]
        if (prefix) prefixes.add(prefix)
      }
      return Array.from(prefixes).sort()
    },
    staleTime: 60_000,
  })
}

/**
 * Distinct entity types — derived from the same recent slice. We
 * piggyback on the action-categories cache window to keep round-trips
 * down.
 */
export function useAuditEntityTypes() {
  return useQuery({
    queryKey: ['audit_entity_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log_view')
        .select('entity_type')
        .not('entity_type', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      const types = new Set<string>()
      for (const row of data ?? []) {
        const t = (row as { entity_type: string | null }).entity_type
        if (t) types.add(t)
      }
      return Array.from(types).sort()
    },
    staleTime: 60_000,
  })
}
