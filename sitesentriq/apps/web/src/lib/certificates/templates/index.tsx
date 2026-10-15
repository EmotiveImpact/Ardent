// src/lib/certificates/templates/index.tsx
// Template registry — picks the right React template by certificate
// type, with the generic template as the fallback.

import type { ReactElement } from 'react'
import type { CertificateData, CertificateType } from '../types'
import { EicrTemplate } from './eicr'
import { FraTemplate } from './fra'
import { GasSafetyTemplate } from './gas-safety'
import { GenericTemplate } from './generic'

export interface TemplateMeta {
  type: CertificateType
  label: string
  /** Used when generating the certificate filename. */
  fileSlug: string
}

export const TEMPLATE_META: Record<CertificateType, TemplateMeta> = {
  gas_safety: {
    type: 'gas_safety',
    label: 'Gas Safety Certificate (CP12)',
    fileSlug: 'gas-safety',
  },
  eicr: {
    type: 'eicr',
    label: 'Electrical Installation Condition Report',
    fileSlug: 'eicr',
  },
  fra: {
    type: 'fra',
    label: 'Fire Risk Assessment',
    fileSlug: 'fra',
  },
  generic: {
    type: 'generic',
    label: 'Generic Inspection Certificate',
    fileSlug: 'inspection',
  },
}

export function renderCertificateTemplate(
  type: CertificateType,
  data: CertificateData,
): ReactElement {
  switch (type) {
    case 'gas_safety':
      return <GasSafetyTemplate data={data} />
    case 'eicr':
      return <EicrTemplate data={data} />
    case 'fra':
      return <FraTemplate data={data} />
    case 'generic':
    default:
      return <GenericTemplate data={data} />
  }
}

/**
 * Best-effort mapping from a `compliance_items.compliance_type`
 * (which is a free-form string in the DB, but typically one of the
 * COMPLIANCE_TYPE_LABELS keys) onto a certificate template.
 */
export function inferCertificateType(
  complianceType?: string | null,
): CertificateType {
  const k = (complianceType || '').toLowerCase()
  if (k.includes('gas')) return 'gas_safety'
  if (k.includes('eicr') || k.includes('electric')) return 'eicr'
  if (k.includes('fire') || k === 'fra') return 'fra'
  return 'generic'
}
