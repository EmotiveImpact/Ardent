// src/lib/certificates/index.ts
// Public surface for the certificates module.

export type {
  CertificateData,
  CertificateDefect,
  CertificateResultRow,
  CertificateType,
} from './types'

export {
  buildCertificate,
  generateCertificate,
  type GenerateCertificateInput,
} from './generate'

export {
  inferCertificateType,
  renderCertificateTemplate,
  TEMPLATE_META,
} from './templates'

export { wrapCertificateHtml } from './wrap-html'

import { supabase } from '@/lib/supabase'

/**
 * Get a 7-day signed URL for an existing certificate's HTML.
 */
export async function getCertificateSignedUrl(
  htmlPath: string,
): Promise<string> {
  const { data } = await supabase.storage
    .from('certificates')
    .createSignedUrl(htmlPath, 60 * 60 * 24 * 7)
  return data?.signedUrl ?? ''
}
