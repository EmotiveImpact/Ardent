// src/lib/certificates/templates/gas-safety.tsx
// CP12-style Gas Safety Certificate (UK Landlord/Homeowner).
//
// This is a simplified, brand-accurate rendering — it covers the
// information legally required on a Gas Safety Record (Gas Safety
// (Installation and Use) Regulations 1998, Reg 36(3)) without
// claiming to be the official Gas Safe Register paper form.

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

export function GasSafetyTemplate({ data }: { data: CertificateData }) {
  return (
    <CertificatePage>
      <CertificateHeader
        data={data}
        subtitle="Domestic / commercial gas safety record (CP12 style)"
      />
      <PartiesSection data={data} />
      <Section title="Appliance Inspection">
        <ResultsTable rows={data.results} itemLabel="Test item" />
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
