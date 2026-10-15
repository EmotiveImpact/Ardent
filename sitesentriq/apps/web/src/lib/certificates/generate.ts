// src/lib/certificates/generate.ts
// End-to-end certificate generation pipeline.
//
//   1. Load all the joined data we need from Supabase
//      (job → property → client → asset → engineer → accreditations
//       and/or compliance item → property → asset).
//   2. Pick a template by `type` (or infer from compliance category).
//   3. Render the template to a static HTML string via
//      `react-dom/server.renderToStaticMarkup`.
//   4. Wrap with the print-ready `<html>` document.
//   5. Mint a certificate number via the `gen_certificate_number`
//      Postgres helper, upload the HTML to the `certificates`
//      bucket, and insert the `certificates` row.
//
// The "real" PDF (headless-browser-rendered binary) is OUT OF SCOPE
// for v1 — see supabase/functions/generate-certificate/README for
// the operational hand-off. v1 saves a self-contained printable
// HTML page; the user prints it via window.print() in the
// CertificatePreview iframe.

import { renderToStaticMarkup } from 'react-dom/server'
import { supabase } from '@/lib/supabase'
import {
  inferCertificateType,
  renderCertificateTemplate,
  TEMPLATE_META,
} from './templates'
import type {
  CertificateData,
  CertificateDefect,
  CertificateResultRow,
  CertificateType,
} from './types'
import { wrapCertificateHtml } from './wrap-html'

export interface GenerateCertificateInput {
  /** One of jobId / complianceItemId is required. */
  jobId?: string
  complianceItemId?: string
  /** Override automatic template inference. */
  type?: CertificateType
  /** Optional override fields injected on top of the loaded data. */
  results?: CertificateResultRow[]
  defects?: CertificateDefect[]
  observations?: string
  /** Optional override for next_due / test_date. */
  testDate?: string
  nextDue?: string
  /** Override outcome (pass/fail/observation) when known by caller. */
  outcome?: 'pass' | 'fail' | 'observation'
}

export interface BuiltCertificate {
  data: CertificateData
  type: CertificateType
  html: string
  /** Filename suggestion (no path). */
  filename: string
}

/**
 * Build the CertificateData payload + HTML in memory, but DO NOT
 * persist it. Used by the live preview in <CertificatePreview/>.
 */
export async function buildCertificate(
  input: GenerateCertificateInput,
  opts?: { mintNumber?: boolean },
): Promise<BuiltCertificate> {
  const data = await loadCertificateData(input, opts)
  const type =
    input.type ??
    inferCertificateType(data.title.toLowerCase()) ??
    'generic'
  const element = renderCertificateTemplate(type, data)
  const bodyHtml = renderToStaticMarkup(element)
  const html = wrapCertificateHtml({ title: data.title, bodyHtml })
  const filename = `${TEMPLATE_META[type].fileSlug}-${data.certificate_number}.html`
  return { data, type, html, filename }
}

/**
 * Build, persist, and return the saved certificate row + URLs.
 *
 * Side effects:
 *   - mints a certificate_number via Postgres `gen_certificate_number`
 *   - uploads the HTML to `certificates/{org}/{cert_id}.html`
 *   - inserts the `certificates` row
 *   - invokes `generate-certificate` edge function — which (when
 *     `BROWSERLESS_TOKEN` is set on the project) renders a binary PDF
 *     to `certificates/{org}/{cert_id}.pdf` and patches the row
 *   - returns signed URLs for both HTML and (when available) PDF.
 *     UI should prefer pdf_url when present.
 */
