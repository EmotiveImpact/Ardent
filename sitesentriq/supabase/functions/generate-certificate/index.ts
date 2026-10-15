// supabase/functions/generate-certificate/index.ts
//
// Edge function for binary-PDF certificate rendering.
//
// Two-path design:
//   - HTML always saved → certificates/{org}/{cert_id}.html
//   - When BROWSERLESS_TOKEN is set, the HTML is also POSTed to
//     Browserless's /pdf endpoint and the returned binary PDF is
//     uploaded to certificates/{org}/{cert_id}.pdf. The certificates
//     row is patched with both html_url + pdf_url so the UI can prefer
//     the PDF when offering downloads.
//   - When the token is missing, behaviour falls back to v1 HTML-only
//     mode — fully functional, no errors surfaced.
//
// Future-proof: swap Browserless for a self-hosted Playwright-on-
// Vercel-Function (preserves the same { html, options } request shape)
// without touching the client.
//
// Deploy with: supabase functions deploy generate-certificate
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
// Optional env: BROWSERLESS_TOKEN  (free tier at https://browserless.io/)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CERTIFICATE_KEY_SEGMENT = /^[a-zA-Z0-9_-]{1,64}$/

interface GenerateRequest {
  html: string
  filename: string
  certificate_record_id?: string
  organisation_id?: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; organisation_id: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split('.')
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isServiceRoleJwt(jwt: string): boolean {
  // Trust the JWT role claim: verify_jwt=true gateway already validated signature.
  // String equality against SUPABASE_SERVICE_ROLE_KEY broke on key rotation.
  return decodeJwtPayload(jwt)?.role === 'service_role'
}

async function resolveCallerContext(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) {
    return json({ error: 'missing_authorization' }, 401)
  }

  if (isServiceRoleJwt(jwt)) {
    return { kind: 'service_role' }
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json({ error: 'invalid_authorization' }, 401)
  }

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile?.organisation_id) {
    return json({ error: 'profile_organisation_not_found' }, 403)
  }

  return { kind: 'user', organisation_id: String(profile.organisation_id) }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let payload: GenerateRequest
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { html, filename, certificate_record_id } = payload
  if (!html || !filename) {
    return json({ error: 'Missing required fields: html, filename' }, 400)
  }

  if (certificate_record_id && !CERTIFICATE_KEY_SEGMENT.test(certificate_record_id)) {
    return json({ error: 'Invalid certificate_record_id' }, 400)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[generate-certificate] missing supabase env')
    return json({ error: 'Server not configured' }, 500)
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  const organisation_id =
    caller.kind === 'service_role' ? payload.organisation_id : caller.organisation_id
  if (!organisation_id) {
    return json({ error: 'organisation_id required for service_role calls' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Path convention: {org_id}/{cert_id}.html|pdf so both files line up
  // with the certificates row's html_url / pdf_url columns.
  const baseKey = certificate_record_id
    ? `${organisation_id}/${certificate_record_id}`
    : `${organisation_id}/${safeFileStem(filename)}`

  const htmlPath = `${baseKey}.html`
  const pdfPath = `${baseKey}.pdf`

  // 1. Save the HTML — always, regardless of whether PDF rendering succeeds.
  const { error: htmlErr } = await supabase.storage
    .from('certificates')
    .upload(htmlPath, new Blob([html], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    })

  if (htmlErr) {
    console.error('[generate-certificate] html upload failed', htmlErr)
    return json({ error: htmlErr.message }, 500)
  }

  // 2. PDF rendering via Browserless (only when token is configured).
  //
  // The Browserless /pdf endpoint accepts { html, options } and returns
  // the raw PDF bytes in the response body. We forward A4 + 16mm margins
  // + printBackground to match the @page rules baked into wrapCertificateHtml.
  //
  // Future swap: a self-hosted Vercel/Node Function with Playwright
  // exposing the same request shape would be a drop-in replacement here.
  let pdfStored: string | null = null
  let pdfSignedUrl: string | null = null
  let pdfError: string | null = null
  const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN')

  if (browserlessToken) {
    try {
      const pdfRes = await fetch(
        `https://chrome.browserless.io/pdf?token=${encodeURIComponent(browserlessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html,
            options: {
              format: 'A4',
              printBackground: true,
              margin: {
                top: '16mm',
                right: '16mm',
                bottom: '16mm',
                left: '16mm',
              },
            },
          }),
        },
      )

      if (!pdfRes.ok) {
        const body = await pdfRes.text().catch(() => '')
        throw new Error(
          `Browserless ${pdfRes.status}: ${body.slice(0, 200) || pdfRes.statusText}`,
        )
      }

      const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
      const { error: pdfUploadErr } = await supabase.storage
        .from('certificates')
        .upload(pdfPath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (pdfUploadErr) {
        throw new Error(`PDF upload failed: ${pdfUploadErr.message}`)
      }

      pdfStored = pdfPath

      const { data: pdfSigned } = await supabase.storage
        .from('certificates')
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 7)
      pdfSignedUrl = pdfSigned?.signedUrl ?? null
    } catch (err) {
      // Non-fatal: we still saved HTML. Surface the error in the
      // response payload so the caller can show a soft warning.
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[generate-certificate] PDF rendering failed:', msg)
      pdfError = msg
    }
  }

  // 3. Update the certificates row with both URLs (when we have an id).
  if (certificate_record_id) {
    const { error: updateErr } = await supabase
      .from('certificates')
      .update({
        html_url: htmlPath,
        ...(pdfStored ? { pdf_url: pdfStored } : {}),
      })
      .eq('id', certificate_record_id)
      .eq('organisation_id', organisation_id)
    if (updateErr) {
      console.warn(
        '[generate-certificate] row update failed (non-fatal):',
        updateErr,
      )
    }
  }

  // 4. Return signed URLs valid for 7 days. The UI prefers `pdf_url`
  //    when available, falls back to `signed_url` (HTML).
  const { data: signedHtml } = await supabase.storage
    .from('certificates')
    .createSignedUrl(htmlPath, 60 * 60 * 24 * 7)

  return json(
    {
      ok: true,
      html_url: htmlPath,
      pdf_url: pdfStored,
      signed_url: signedHtml?.signedUrl ?? null,
      signed_pdf_url: pdfSignedUrl,
      pdf_render_mode: browserlessToken ? 'browserless' : 'html_only',
      pdf_error: pdfError,
      note: pdfStored
        ? 'Binary PDF rendered via Browserless and stored alongside HTML.'
        : browserlessToken
          ? 'PDF rendering attempted but failed — see pdf_error. HTML saved.'
          : 'BROWSERLESS_TOKEN unset — HTML saved only. Set the secret to enable binary PDFs.',
    },
    200,
  )
})

// ── helpers ─────────────────────────────────────────────
function stripExtension(name: string): string {
  const ix = name.lastIndexOf('.')
  return ix > 0 ? name.slice(0, ix) : name
}

function safeFileStem(name: string): string {
  const cleaned = stripExtension(name)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64)
  return cleaned || 'certificate'
}
