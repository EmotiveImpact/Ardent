// src/lib/certificates/templates/eicr.tsx
// Electrical Installation Condition Report (BS 7671 style).

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

function OutcomeBanner({ outcome }: { outcome?: CertificateData['outcome'] }) {
  if (!outcome) return null
  const map = {
    pass: {
      label: 'Satisfactory — installation suitable for continued use',
      colour: BRAND.pass,
    },
    fail: {
      label: 'Unsatisfactory — remedial action required',
      colour: BRAND.fail,
    },
    observation: {
      label: 'Satisfactory with observations',
      colour: BRAND.observation,
    },
  } as const
  const v = map[outcome]
  if (!v) return null
  return (
    <div
      style={{
        background: v.colour,
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '6px',
        fontWeight: 600,
        fontSize: '13px',
        marginBottom: '20px',
      }}
    >
      {v.label}
    </div>
  )
}

export function EicrTemplate({ data }: { data: CertificateData }) {
  return (
    <CertificatePage>
      <CertificateHeader
        data={data}
        subtitle="Electrical Installation Condition Report (BS 7671)"
      />
      <OutcomeBanner outcome={data.outcome} />
      <PartiesSection data={data} />
      <Section title="Schedule of Inspections & Test Results">
        <ResultsTable rows={data.results} itemLabel="Circuit / item" />
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