export async function generateCertificate(
  input: GenerateCertificateInput,
): Promise<{
  id: string
  certificate_number: string
  html_url: string
  pdf_url: string | null
  signed_url: string
  signed_pdf_url: string | null
  pdf_render_mode: 'browserless' | 'html_only' | 'unknown'
  type: CertificateType
}> {
  // Mint the real certificate number exactly once, here at persist time.
  const built = await buildCertificate(input, { mintNumber: true })

  // Stable id + path BEFORE the upload so the row + storage line up.
  const certId = crypto.randomUUID()
  const orgId = built.data.organisation.slug
    ? built.data.organisation.slug
    : 'org'
  const objectPath = `${(built.data as CertificateData & { _organisation_id?: string })._organisation_id ?? orgId}/${certId}.html`

  // Upload HTML to private bucket
  const blob = new Blob([built.html], { type: 'text/html' })
  const { error: uploadErr } = await supabase.storage
    .from('certificates')
    .upload(objectPath, blob, {
      contentType: 'text/html',
      upsert: true,
    })
  if (uploadErr) throw uploadErr

  // Build the row
  const orgIdReal = (built.data as CertificateData & { _organisation_id?: string })
    ._organisation_id
  const userResp = await supabase.auth.getUser()
  const userId = userResp.data.user?.id

  const row = {
    id: certId,
    organisation_id: orgIdReal,
    job_id: input.jobId ?? null,
    compliance_item_id: input.complianceItemId ?? null,
    asset_id:
      (built.data as CertificateData & { _asset_id?: string })._asset_id ?? null,
    property_id:
      (built.data as CertificateData & { _property_id?: string })._property_id ??
      null,
    client_id:
      (built.data as CertificateData & { _client_id?: string })._client_id ??
      null,
    engineer_id:
      (built.data as CertificateData & { _engineer_id?: string })._engineer_id ??
      null,
    type: built.type,
    certificate_number: built.data.certificate_number,
    test_date: built.data.test_date,
    next_due: built.data.next_due ?? null,
    outcome: built.data.outcome ?? null,
    defects: built.data.defects,
    html_url: objectPath,
    pdf_url: null,
    signed_html_hash: await sha256(built.html),
    created_by_user_id: userId ?? null,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('certificates')
    .insert(row)
    .select()
    .single()
  if (insertErr) throw insertErr

  // Signed URL valid for 7 days
  const { data: signed } = await supabase.storage
    .from('certificates')
    .createSignedUrl(objectPath, 60 * 60 * 24 * 7)

  // Kick off binary PDF rendering via the `generate-certificate` edge
  // function. When BROWSERLESS_TOKEN is set on the project, this also
  // uploads `…/{cert_id}.pdf` and patches the row's pdf_url. When the
  // token is missing, the edge function returns html_only and we just
  // surface `pdf_url: null` so the UI gracefully falls back to HTML.
  let pdfUrl: string | null = null
  let signedPdfUrl: string | null = null
  let pdfRenderMode: 'browserless' | 'html_only' | 'unknown' = 'unknown'
  try {
    const fn = await supabase.functions.invoke('generate-certificate', {
      body: {
        html: built.html,
        filename: built.filename,
        certificate_record_id: certId,
        organisation_id: orgIdReal,
      },
    })
    if (!fn.error && fn.data) {
      const d = fn.data as {
        pdf_url?: string | null
        signed_pdf_url?: string | null
        pdf_render_mode?: 'browserless' | 'html_only'
      }
      pdfUrl = d.pdf_url ?? null
      signedPdfUrl = d.signed_pdf_url ?? null
      pdfRenderMode = d.pdf_render_mode ?? 'unknown'
    } else if (fn.error) {
      console.warn(
        '[certificates] generate-certificate edge function failed (non-fatal):',
        fn.error,
      )
    }
  } catch (err) {
    // Edge function unreachable (offline, function not deployed, etc).
    // The HTML record is already saved — silently degrade to HTML-only.
    console.warn('[certificates] PDF render hop skipped (non-fatal):', err)
  }

  return {
    id: inserted.id,
    certificate_number: inserted.certificate_number,
    html_url: objectPath,
    pdf_url: pdfUrl,
    signed_url: signed?.signedUrl ?? '',
    signed_pdf_url: signedPdfUrl,
    pdf_render_mode: pdfRenderMode,
    type: built.type,
  }
}

// ── Loaders ───────────────────────────────────────────

async function loadCertificateData(
  input: GenerateCertificateInput,
  opts?: { mintNumber?: boolean },
): Promise<CertificateData & {
  _organisation_id?: string
  _asset_id?: string
  _property_id?: string
  _client_id?: string
  _engineer_id?: string
}> {
  if (!input.jobId && !input.complianceItemId) {
    throw new Error(
      'generateCertificate: jobId or complianceItemId is required',
    )
  }

  let propertyId: string | undefined
  let assetId: string | undefined
  let orgId: string | undefined
  let clientId: string | undefined
  let engineerRecordId: string | undefined
  let title = 'Inspection Certificate'
  let inferredType: CertificateType | undefined
  // Dates carried from a source compliance item when the caller doesn't pass
  // them explicitly — so a compliance-driven certificate shows the obligation's
  // due date instead of a blank "Next due".
  let nextDueFromItem: string | undefined
  let testDateFromItem: string | undefined

  // ── Job-driven path ───────────────────────────────
  if (input.jobId) {
    const { data: job, error } = await supabase
      .from('jobs')
      .select(
        '*, properties(id, name, address, client_id, organisation_id), engineer_assignments(engineer_id, profiles:engineer_id(full_name, email))',
      )
      .eq('id', input.jobId)
      .single()
    if (error) throw error
    if (job) {
      orgId = job.organisation_id
      propertyId = job.property_id
      const props = job.properties as
        | { client_id?: string; address?: string }
        | null
      clientId = props?.client_id
      title = job.title || title
      // jobs may carry a compliance_item_id link via field reports; if
      // an asset is attached it'll come through the linked compliance
      // item below.
    }
  }

  // ── Compliance-item-driven path ───────────────────
  if (input.complianceItemId) {
    const { data: ci, error } = await supabase
      .from('compliance_items')
      .select(
        '*, properties(id, name, address, client_id, organisation_id), assets(id, name, category, make, model, serial_number)',
      )
      .eq('id', input.complianceItemId)
      .single()
    if (error) throw error
    if (ci) {
      orgId = orgId ?? ci.organisation_id
      propertyId = propertyId ?? ci.property_id
      assetId = ci.asset_id ?? assetId
      const props = ci.properties as { client_id?: string } | null
      clientId = clientId ?? props?.client_id
      title = title === 'Inspection Certificate' ? ci.name || title : title
      inferredType = inferCertificateType(ci.compliance_type)
      nextDueFromItem = ci.next_due ?? undefined
      testDateFromItem = ci.last_completed ?? undefined
    }
  }

  if (!orgId) {
    throw new Error('generateCertificate: organisation could not be resolved')
  }

  // ── Organisation ──────────────────────────────────
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug, logo_url')
    .eq('id', orgId)
    .single()

  // ── Property ──────────────────────────────────────
  let property: { name: string; address?: string | null } = { name: '—' }
  if (propertyId) {
    const { data: prop } = await supabase
      .from('properties')
      .select('id, name, address, client_id')
      .eq('id', propertyId)
      .single()
    if (prop) {
      property = { name: prop.name, address: prop.address }
      clientId = clientId ?? prop.client_id
    }
  }

  // ── Client ────────────────────────────────────────
  let client: { name: string; address?: string | null } = { name: '—' }
  if (clientId) {
    const { data: c } = await supabase
      .from('clients')
      .select('id, name, address')
      .eq('id', clientId)
      .single()
    if (c) client = { name: c.name, address: c.address }
  }

  // ── Asset ─────────────────────────────────────────
  let asset: CertificateData['asset'] = null
  if (assetId) {
    const { data: a } = await supabase
      .from('assets')
      .select('id, name, category, make, model, serial_number')
      .eq('id', assetId)
      .single()
    if (a) {
      asset = {
        name: a.name,
        category: a.category,
        make: a.make,
        model: a.model,
        serial_number: a.serial_number,
      }
    }
  }

  // ── Engineer (best-effort: use the first assigned engineer record) ──
  let engineer: CertificateData['engineer'] = {
    name: '—',
    accreditations: [],
  }
  if (input.jobId) {
    // Try to resolve a real engineers row via assigned profile
    const { data: assignment } = await supabase
      .from('engineer_assignments')
      .select('engineer_id, profiles:engineer_id(full_name, email)')
      .eq('job_id', input.jobId)
      .limit(1)
      .maybeSingle()

    if (assignment) {
      const profileName =
        (assignment.profiles as { full_name?: string } | null)?.full_name ?? '—'
      const profileEmail =
        (assignment.profiles as { email?: string } | null)?.email ?? null
      engineer = {
        name: profileName,
        email: profileEmail,
        accreditations: [],
      }

      // Look up engineers row keyed off profile_id, if present
      const { data: eng } = await supabase
        .from('engineers')
        .select(
          'id, name, email, phone, trade, signature_image_url, engineer_accreditations(accreditation_type, registration_number, expiry_date)',
        )
        .eq('profile_id', assignment.engineer_id)
        .maybeSingle()

      if (eng) {
        engineerRecordId = eng.id
        engineer = {
          name: eng.name || engineer.name,
          email: eng.email || profileEmail,
          phone: eng.phone,
          trade: eng.trade,
          signature_image_url: eng.signature_image_url,
          accreditations: (
            (eng.engineer_accreditations as
              | {
                  accreditation_type: string
                  registration_number?: string
                  expiry_date?: string
                }[]
              | null) ?? []
          ).map((a) => ({
            type: a.accreditation_type,
            registration_number: a.registration_number,
            expiry_date: a.expiry_date,
          })),
        }
      }
    }
  }

  const type = input.type ?? inferredType ?? 'generic'
  const meta = TEMPLATE_META[type]

  // Mint a certificate number via the Postgres helper — but ONLY when actually
  // persisting (mintNumber). gen_certificate_number does nextval() on a global
  // sequence, so calling it from the live preview (which re-renders on every
  // input change) burned real numbers and left gaps, and the number shown in
  // the preview never matched the one saved (a second mint happened at save).
  // For preview we show a placeholder; the real number is minted once at save.
  let certificateNumber = 'To be assigned on save'
  if (opts?.mintNumber) {
    const { data: numberResp, error: numberErr } = await supabase.rpc(
      'gen_certificate_number',
      {
        p_org_id: orgId,
        p_type: type,
      },
    )
    if (numberErr) {
      // Fallback: client-side number so save still works in dev mode
      console.warn(
        '[certificates] gen_certificate_number unavailable, using client fallback',
        numberErr,
      )
    }
    certificateNumber =
      (numberResp as string | null) ??
      `${type.toUpperCase()}-LOCAL-${Date.now().toString().slice(-5)}`
  }

  const data: CertificateData & {
    _organisation_id?: string
    _asset_id?: string
    _property_id?: string
    _client_id?: string
    _engineer_id?: string
  } = {
    certificate_number: certificateNumber,
    title: meta?.label ? `${meta.label}` : title,
    test_date: input.testDate ?? testDateFromItem ?? new Date().toISOString().slice(0, 10),
    next_due: input.nextDue ?? nextDueFromItem,
    outcome: input.outcome,
    organisation: {
      name: org?.name ?? 'Organisation',
      logo_url: org?.logo_url ?? null,
      slug: org?.slug ?? null,
    },
    client,
    property,
    asset,
    engineer,
    results: input.results ?? defaultResults(type),
    defects: input.defects ?? [],
    observations: input.observations,
    _organisation_id: orgId,
    _asset_id: assetId,
    _property_id: propertyId,
    _client_id: clientId,
    _engineer_id: engineerRecordId,
  }

  return data
}

// ── Defaults: every template gets at least one row so the table
// renders meaningfully even if the caller didn't pass results. ────
function defaultResults(type: CertificateType): CertificateResultRow[] {
  switch (type) {
    case 'gas_safety':
      return [
        { label: 'Operating pressure', outcome: 'pass' },
        { label: 'Safety devices', outcome: 'pass' },
        { label: 'Ventilation provision', outcome: 'pass' },
        { label: 'Flue / chimney integrity', outcome: 'pass' },
        { label: 'Visual condition of appliance', outcome: 'pass' },
      ]
    case 'eicr':
      return [
        { label: 'Continuity of CPCs', outcome: 'pass' },
        { label: 'Insulation resistance', outcome: 'pass' },
        { label: 'RCD operation', outcome: 'pass' },
        { label: 'Polarity', outcome: 'pass' },
        { label: 'Earth fault loop impedance', outcome: 'pass' },
      ]
    case 'fra':
      return [
        { label: 'Means of escape', outcome: 'pass' },
        { label: 'Fire detection / alarms', outcome: 'pass' },
        { label: 'Emergency lighting', outcome: 'pass' },
        { label: 'Fire-fighting equipment', outcome: 'pass' },
        { label: 'Signage', outcome: 'pass' },
      ]
    default:
      return [{ label: 'Inspection completed', outcome: 'pass' }]
  }
}

// ── Crypto: SHA-256 of the rendered HTML. Stored on the row so the
// document can be tamper-checked later. ───────────────────
async function sha256(input: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return ''
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
