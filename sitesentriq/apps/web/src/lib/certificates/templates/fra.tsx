// src/lib/certificates/templates/fra.tsx
// Fire Risk Assessment summary (Regulatory Reform (Fire Safety)
// Order 2005). This is a high-level summary, not a substitute for
// a full multi-page FRA — but covers the headline data needed for
// a printable record/cover sheet.

import type { CertificateData } from '../types'
import {
  BRAND,
  CertificateFooter,
  CertificateHeader,
  CertificatePage,
  DefectsSection,
  PartiesSection,
  ResultsTable,
  Section,
  SignatureBlock,
} from './shared'

function RiskRating({ outcome }: { outcome?: CertificateData['outcome'] }) {
  const map = {
    pass: { label: 'Tolerable risk', colour: BRAND.pass },
    observation: { label: 'Moderate risk — actions advised', colour: BRAND.observation },
    fail: { label: 'High risk — immediate action required', colour: BRAND.fail },
  } as const
  const v = outcome ? map[outcome] : null
  if (!v) return null
  return (
    <div
      style={{
        display: 'inline-block',
        background: v.colour,
        color: '#fff',
        padding: '8px 16px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        marginBottom: '16px',
      }}
    >
      Overall risk: {v.label}
    </div>
  )
}

export function FraTemplate({ data }: { data: CertificateData }) {
  return (
    <CertificatePage>
      <CertificateHeader
        data={data}
        subtitle="Fire Risk Assessment summary (RR(FS)O 2005)"
      />
      <RiskRating outcome={data.outcome} />
      <PartiesSection data={data} />
      <Section title="Significant Findings">
        <ResultsTable rows={data.results} itemLabel="Finding" />
      </Section>
      <DefectsSection
        defects={data.defects}
        observations={data.observations}
      />
      <SignatureBlock data={data} />
      <CertificateFooter data={data} />
    </CertificatePage>
  )
}
