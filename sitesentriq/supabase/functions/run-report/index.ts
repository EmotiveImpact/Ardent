// supabase/functions/run-report/index.ts
//
// Server-side report runner used by:
//   1. The "Export" button in the builder UI (one-shot json/csv/pdf)
//   2. The pg_cron / scheduled-runner (for scheduled reports — see ops note)
//
// POST { template_id?, definition?, dataset?, format }
//
// - If `template_id` is supplied → loads the saved template (RLS verifies access)
// - Otherwise the inline `{ dataset, definition }` is used
//
// Returns:
//   format='json' → application/json (max 1000 rows)
//   format='csv'  → text/csv          (max 10000 rows)
//   format='pdf'  → text/html         (printable HTML — true PDF deferred)
//   format='html' → text/html         (alias of pdf for clarity)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const MAX_JSON_ROWS = 1000
const MAX_CSV_ROWS = 10000
const MAX_PDF_ROWS = 5000

// Read permissions per role — mirror of apps/web/src/lib/permissions.ts,
// limited to the permissions the DATASETS below actually declare. RLS is
// org-scoped but NOT role-scoped, so without this an engineer could POST
// { dataset: 'invoices' } and pull the whole org's financials, or
// { dataset: 'engineers' } for the staff roster with emails. The builder UI
// hides those datasets by permission; the function has to enforce it.
const ROLE_READ_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['jobs:read', 'compliance:read', 'properties:read', 'users:read', 'invoices:read', 'quotes:read', 'reports:read'],
  org_admin: ['jobs:read', 'compliance:read', 'properties:read', 'users:read', 'invoices:read', 'quotes:read', 'reports:read'],
  scheduler: ['jobs:read', 'compliance:read', 'properties:read', 'reports:read'],
  finance: ['properties:read', 'invoices:read', 'quotes:read', 'reports:read'],
  engineer: ['jobs:read', 'compliance:read', 'properties:read', 'reports:read'],
  client_admin: ['compliance:read', 'properties:read', 'invoices:read', 'quotes:read', 'reports:read'],
  auditor: ['compliance:read', 'properties:read', 'reports:read'],
  tenant_user: ['compliance:read', 'quotes:read', 'reports:read'],
}

/** Raw `role` claim from the caller's JWT (service_role bypasses the check). */
function jwtRole(req: Request): string | null {
  const jwt = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return null
  const [, payload] = jwt.split('.')
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return (JSON.parse(atob(padded)) as Record<string, unknown>).role as string ?? null
  } catch {
    return null
  }
}

// ── Dataset registry (mirror of src/lib/reports/datasets.ts) ─

interface DatasetDef {
  table: string
  permission: string
  fields: { key: string; relation?: { table: string; display: string } }[]
}

const DATASETS: Record<string, DatasetDef> = {
  jobs: {
    table: 'jobs',
    permission: 'jobs:read',
    fields: [
      { key: 'title' }, { key: 'description' }, { key: 'status' }, { key: 'priority' },
      { key: 'sla_priority' }, { key: 'job_type' }, { key: 'scheduled_date' },
      { key: 'completed_date' }, { key: 'is_out_of_hours' }, { key: 'created_at' },
      { key: 'property_id', relation: { table: 'properties', display: 'name' } },
    ],
  },
  compliance_items: {
    table: 'compliance_items',
    permission: 'compliance:read',
    fields: [
      { key: 'name' }, { key: 'compliance_type' }, { key: 'frequency' }, { key: 'status' },
      { key: 'last_completed' }, { key: 'next_due' }, { key: 'created_at' },
      { key: 'property_id', relation: { table: 'properties', display: 'name' } },
      { key: 'asset_id', relation: { table: 'assets', display: 'name' } },
    ],
  },
  properties: {
    table: 'properties',
    permission: 'properties:read',
    fields: [
      { key: 'name' }, { key: 'address' }, { key: 'site_type' }, { key: 'archived_at' }, { key: 'created_at' },
      { key: 'client_id', relation: { table: 'clients', display: 'name' } },
    ],
  },
  engineers: {
    table: 'engineers',
    permission: 'users:read',
    fields: [
      { key: 'name' }, { key: 'email' }, { key: 'engineer_type' }, { key: 'is_active' }, { key: 'created_at' },
    ],
  },
  invoices: {
    table: 'invoices',
    permission: 'invoices:read',
    fields: [
      { key: 'invoice_number' }, { key: 'status' }, { key: 'subtotal' }, { key: 'tax' },
      { key: 'total' }, { key: 'due_date' }, { key: 'paid_date' }, { key: 'created_at' },
      { key: 'client_id', relation: { table: 'clients', display: 'name' } },
    ],
  },
  quotes: {
    table: 'quotes',
    permission: 'quotes:read',
    fields: [
      { key: 'quote_number' }, { key: 'status' }, { key: 'quote_type' }, { key: 'subtotal' },
      { key: 'total' }, { key: 'valid_until' }, { key: 'created_at' },
      { key: 'client_id', relation: { table: 'clients', display: 'name' } },
    ],
  },
  actions: {
    table: 'actions',
    permission: 'compliance:read',
    fields: [
      { key: 'title' }, { key: 'description' }, { key: 'status' }, { key: 'priority' },
      { key: 'due_date' }, { key: 'created_at' },
      { key: 'property_id', relation: { table: 'properties', display: 'name' } },
    ],
  },
  audit_log: {
    table: 'timeline_events',
    permission: 'reports:read',
    fields: [
      { key: 'event_type' }, { key: 'description' }, { key: 'created_at' },
      { key: 'property_id', relation: { table: 'properties', display: 'name' } },
      { key: 'client_id', relation: { table: 'clients', display: 'name' } },
      { key: 'job_id', relation: { table: 'jobs', display: 'title' } },
      { key: 'user_id', relation: { table: 'profiles', display: 'full_name' } },
    ],
  },
}

