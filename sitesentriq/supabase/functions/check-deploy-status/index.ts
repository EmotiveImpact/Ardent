// supabase/functions/check-deploy-status/index.ts
//
// Surfaces the latest production GitHub deployment status for the
// SiteSentriq repo so the in-app DX panel can warn devs when CI/CD
// has fallen over for the latest commit.
//
// Auth model: caller must present a valid Supabase JWT. We don't
// gate by role here — the UI does that (super_admin only on the
// dashboard, gentle banner on health). Anyone authenticated can
// see the status.
//
// Server-side ENV:
//   GITHUB_TOKEN — PAT or fine-grained token with `repo:status`
//                  scope (or `repo` for private repos like ours).
//                  Without it, GitHub rate-limits to 60/hr/IP and
//                  private repos return 404 — so for SiteSentriq
//                  this IS effectively required.
//   GITHUB_REPO  — owner/name slug, defaults to EmotiveImpact/SiteSentriq.
//
// Response shape:
//   { unconfigured: true } when GITHUB_TOKEN is missing
//   { commit_sha, state, environment, target_url, created_at, description }
//
// Deploy:
//   supabase functions deploy check-deploy-status

// Deno.serve is the recommended Supabase Edge Function pattern since
// runtime upgrade in 2024 — the old `deno.land/std/http/server` import
// is what was producing BOOT_ERROR on cold starts.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? ''
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') ?? 'EmotiveImpact/SiteSentriq'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface DeployStatusResponse {
  unconfigured?: boolean
  commit_sha?: string
  state?: 'success' | 'failure' | 'error' | 'pending' | 'in_progress' | 'queued' | 'inactive' | 'unknown'
  environment?: string
  target_url?: string | null
  created_at?: string
  description?: string | null
}

function jsonResponse(payload: DeployStatusResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      // Deploy state changes on the order of minutes — 5s of edge cache
      // is plenty to absorb dashboard mounts without being stale.
      'Cache-Control': 'public, max-age=5',
    },
  })
}

async function ghFetch(path: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sitesentriq-deploy-status',
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  return fetch(`https://api.github.com${path}`, { headers })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  // Auth — verify caller JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return new Response('Missing bearer token', { status: 401, headers: CORS_HEADERS })
  }
  if (SUPABASE_URL && ANON_KEY) {
    const verify = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await verify.auth.getUser(jwt)
    if (error || !data?.user) {
      return new Response('Invalid token', { status: 401, headers: CORS_HEADERS })
    }
  }

  // Without a GitHub token we can't reliably read this private repo,
  // and we'd hit anonymous rate limits fast. Tell the UI to hide.
  if (!GITHUB_TOKEN) {
    return jsonResponse({ unconfigured: true })
  }

  try {
    // 1. Latest deployment.
    const depRes = await ghFetch(`/repos/${GITHUB_REPO}/deployments?per_page=1`)
    if (!depRes.ok) {
      // Treat as unconfigured rather than 500 — keeps the banner quiet
      // when the token is bad / scope is missing instead of nagging users.
      return jsonResponse({ unconfigured: true })
    }
    const deployments = (await depRes.json()) as Array<{
      id: number
      sha: string
      environment: string
    }>
    if (!Array.isArray(deployments) || deployments.length === 0) {
      return jsonResponse({ unconfigured: true })
    }
    const latest = deployments[0]

    // 2. Latest status for that deployment.
    const statusRes = await ghFetch(
      `/repos/${GITHUB_REPO}/deployments/${latest.id}/statuses?per_page=1`,
    )
    if (!statusRes.ok) {
      return jsonResponse({ unconfigured: true })
    }
    const statuses = (await statusRes.json()) as Array<{
      state: DeployStatusResponse['state']
      target_url: string | null
      log_url?: string | null
      created_at: string
      description: string | null
      environment?: string
    }>
    if (!Array.isArray(statuses) || statuses.length === 0) {
      // Deployment exists but no status yet — treat as queued.
      return jsonResponse({
        commit_sha: latest.sha,
        state: 'queued',
        environment: latest.environment,
        target_url: null,
        created_at: new Date().toISOString(),
        description: 'Deployment created, awaiting status.',
      })
    }
    const s = statuses[0]
    return jsonResponse({
      commit_sha: latest.sha,
      state: s.state ?? 'unknown',
      environment: s.environment ?? latest.environment,
      target_url: s.log_url ?? s.target_url ?? null,
      created_at: s.created_at,
      description: s.description,
    })
  } catch (err) {
    console.error('check-deploy-status: GitHub fetch failed', err)
    return jsonResponse({ unconfigured: true })
  }
})
