// src/lib/certificates/templates/generic.tsx
// Generic Inspection Certificate — fallback for any compliance type
// without a dedicated template (legionella, asbestos surveys, lift
// LOLER inspections, emergency lighting, etc.).

import type { CertificateData } from '../types'
import {
  CertificateFooter,
  CertificateHeader,
  CertificatePage,
  DefectsSection,
  PartiesSection,
  ResultsTable,
  Section,
  SignatureBlock,
} from './shared'

export function GenericTemplate({ data }: { data: CertificateData }) {
  return (
    <CertificatePage>
      <CertificateHeader data={data} subtitle="Inspection certificate" />
      <PartiesSection data={data} />
      <Section title="Inspection Results">
        <ResultsTable rows={data.results} />
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