// ── Types ─────────────────────────────────────────────

interface ReportFilter {
  field: string
  operator: string
  value?: string
  value_to?: string
}

interface ReportSort {
  field: string
  direction: 'asc' | 'desc'
}

interface ReportDefinition {
  filters: ReportFilter[]
  columns: string[]
  sort: ReportSort[]
  group: string[]
}

// ── Helpers ───────────────────────────────────────────

function resolveDateValue(raw: string | undefined): string | undefined {
  if (!raw) return raw
  const m = /^now([+\-])(\d+)([dhmw])$/.exec(raw.trim())
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

function buildSelect(dataset: DatasetDef, columns: string[]): string {
  const cols = columns.length ? columns : dataset.fields.map((f) => f.key)
  const parts: string[] = ['id']
  for (const col of cols) {
    const f = dataset.fields.find((x) => x.key === col)
    if (!f) continue
    parts.push(col)
    if (f.relation) parts.push(`${f.relation.table}:${col}(${f.relation.display})`)
  }
  return Array.from(new Set(parts)).join(',')
}

// deno-lint-ignore no-explicit-any
function applyFilters(query: any, filters: ReportFilter[]): any {
  for (const f of filters) {
    const value = resolveDateValue(f.value)
    switch (f.operator) {
      case 'equals':
        if (value === 'true' || value === 'false') query = query.eq(f.field, value === 'true')
        else query = query.eq(f.field, value)
        break
      case 'not_equals': query = query.neq(f.field, value); break
      case 'contains': query = query.ilike(f.field, `%${value ?? ''}%`); break
      case 'in': {
        const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (list.length) query = query.in(f.field, list)
        break
      }
      case 'not_in': {
        const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (list.length) query = query.not(f.field, 'in', `(${list.map((v) => `"${v}"`).join(',')})`)
        break
      }
      case 'between': {
        if (value) query = query.gte(f.field, value)
        const to = resolveDateValue(f.value_to)
        if (to) query = query.lte(f.field, to)
        break
      }
      case 'before': query = query.lt(f.field, value); break
      case 'after':  query = query.gt(f.field, value); break
      case 'gte':    query = query.gte(f.field, value); break
      case 'lte':    query = query.lte(f.field, value); break
      case 'is_null':     query = query.is(f.field, null); break
      case 'is_not_null': query = query.not(f.field, 'is', null); break
    }
  }
  return query
}

function flattenCell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const first = Object.values(obj).find((v) => v != null)
    return first != null ? String(first) : ''
  }
  return String(value)
}

function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  if (!rows.length) return columns.join(',')
  const headers = columns.length ? columns : Object.keys(rows[0])
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(flattenCell(r[h]))).join(',')),
  ]
  return lines.join('\n')
}

