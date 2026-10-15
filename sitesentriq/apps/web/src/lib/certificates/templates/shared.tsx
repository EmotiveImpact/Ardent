// src/lib/certificates/templates/shared.tsx
// Shared print-style primitives used by every certificate template.
//
// IMPORTANT: these components are rendered with `renderToStaticMarkup`
// into a self-contained HTML document. They MUST NOT depend on
// runtime CSS (Tailwind classes won't resolve in the print window —
// the brand orange / navy / Plus Jakarta Sans are baked in as inline
// styles or print CSS in `wrap-html.ts`).
//
// We intentionally use brand hex literals here rather than CSS
// custom properties so the printed output is portable (saved HTML
// files render the same colours when opened standalone, with no
// design-token loader present).

import type { ReactNode } from 'react'
import type {
  CertificateData,
  CertificateDefect,
  CertificateResultRow,
} from '../types'

// Brand palette — matches Haumea design tokens (var(--color-brand-500)
// = #08c4ae, var(--color-navy-950) = #0a1628). Hard-coded here for
// print portability.
export const BRAND = {
  orange: '#08c4ae', // brand teal accent
  navy: '#0a1628',
  textBody: '#374151',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  surface: '#f8fafc',
  pass: '#10b981',
  fail: '#dc2626',
  observation: '#f59e0b',
} as const

const DECLARATION_DEFAULT =
  'I certify that the inspection and testing detailed above has been carried out in accordance with the relevant statutory requirements and codes of practice in force at the date of issue.'

