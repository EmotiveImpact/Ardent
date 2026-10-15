import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

export type EntityKind =
  | 'client'
  | 'property'
  | 'asset'
  | 'job'
  | 'compliance'
  | 'engineer'
  | 'contract'
  | 'action'
  | 'kb'
  | 'document'

export interface SearchHit {
  kind: EntityKind
  id: string
  title: string
  subtitle?: string
  path: string
}

const PER_ENTITY_LIMIT = 5
const DEBOUNCE_MS = 200

/**
 * Wraps `setTimeout` so React Query refetches only fire after the user
 * stops typing. Returns the debounced query string.
 */
export function useDebouncedValue<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}

interface SearchableTable {
  kind: EntityKind
  table: string
  columns: string
  searchFields: string[]
  toHit: (row: Record<string, unknown>) => SearchHit
}

/**
 * Each searchable entity. We use `or(...ilike.*term*)` against indexed text
 * columns and limit to 5 rows so cross-entity Promise.all stays snappy.
 */
const SEARCHABLE: SearchableTable[] = [
  {
    kind: 'client',
    table: 'clients',
    columns: 'id, name, contact_email',
    searchFields: ['name', 'contact_email'],
    toHit: (r) => ({
      kind: 'client',
      id: String(r.id),
      title: String(r.name ?? 'Untitled client'),
      subtitle: (r.contact_email as string) || undefined,
      path: `/dashboard/clients/${r.id}`,
    }),
  },
  {
    kind: 'property',
    table: 'properties',
    columns: 'id, name, address, site_type',
    searchFields: ['name', 'address'],
    toHit: (r) => ({
      kind: 'property',
      id: String(r.id),
      title: String(r.name ?? 'Untitled property'),
      subtitle: (r.address as string) || (r.site_type as string) || undefined,
      path: `/dashboard/properties/${r.id}`,
    }),
  },
  {
    kind: 'asset',
    table: 'assets',
    columns: 'id, name, category, serial_number',
    searchFields: ['name', 'serial_number', 'category'],
    toHit: (r) => ({
      kind: 'asset',
      id: String(r.id),
      title: String(r.name ?? 'Untitled asset'),
      subtitle: [r.category, r.serial_number].filter(Boolean).join(' · ') || undefined,
      path: `/dashboard/assets/${r.id}`,
    }),
  },
  {
    kind: 'job',
    table: 'jobs',
    columns: 'id, title, status, scheduled_date',
    searchFields: ['title', 'status'],
    toHit: (r) => ({
      kind: 'job',
      id: String(r.id),
      title: String(r.title ?? 'Untitled job'),
      subtitle: [r.status, r.scheduled_date].filter(Boolean).join(' · ') || undefined,
      path: `/dashboard/jobs/${r.id}`,
    }),
  },
  {
    kind: 'compliance',
    table: 'compliance_items',
    columns: 'id, name, compliance_type, status',
    searchFields: ['name', 'compliance_type'],
    toHit: (r) => ({
      kind: 'compliance',
      id: String(r.id),
      title: String(r.name ?? 'Compliance item'),
      subtitle: [r.compliance_type, r.status].filter(Boolean).join(' · ') || undefined,
      path: `/dashboard/compliance/${r.id}`,
    }),
  },
  {
    kind: 'engineer',
    table: 'engineers',
    columns: 'id, name, email, trade',
    searchFields: ['name', 'email', 'trade'],
    toHit: (r) => ({
      kind: 'engineer',
      id: String(r.id),
      title: String(r.name ?? 'Engineer'),
      subtitle: [r.trade, r.email].filter(Boolean).join(' · ') || undefined,
      path: `/dashboard/engineers/${r.id}`,
    }),
  },
  {
    kind: 'contract',
    table: 'contracts',
    columns: 'id, services_included, status, end_date',
    searchFields: ['services_included', 'status'],
    toHit: (r) => ({
      kind: 'contract',
      id: String(r.id),
      title: String(r.services_included ?? 'Contract').slice(0, 60) || 'Contract',
      subtitle: [r.status, r.end_date].filter(Boolean).join(' · ') || undefined,
      path: `/dashboard/contracts/${r.id}`,
    }),
  },
  {
    kind: 'action',
    table: 'actions',
    columns: 'id, title, status, priority',
    searchFields: ['title', 'status'],
    toHit: (r) => ({
      kind: 'action',
      id: String(r.id),
      title: String(r.title ?? 'Action'),
      subtitle: [r.priority, r.status].filter(Boolean).join(' · ') || undefined,
      path: `/dashboard/actions/${r.id}`,
    }),
  },
  {
    kind: 'kb',
    table: 'kb_articles',
    columns: 'id, title, category',
    searchFields: ['title', 'category'],
    toHit: (r) => ({
      kind: 'kb',
      id: String(r.id),
      title: String(r.title ?? 'Article'),
      subtitle: (r.category as string) || undefined,
      path: `/dashboard/knowledge-base/${r.id}`,
    }),
  },
  {
    kind: 'document',
    table: 'documents',
    columns: 'id, name, document_type',
    searchFields: ['name', 'document_type'],
    toHit: (r) => ({
      kind: 'document',
      id: String(r.id),
      title: String(r.name ?? 'Document'),
      subtitle: (r.document_type as string) || undefined,
      path: `/dashboard/documents`,
    }),
  },
]

async function searchEntity(
  entity: SearchableTable,
  query: string,
): Promise<SearchHit[]> {
  // Escape PostgREST special chars in the term so unusual queries don't crash
  const escaped = query.replace(/[%,()]/g, ' ').trim()
  if (!escaped) return []
  const orFilter = entity.searchFields.map((f) => `${f}.ilike.%${escaped}%`).join(',')

  const { data, error } = await supabase
    .from(entity.table)
    .select(entity.columns)
    .or(orFilter)
    .limit(PER_ENTITY_LIMIT)

  if (error) {
     
    console.warn(`[search:${entity.table}]`, error.message)
    return []
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return rows.map((row) => entity.toHit(row))
}

/**
 * Universal search across every searchable entity, parallelised with
 * Promise.all and limited per entity. Returns flat results grouped client-side.
 */
export function useUniversalSearch(rawQuery: string) {
  const query = useDebouncedValue(rawQuery.trim(), DEBOUNCE_MS)

  return useQuery({
    queryKey: ['universal-search', query],
    enabled: query.length >= 2 && !DEV_MODE,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchHit[]> => {
      const start = performance.now()
      const results = await Promise.all(SEARCHABLE.map((e) => searchEntity(e, query)))
      const flat = results.flat()
      const elapsed = performance.now() - start
      if (elapsed > 750) {
         
        console.info(`[universal-search] ${flat.length} hits in ${elapsed.toFixed(0)}ms`)
      }
      return flat
    },
  })
}

export const ENTITY_LABELS: Record<EntityKind, string> = {
  client: 'Clients',
  property: 'Properties',
  asset: 'Assets',
  job: 'Jobs',
  compliance: 'Compliance',
  engineer: 'Engineers',
  contract: 'Contracts',
  action: 'Actions',
  kb: 'Knowledge Base',
  document: 'Documents',
}

/** Stable display order for grouped results. */
export const ENTITY_ORDER: EntityKind[] = [
  'client',
  'property',
  'asset',
  'job',
  'compliance',
  'action',
  'engineer',
  'contract',
  'kb',
  'document',
]
