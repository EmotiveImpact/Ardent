// src/lib/certificates/types.ts
// Shared types for compliance certificate generation.
//
// Certificate templates render print-style HTML using these data
// shapes. Keep this module dependency-free so it can be imported on
// either side of the print-window boundary.

export type CertificateType =
  | 'gas_safety'
  | 'eicr'
  | 'fra'
  | 'generic'

/** A single test row on a certificate (e.g. "RCD trip test", "Pass"). */
export interface CertificateResultRow {
  /** Short label — printed in the first column of the results table. */
  label: string
  /** Free-form value (reading, observation). */
  value?: string
  /** Pass / fail / N/A for the row, controls the badge colour. */
  outcome?: 'pass' | 'fail' | 'observation' | 'na'
  /** Optional notes shown beneath the value. */
  notes?: string
}

/** A defect / observation captured during the inspection. */
export interface CertificateDefect {
  code?: string
  description: string
  severity?: 'C1' | 'C2' | 'C3' | 'FI' | 'observation' | 'major' | 'minor'
  recommendation?: string
}

/** Engineer accreditation snapshot embedded on the cert. */
export interface CertificateEngineerAccreditation {
  type: string
  registration_number?: string | null
  expiry_date?: string | null
}

/**
 * Full payload passed into a certificate template. The shape is
 * deliberately flat — every template can ignore fields it doesn't
 * use, and every consumer can build it from the data it has on hand.
 */
export interface CertificateData {
  /** Auto-generated machine number, e.g. GS-NWPM-00042. */
  certificate_number: string
  /** Human title shown at the top of the cert. */
  title: string
  /** Date the inspection / test was carried out. ISO yyyy-mm-dd. */
  test_date: string
  /** When the next inspection is due (drives compliance follow-up). */
  next_due?: string
  /** pass / fail / observation. */
  outcome?: 'pass' | 'fail' | 'observation'

  organisation: {
    name: string
    logo_url?: string | null
    slug?: string | null
    address?: string | null
  }

  client: {
    name: string
    address?: string | null
  }

  property: {
    name: string
    address?: string | null
  }

  asset?: {
    name: string
    category?: string | null
    make?: string | null
    model?: string | null
    serial_number?: string | null
  } | null

  engineer: {
    name: string
    email?: string | null
    phone?: string | null
    trade?: string | null
    signature_image_url?: string | null
    accreditations?: CertificateEngineerAccreditation[]
  }

  results: CertificateResultRow[]
  defects: CertificateDefect[]
  /** Free-form observations / declarations text block. */
  observations?: string
  /** Standard declaration text printed near the signature. */
  declaration?: string
}