// ── Date helpers ─────────────────────────────────────────
function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ── Header ───────────────────────────────────────────────
export function CertificateHeader({
  data,
  subtitle,
}: {
  data: CertificateData
  subtitle?: string
}) {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: `2px solid ${BRAND.orange}`,
        paddingBottom: '16px',
        marginBottom: '24px',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: BRAND.orange,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {data.organisation.name}
        </div>
        <h1
          style={{
            margin: '4px 0 0',
            fontSize: '24px',
            fontWeight: 700,
            color: BRAND.navy,
            letterSpacing: '-0.01em',
          }}
        >
          {data.title}
        </h1>
        {subtitle ? (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '12px',
              color: BRAND.textMuted,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: BRAND.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Certificate #
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: BRAND.navy,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {data.certificate_number}
        </div>
      </div>
    </header>
  )
}

// ── Section helpers ──────────────────────────────────────
export function Section({
  title,
  children,
  pageBreakBefore = false,
}: {
  title: string
  children: ReactNode
  pageBreakBefore?: boolean
}) {
  return (
    <section
      style={{
        marginBottom: '20px',
        ...(pageBreakBefore ? { pageBreakBefore: 'always' } : {}),
      }}
    >
      <h2
        style={{
          margin: '0 0 8px',
          fontSize: '11px',
          fontWeight: 700,
          color: BRAND.navy,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px 24px',
        fontSize: '12px',
        color: BRAND.textBody,
      }}
    >
      {children}
    </div>
  )
}

export function Field({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: BRAND.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '2px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '12px', color: BRAND.navy }}>
        {value || '—'}
      </div>
    </div>
  )
}

// ── Property + client + asset blocks ────────────────────
export function PartiesSection({ data }: { data: CertificateData }) {
  return (
    <Section title="Site & Parties">
      <FieldGrid>
        <Field label="Client" value={data.client.name} />
        <Field label="Property" value={data.property.name} />
        <Field
          label="Client address"
          value={data.client.address || data.property.address || '—'}
        />
        <Field
          label="Property address"
          value={data.property.address || '—'}
        />
        {data.asset ? (
          <>
            <Field label="Asset" value={data.asset.name} />
            <Field label="Category" value={data.asset.category || '—'} />
            <Field
              label="Make / model"
              value={
                [data.asset.make, data.asset.model]
                  .filter(Boolean)
                  .join(' / ') || '—'
              }
            />
            <Field
              label="Serial number"
              value={data.asset.serial_number || '—'}
            />
          </>
        ) : null}
        <Field label="Test date" value={formatDate(data.test_date)} />
        <Field label="Next due" value={formatDate(data.next_due)} />
      </FieldGrid>
    </Section>
  )
}

// ── Results table ────────────────────────────────────────
function ResultBadge({ outcome }: { outcome: CertificateResultRow['outcome'] }) {
  const map: Record<NonNullable<CertificateResultRow['outcome']>, { bg: string; label: string }> = {
    pass: { bg: BRAND.pass, label: 'Pass' },
    fail: { bg: BRAND.fail, label: 'Fail' },
    observation: { bg: BRAND.observation, label: 'Obs' },
    na: { bg: BRAND.textMuted, label: 'N/A' },
  }
  const v = outcome ? map[outcome] : null
  if (!v) return <span style={{ color: BRAND.textMuted }}>—</span>
  return (
    <span
      style={{
        display: 'inline-block',
        background: v.bg,
        color: '#fff',
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '999px',
      }}
    >
      {v.label}
    </span>
  )
}

export function ResultsTable({
  rows,
  itemLabel = 'Item',
}: {
  rows: CertificateResultRow[]
  itemLabel?: string
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: BRAND.textMuted, margin: 0 }}>
        No test items recorded.
      </p>
    )
  }
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '12px',
        color: BRAND.textBody,
      }}
    >
      <thead>
        <tr>
          {[itemLabel, 'Reading / value', 'Outcome', 'Notes'].map((h) => (
            <th
              key={h}
              style={{
                textAlign: 'left',
                fontSize: '10px',
                fontWeight: 700,
                color: BRAND.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '8px 10px',
                borderBottom: `1px solid ${BRAND.border}`,
                background: BRAND.surface,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.label}-${i}`}>
            <td
              style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${BRAND.border}`,
                fontWeight: 500,
                color: BRAND.navy,
              }}
            >
              {r.label}
            </td>
            <td
              style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${BRAND.border}`,
              }}
            >
              {r.value || '—'}
            </td>
            <td
              style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${BRAND.border}`,
              }}
            >
              <ResultBadge outcome={r.outcome} />
            </td>
            <td
              style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${BRAND.border}`,
                color: BRAND.textMuted,
              }}
            >
              {r.notes || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Defects ──────────────────────────────────────────────
export function DefectsSection({
  defects,
  observations,
}: {
  defects: CertificateDefect[]
  observations?: string
}) {
  if (defects.length === 0 && !observations) return null
  return (
    <Section title="Observations & Defects" pageBreakBefore={defects.length > 4}>
      {defects.length > 0 ? (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            color: BRAND.textBody,
            marginBottom: observations ? '12px' : 0,
          }}
        >
          <thead>
            <tr>
              {['Code', 'Severity', 'Description', 'Recommendation'].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: BRAND.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      padding: '8px 10px',
                      borderBottom: `1px solid ${BRAND.border}`,
                      background: BRAND.surface,
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {defects.map((d, i) => (
              <tr key={`${d.code ?? 'def'}-${i}`}>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${BRAND.border}`,
                    color: BRAND.navy,
                    fontWeight: 500,
                  }}
                >
                  {d.code || '—'}
                </td>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${BRAND.border}`,
                  }}
                >
                  {d.severity || '—'}
                </td>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${BRAND.border}`,
                  }}
                >
                  {d.description}
                </td>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${BRAND.border}`,
                    color: BRAND.textMuted,
                  }}
                >
                  {d.recommendation || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {observations ? (
        <div
          style={{
            background: BRAND.surface,
            border: `1px solid ${BRAND.border}`,
            borderRadius: '6px',
            padding: '12px 14px',
            fontSize: '12px',
            color: BRAND.textBody,
            whiteSpace: 'pre-wrap',
          }}
        >
          {observations}
        </div>
      ) : null}
    </Section>
  )
}

// ── Engineer signature block ─────────────────────────────
export function SignatureBlock({ data }: { data: CertificateData }) {
  const accreditations = data.engineer.accreditations || []
  return (
    <Section title="Engineer & Declaration">
      <p
        style={{
          fontSize: '11px',
          color: BRAND.textBody,
          lineHeight: 1.6,
          margin: '0 0 16px',
        }}
      >
        {data.declaration || DECLARATION_DEFAULT}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: BRAND.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '4px',
            }}
          >
            Engineer
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: BRAND.navy,
            }}
          >
            {data.engineer.name}
          </div>
          {data.engineer.trade ? (
            <div style={{ fontSize: '11px', color: BRAND.textMuted, marginTop: '2px' }}>
              {data.engineer.trade}
            </div>
          ) : null}
          {accreditations.length > 0 ? (
            <ul
              style={{
                margin: '8px 0 0',
                padding: 0,
                listStyle: 'none',
                fontSize: '11px',
                color: BRAND.textBody,
              }}
            >
              {accreditations.map((a, i) => (
                <li key={`${a.type}-${i}`} style={{ padding: '2px 0' }}>
                  <strong>{a.type}</strong>
                  {a.registration_number ? ` · ${a.registration_number}` : ''}
                  {a.expiry_date ? ` · exp. ${formatDate(a.expiry_date)}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: BRAND.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '4px',
            }}
          >
            Signature
          </div>
          {data.engineer.signature_image_url ? (
            <img
              src={data.engineer.signature_image_url}
              alt="Engineer signature"
              style={{
                maxHeight: '64px',
                maxWidth: '220px',
                marginLeft: 'auto',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                height: '64px',
                borderBottom: `1px solid ${BRAND.navy}`,
                width: '220px',
                marginLeft: 'auto',
              }}
            />
          )}
          <div
            style={{
              fontSize: '11px',
              color: BRAND.textMuted,
              marginTop: '4px',
            }}
          >
            Signed {formatDate(data.test_date)}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Footer ───────────────────────────────────────────────
export function CertificateFooter({ data }: { data: CertificateData }) {
  return (
    <footer
      style={{
        marginTop: '32px',
        paddingTop: '12px',
        borderTop: `1px solid ${BRAND.border}`,
        fontSize: '10px',
        color: BRAND.textMuted,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>{data.organisation.name}</span>
      <span>{data.certificate_number}</span>
      <span>Generated {formatDate(new Date().toISOString())}</span>
    </footer>
  )
}

// ── Outer page chrome ────────────────────────────────────
export function CertificatePage({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: BRAND.textBody,
        padding: '32px 40px',
        maxWidth: '820px',
        margin: '0 auto',
        background: '#fff',
      }}
    >
      {children}
    </main>
  )
}
