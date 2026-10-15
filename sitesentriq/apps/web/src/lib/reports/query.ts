/**
 * Query translator — turns a saved report definition into a Supabase query.
 * Used by the live preview in the builder UI and by the run-report edge function.
 */

import { supabase } from '@/lib/supabase'
import { getDataset, type FilterOperator, type Dataset } from './datasets'

export interface ReportFilter {
  field: string
  operator: FilterOperator
  value?: string
  value_to?: string // for `between`
}

export interface ReportSort {
  field: string
  direction: 'asc' | 'desc'
}

export interface ReportDefinition {
  filters: ReportFilter[]
  columns: string[]
  sort: ReportSort[]
  group: string[]
}

export const EMPTY_DEFINITION: ReportDefinition = {
  filters: [],
  columns: [],
  sort: [],
  group: [],
}

/**
 * Resolve a relative date string of the form "now+30d", "now-90d", "now-1m"
 * into an ISO timestamp. Plain ISO strings pass through untouched.
 */
function resolveDateValue(raw: string | undefined): string | undefined {
  if (!raw) return raw
  const m = /^now([+-])(\d+)([dhmw])$/.exec(raw.trim())
  if (!m) return raw
  const sign = m[1] === '-' ? -1 : 1
  const n = parseInt(m[2], 10) * sign
  const unit = m[3]
  const d = new Date()
  if (unit === 'd') d.setDate(d.getDate() + n)
  else if (unit === 'h') d.setHours(d.getHours() + n)
  else if (unit === 'w') d.setDate(d.getDate() + n * 7)
  else if (unit === 'm') d.setMonth(d.getMonth() + n)
  return d.toISOString()
}

/**
 * Build a select-list string for `supabase.from(...).select(...)`.
 * Includes any relation displays so we get the human-friendly name back.
 */
export function buildSelect(dataset: Dataset, columns: string[]): string {
  const cols = columns.length ? columns : dataset.fields.map((f) => f.key)
  const parts: string[] = ['id']
  for (const col of cols) {
    const f = dataset.fields.find((x) => x.key === col)
    if (!f) continue
    if (f.type === 'relation' && f.relation) {
      // PostgREST embedded relation
      parts.push(`${col}`)
      parts.push(`${f.relation.table}:${col}(${f.relation.display})`)
    } else {
      parts.push(col)
    }
  }
  // De-dup
  return Array.from(new Set(parts)).join(',')
}

/**
 * Apply a list of filters onto a Supabase query builder.
 * Each operator maps to PostgREST.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters(query: any, filters: ReportFilter[]): any {
  for (const f of filters) {
    const value = resolveDateValue(f.value)
    switch (f.operator) {
      case 'equals':
        if (value === 'true' || value === 'false') {
          query = query.eq(f.field, value === 'true')
        } else {
          query = query.eq(f.field, value)
        }
        break
      case 'not_equals':
        query = query.neq(f.field, value)
        break
      case 'contains':
        query = query.ilike(f.field, `%${value ?? ''}%`)
        break
      case 'in': {
        const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (list.length) query = query.in(f.field, list)
        break
      }
      case 'not_in': {
        const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (list.length) {
          query = query.not(f.field, 'in', `(${list.map((v) => `"${v}"`).join(',')})`)
        }
        break
      }
      case 'between': {
        if (value) query = query.gte(f.field, value)
        const to = resolveDateValue(f.value_to)
        if (to) {
          // Date inputs yield a bare YYYY-MM-DD; against a timestamptz column an
          // .lte resolves to that day's 00:00 and excludes the whole end day.
          // Extend a date-only upper bound to end-of-day (mirrors use-advanced-
          // reports.ts). Numeric/other values pass through untouched.
          const upper = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999` : to
          query = query.lte(f.field, upper)
        }
        break
      }
      case 'before':
        query = query.lt(f.field, value)
        break
      case 'after':
        query = query.gt(f.field, value)
        break
      case 'gte':
        query = query.gte(f.field, value)
        break
      case 'lte':
        query = query.lte(f.field, value)
        break
      case 'is_null':
        query = query.is(f.field, null)
        break
      case 'is_not_null':
        query = query.not(f.field, 'is', null)
        break
    }
  }
  return query
}

export interface RunResult {
  rows: Record<string, unknown>[]
  rowCount: number
  latencyMs: number
  error?: string
}

/**
 * Execute a report definition against Supabase. Used directly by the live
 * preview in the builder. Returns up to `limit` rows.
 */
export async function runReport(
  datasetKey: string,
  definition: ReportDefinition,
  limit = 50,
): Promise<RunResult> {
  const start = performance.now()
  const dataset = getDataset(datasetKey)
  if (!dataset) {
    return { rows: [], rowCount: 0, latencyMs: 0, error: `Unknown dataset: ${datasetKey}` }
  }

  try {
    const select = buildSelect(dataset, definition.columns)
    let query = supabase.from(dataset.table).select(select, { count: 'exact' })
    query = applyFilters(query, definition.filters)

    // Group-by: PostgREST exposes no GROUP BY for arbitrary row selects and the
    // builder defines no aggregations, so grouping is realised as CLUSTERING —
    // the grouped dimensions become leading ORDER BY keys so rows belonging to
    // the same group sit together in the preview / CSV / PDF. (The drop zone was
    // persisted in the definition but previously never applied, so dragging a
    // field into "Group by" silently did nothing.)
    const ordered = new Set<string>()
    for (const g of definition.group) {
      if (!g || ordered.has(g)) continue
      ordered.add(g)
      query = query.order(g, { ascending: true })
    }
    for (const s of definition.sort) {
      if (ordered.has(s.field)) continue
      ordered.add(s.field)
      query = query.order(s.field, { ascending: s.direction === 'asc' })
    }
    query = query.limit(limit)

    const { data, error, count } = await query
    if (error) {
      return { rows: [], rowCount: 0, latencyMs: Math.round(performance.now() - start), error: error.message }
    }
    return {
      rows: (data ?? []) as unknown as Record<string, unknown>[],
      rowCount: count ?? data?.length ?? 0,
      latencyMs: Math.round(performance.now() - start),
    }
  } catch (err) {
    return {
      rows: [],
      rowCount: 0,
      latencyMs: Math.round(performance.now() - start),
      error: (err as Error).message,
    }
  }
}

/**
 * Format a single cell value for display.
 */
export function formatCell(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    // Embedded relation row, e.g. { name: 'Acme' }
    const obj = value as Record<string, unknown>
    const first = Object.values(obj).find((v) => v != null)
    return first != null ? String(first) : '—'
  }
  // Format both timestamptz (…T…) and date-only (YYYY-MM-DD) columns.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    try {
      return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return value
    }
  }
  return String(value)
}

/**
 * Resolve the DISPLAY value for a report cell. For a `relation` field the row
 * carries BOTH the raw id (`property_id`) and the embedded row (`properties:{name}`);
 * the table/CSV/PDF previously printed the raw UUID. Pick the embed for relations.
 */
export function cellDisplay(
  row: Record<string, unknown>,
  fieldKey: string,
  field?: { type?: string; relation?: { table: string } },
): string {
  if (field?.type === 'relation' && field.relation) {
    const embed = row[field.relation.table]
    if (embed != null) return formatCell(embed)
  }
  return formatCell(row[fieldKey])
}
