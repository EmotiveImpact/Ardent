// supabase/functions/audit-export/index.ts
//
// Streams a CSV export of `audit_log_view` rows matching the caller's
// filter state. Capped at 10,000 rows in v1 to keep memory predictable.
// Larger exports should switch to async/email-when-ready.
//
// Auth model: the JWT of the calling user is used to query the view —
// RLS on the underlying tables takes care of multi-tenant isolation
// AND restricts the view to org_admin / super_admin / auditor (which
// is also enforced by the `audit:export` permission gate in the UI).
//
// Deploy:
//   supabase functions deploy audit-export

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const EXPORT_CAP = 10_000
const PAGE_SIZE = 1_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AuditFilters {
  fromDate?: string
  toDate?: string
  actorIds?: string[]
  actionPrefixes?: string[]
  entityTypes?: string[]
  severities?: ('info' | 'warning' | 'critical')[]
  search?: string
}

interface ReqBody {
  filters?: AuditFilters
}

interface AuditRow {
  id: string
  organisation_id: string
  actor_user_id: string | null
  actor_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  severity: string
  source: string
  created_at: string
}

const CSV_HEADERS = [
  'created_at',
  'severity',
  'action',
  'actor_email',
  'actor_user_id',
  'entity_type',
  'entity_id',
  'summary',
  'source',
  'ip_address',
  'user_agent',
  'metadata',
]

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowToCsv(r: AuditRow): string {
  return [
    r.created_at,
    r.severity,
    r.action,
    r.actor_email,
    r.actor_user_id,
    r.entity_type,
    r.entity_id,
    r.summary,
    r.source,
    r.ip_address,
    r.user_agent,
    r.metadata,
  ]
    .map(escapeCsv)
    .join(',')
}

function escapeLike(value: string): string {
  return value.replace(/[,()*]/g, ' ')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return new Response('Missing bearer token', {
      status: 401,
      headers: CORS_HEADERS,
    })
  }

  let body: ReqBody = {}
  try {
    body = (await req.json()) as ReqBody
  } catch {
    // Empty body is fine — defaults to no filters.
  }
  const filters = body.filters ?? {}

  // Verify the caller is authenticated. We use the user's JWT for the
  // actual data fetch so RLS gates the rows correctly.
  const verify = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await verify.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return new Response('Invalid token', {
      status: 401,
      headers: CORS_HEADERS,
    })
  }

  // Build the base query against audit_log_view, mirroring the UI's
  // PostgREST filter logic.
  function buildQuery() {
    let q = verify
      .from('audit_log_view')
      .select('*')
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
      const orParts = filters.actionPrefixes
        .map((p) => `action.ilike.${escapeLike(p)}.%`)
        .join(',')
      q = q.or(orParts)
    }
    if (filters.search && filters.search.trim()) {
      const term = `%${escapeLike(filters.search.trim())}%`
      q = q.or(
        `summary.ilike.${term},action.ilike.${term},actor_email.ilike.${term}`,
      )
    }
    return q
  }

  // Stream the CSV in 1k-row chunks.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        controller.enqueue(encoder.encode(CSV_HEADERS.join(',') + '\n'))

        let offset = 0
        let fetched = 0
        while (offset < EXPORT_CAP) {
          const upper = Math.min(offset + PAGE_SIZE, EXPORT_CAP) - 1
          const { data, error } = await buildQuery().range(offset, upper)
          if (error) {
            controller.enqueue(encoder.encode(`# error: ${error.message}\n`))
            break
          }
          const rows = (data ?? []) as AuditRow[]
          if (rows.length === 0) break
          const chunk = rows.map(rowToCsv).join('\n') + '\n'
          controller.enqueue(encoder.encode(chunk))
          fetched += rows.length
          if (rows.length < PAGE_SIZE) break
          offset += PAGE_SIZE
        }

        if (fetched >= EXPORT_CAP) {
          controller.enqueue(
            encoder.encode(
              `# truncated at ${EXPORT_CAP} rows — narrow filters or request async export\n`,
            ),
          )
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(new TextEncoder().encode(`# error: ${msg}\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})