// Escape user-controlled text before interpolating into the HTML report. The
// rows carry free-text fields (job/property/client names, descriptions) and the
// template name/description are user-set — without escaping, a stored value like
// `<img src=x onerror=…>` executes when another user opens the export (stored XSS).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rowsToHtml(
  rows: Record<string, unknown>[],
  columns: string[],
  meta: { name: string; description?: string },
): string {
  const headers = columns.length ? columns : Object.keys(rows[0] ?? {})
  const ths = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const trs = rows
    .map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(flattenCell(r[h]))}</td>`).join('')}</tr>`)
    .join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(meta.name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0f172a; padding:32px; max-width:960px; margin:0 auto; }
    h1 { font-size:20px; letter-spacing:-0.02em; margin:0 0 4px; }
    .meta { color:#64748b; font-size:12px; margin-bottom:24px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    th { background:#f8fafc; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; font-size:11px; color:#475569; }
    tr:hover td { background:#f8fafc; }
    @media print { body { padding:0; } .no-print { display:none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(meta.name)}</h1>
  <p class="meta">${escapeHtml(meta.description ?? '')} &middot; ${rows.length} rows &middot; Generated ${new Date().toLocaleString('en-GB')}</p>
  <table>
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs || `<tr><td colspan="${headers.length}" style="text-align:center;color:#94a3b8;padding:24px;">No rows match the report filters</td></tr>`}</tbody>
  </table>
</body>
</html>`
}

// ── CORS ──────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Main handler ──────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const start = performance.now()

  try {
    const body = await req.json()
    const {
      template_id,
      definition: inlineDef,
      dataset: inlineDataset,
      format = 'json',
      organisation_id: orgScope,
    } = body as {
      template_id?: string
      definition?: ReportDefinition
      dataset?: string
      format?: 'json' | 'csv' | 'pdf' | 'html'
      // Optional explicit org filter — used by the service-role scheduled runner
      // (run-scheduled-reports), since service-role bypasses RLS. Harmless for
      // user callers (RLS still applies; a foreign org id just yields no rows).
      organisation_id?: string
    }

    // Use the caller's auth — RLS will enforce read permission on
    // both the template and the underlying dataset table.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    let datasetKey = inlineDataset
    let definition: ReportDefinition = inlineDef ?? { filters: [], columns: [], sort: [], group: [] }
    let templateName = 'Custom Report'
    let templateDescription = ''

    if (template_id) {
      let tplQuery = supabase.from('report_templates').select('*').eq('id', template_id)
      if (orgScope) tplQuery = tplQuery.eq('organisation_id', orgScope)
      const { data: tpl, error } = await tplQuery.single()
      if (error || !tpl) {
        return new Response(JSON.stringify({ error: 'Template not found or not accessible' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      datasetKey = tpl.dataset
      definition = tpl.definition as ReportDefinition
      templateName = tpl.name
      templateDescription = tpl.description ?? ''
    }

    if (!datasetKey || !DATASETS[datasetKey]) {
      return new Response(JSON.stringify({ error: `Unknown dataset: ${datasetKey}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const dataset = DATASETS[datasetKey]

    // Enforce the dataset's declared permission against the caller's role.
    // The scheduled runner calls in with the service role and is trusted.
    if (jwtRole(req) !== 'service_role') {
      const { data: me } = await supabase.from('profiles').select('role').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle()
      const allowed = ROLE_READ_PERMISSIONS[me?.role ?? ''] ?? []
      if (!allowed.includes(dataset.permission)) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const limit = format === 'json' ? MAX_JSON_ROWS : format === 'csv' ? MAX_CSV_ROWS : MAX_PDF_ROWS
    const select = buildSelect(dataset, definition.columns ?? [])

    let query = supabase.from(dataset.table).select(select)
    query = applyFilters(query, definition.filters ?? [])
    // Explicit org scope for the service-role scheduled runner (applied on the
    // already-loosely-typed builder to avoid narrowing the dynamic select).
    if (orgScope) query = query.eq('organisation_id', orgScope)

    // Group-by => cluster: the grouped dimensions become leading ORDER BY keys
    // so a saved/scheduled report's CSV/PDF groups rows together. Mirrors the
    // client preview translator (apps/web/src/lib/reports/query.ts).
    const ordered = new Set<string>()
    for (const g of definition.group ?? []) {
      if (!g || ordered.has(g)) continue
      ordered.add(g)
      query = query.order(g, { ascending: true })
    }
    for (const s of definition.sort ?? []) {
      if (ordered.has(s.field)) continue
      ordered.add(s.field)
      query = query.order(s.field, { ascending: s.direction === 'asc' })
    }
    query = query.limit(limit)

    const { data, error } = await query
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const latency = Math.round(performance.now() - start)

    // Best-effort run log (don't fail the request if this errors)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organisation_id')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.organisation_id) {
          await supabase.from('report_runs').insert({
            organisation_id: profile.organisation_id,
            template_id: template_id ?? null,
            run_by_user_id: user.id,
            format,
            row_count: rows.length,
            latency_ms: latency,
          })
        }
      }
    } catch (_) { /* swallow */ }

    if (format === 'csv') {
      return new Response(rowsToCsv(rows, definition.columns ?? []), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${templateName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv"`,
        },
      })
    }

    if (format === 'pdf' || format === 'html') {
      return new Response(
        rowsToHtml(rows, definition.columns ?? [], { name: templateName, description: templateDescription }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }

    // json (default)
    return new Response(JSON.stringify({ rows, row_count: rows.length, latency_ms: latency }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[run-report] error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message ?? 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
