// Resolve a subcontractor_documents.file_url to an openable URL (completes
// W2-T7 — files uploaded via the no-login work link land in the PRIVATE
// subbie-uploads bucket and were previously unreachable from staff UI).
//
// Three stored forms:
//   - full http(s) URL → legacy 'documents'-bucket public URLs → use as-is
//   - 'subbie-uploads/<path>' → work-link uploads, private bucket → sign it
//   - bare '<path>' → assume subbie-uploads and sign

import { supabase } from '@/lib/supabase'

const SIGNED_TTL_SECONDS = 60 * 60 // 1 hour

export async function resolveSubcontractorFileUrl(
  fileUrl: string | null | undefined,
): Promise<string | null> {
  if (!fileUrl) return null
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  const path = fileUrl.startsWith('subbie-uploads/')
    ? fileUrl.slice('subbie-uploads/'.length)
    : fileUrl
  const { data } = await supabase.storage.from('subbie-uploads').createSignedUrl(path, SIGNED_TTL_SECONDS)
  return data?.signedUrl ?? null
}

/** Resolve then open in a new tab. Toasts handled by the caller. */
export async function openSubcontractorFile(fileUrl: string | null | undefined): Promise<boolean> {
  const url = await resolveSubcontractorFileUrl(fileUrl)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
