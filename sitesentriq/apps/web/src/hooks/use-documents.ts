import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { uploadFile, deleteFile } from '@/lib/storage'
import { logTimelineEvent } from '@/lib/timeline'
import { TIMELINE_EVENT_TYPES } from '@/lib/constants'
import type { DocumentWithRelations } from '@haumea/types'

const DOCUMENTS_BUCKET = 'documents'
const SIGNED_URL_TTL = 60 * 60 // 1 hour

/**
 * Extract the storage object path from a stored file_url. Rows persist a
 * legacy public URL (`.../object/public/documents/{path}`); the bucket is now
 * private (migration 00059) so we re-sign for display/download.
 */
function storagePathFromFileUrl(fileUrl: string): string | null {
  const parts = fileUrl.split(`/${DOCUMENTS_BUCKET}/`)
  return parts.length > 1 ? parts[1] : null
}

/**
 * Batch-sign each document's stored file_url (private `documents` bucket) and
 * swap it for a signed URL so download links resolve. Mirrors use-job-photos.
 */
async function signDocumentUrls<T extends { file_url?: string | null }>(rows: T[]): Promise<T[]> {
  const pathByIndex = rows.map((row) => (row.file_url ? storagePathFromFileUrl(row.file_url) : null))
  const paths = pathByIndex.filter((path): path is string => !!path)
  if (paths.length === 0) return rows

  const signedByPath = new Map<string, string>()
  const { data: signedRes } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL)
  for (const entry of signedRes ?? []) {
    if (entry.path && entry.signedUrl) {
      signedByPath.set(entry.path, entry.signedUrl)
    }
  }

  return rows.map((row, i) => {
    const path = pathByIndex[i]
    const signed = path ? signedByPath.get(path) : undefined
    return signed ? { ...row, file_url: signed } : row
  })
}

export function useDocuments(filters?: {
  property_id?: string
  asset_id?: string
  document_type?: string
  search?: string
  compliance_item_id?: string
}) {
  return useQuery({
    queryKey: ['documents', filters],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('*, properties(name)')
        .order('uploaded_at', { ascending: false })
      if (filters?.property_id) query = query.eq('property_id', filters.property_id)
      if (filters?.asset_id) query = query.eq('asset_id', filters.asset_id)
      if (filters?.document_type) query = query.eq('document_type', filters.document_type)
      if (filters?.search) query = query.ilike('name', `%${filters.search}%`)
      if (filters?.compliance_item_id) query = query.eq('compliance_item_id', filters.compliance_item_id)
      const { data, error } = await query
      if (error) throw error
      return signDocumentUrls((data ?? []) as DocumentWithRelations[])
    },
  })
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ['documents', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, properties(name)')
        .eq('id', id)
        .single()
      if (error) throw error
      const [signed] = await signDocumentUrls([data as DocumentWithRelations])
      return signed
    },
    enabled: !!id,
  })
}

/**
 * Resolves the next version number for a document with the given name
 * scoped to property and optionally asset. If a document with the same name
 * already exists, returns max(version) + 1. Otherwise returns 1.
 */
async function resolveNextVersion(
  name: string,
  organisationId: string,
  propertyId?: string,
  assetId?: string,
): Promise<number> {
  let query = supabase
    .from('documents')
    .select('version')
    .eq('organisation_id', organisationId)
    .eq('name', name)
    .order('version', { ascending: false })
    .limit(1)

  // Scope the version chain to the EXACT (org, name, property, asset) tuple.
  // When there is no property/asset, filter for NULL rather than dropping the
  // filter — otherwise an org-level upload matches every same-named scoped doc
  // org-wide and inherits an inflated, mis-scoped version number.
  query = propertyId ? query.eq('property_id', propertyId) : query.is('property_id', null)
  query = assetId ? query.eq('asset_id', assetId) : query.is('asset_id', null)

  const { data } = await query
  if (data && data.length > 0) {
    const current = (data[0] as { version?: number }).version ?? 0
    return current + 1
  }
  return 1
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (doc: {
      name: string
      file: File
      organisation_id: string
      property_id?: string
      asset_id?: string
      job_id?: string
      compliance_item_id?: string
      document_type?: string
      tags?: string[]
      expiry_date?: string
      uploaded_by?: string
    }) => {
      // Resolve version
      const version = await resolveNextVersion(
        doc.name,
        doc.organisation_id,
        doc.property_id,
        doc.asset_id,
      )

      // Upload file to storage. Sanitize the filename in the STORAGE KEY —
      // Supabase rejects keys with #, %, [, ], accented/currency chars etc. with
      // an opaque "Invalid key". The readable name stays in the title column.
      const safeName = doc.file.name.normalize('NFKD').replace(/[^\w.-]+/g, '_') || 'file'
      const filePath = `${doc.organisation_id}/${Date.now()}_${safeName}`
      const publicUrl = await uploadFile('documents', filePath, doc.file)

      // Create document record
      const { data, error } = await supabase
        .from('documents')
        .insert({
          name: doc.name,
          file_url: publicUrl,
          file_size: doc.file.size,
          mime_type: doc.file.type,
          organisation_id: doc.organisation_id,
          property_id: doc.property_id,
          asset_id: doc.asset_id,
          job_id: doc.job_id,
          compliance_item_id: doc.compliance_item_id,
          document_type: doc.document_type,
          tags: doc.tags,
          expiry_date: doc.expiry_date,
          uploaded_by: doc.uploaded_by,
          version,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success('Document uploaded successfully')
      queryClient.invalidateQueries({ queryKey: ['documents'] })

      // Auto-trigger: log timeline event when a document is uploaded
      if (data) {
        const orgId = data.organisation_id
        if (orgId) {
          logTimelineEvent({
            orgId,
            propertyId: data.property_id,
            eventType: TIMELINE_EVENT_TYPES.DOCUMENT_UPLOADED,
            description: `Document "${data.name}" uploaded`,
            userId: data.uploaded_by,
          })
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document')
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Remove the underlying storage object too — otherwise every delete
      // orphans its file in the private `documents` bucket (cost + lingering
      // proof/certificate files). Best-effort: a missing object must not block
      // the row delete.
      const { data: row } = await supabase
        .from('documents')
        .select('file_url')
        .eq('id', id)
        .maybeSingle()
      const path = row?.file_url ? storagePathFromFileUrl(row.file_url) : null
      if (path) {
        try {
          await deleteFile(DOCUMENTS_BUCKET, path)
        } catch {
          // Object already gone / unreadable — proceed with the row delete.
        }
      }

      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Document deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete document')
    },
  })
}
