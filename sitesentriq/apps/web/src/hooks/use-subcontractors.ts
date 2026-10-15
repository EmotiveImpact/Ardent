import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Subcontractor, SubcontractorDocument, SubcontractorWithRelations } from '@haumea/types'

const DOCUMENTS_BUCKET = 'documents'
const SIGNED_URL_TTL = 60 * 60 // 1 hour

/**
 * Extract the storage object path from a stored file_url. Rows persist a
 * legacy public URL (`.../object/public/documents/{path}`); the bucket is now
 * private (migration 00059) so we re-sign for display.
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

// ── Subcontractors ──────────────────────────────────

export function useSubcontractors() {
  return useQuery({
    queryKey: ['subcontractors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractors')
        .select('*, subcontractor_documents(count)')
        .order('company_name')
      if (error) throw error
      return data as (Subcontractor & { subcontractor_documents: { count: number }[] })[]
    },
  })
}

export function useSubcontractor(id: string) {
  return useQuery({
    queryKey: ['subcontractors', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractors')
        .select('*, subcontractor_documents(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      const subcontractor = data as SubcontractorWithRelations
      if (subcontractor.subcontractor_documents?.length) {
        subcontractor.subcontractor_documents = await signDocumentUrls(subcontractor.subcontractor_documents)
      }
      return subcontractor
    },
    enabled: !!id,
  })
}

export function useCreateSubcontractor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sub: Partial<Subcontractor>) => {
      const { data, error } = await supabase
        .from('subcontractors')
        .insert(sub)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Subcontractor created successfully')
      queryClient.invalidateQueries({ queryKey: ['subcontractors'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create subcontractor')
    },
  })
}

export function useUpdateSubcontractor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Subcontractor> & { id: string }) => {
      const { data, error } = await supabase
        .from('subcontractors')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Subcontractor updated successfully')
      queryClient.invalidateQueries({ queryKey: ['subcontractors'] })
      queryClient.invalidateQueries({ queryKey: ['subcontractors', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update subcontractor')
    },
  })
}

export function useDeleteSubcontractor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subcontractors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Subcontractor deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['subcontractors'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete subcontractor')
    },
  })
}

// ── Documents ──────────────────────────────────────────

export function useSubcontractorDocuments(subcontractorId: string) {
  return useQuery({
    queryKey: ['subcontractors', subcontractorId, 'documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractor_documents')
        .select('*')
        .eq('subcontractor_id', subcontractorId)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return signDocumentUrls(data as SubcontractorDocument[])
    },
    enabled: !!subcontractorId,
  })
}

export function useUploadSubcontractorDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (doc: Partial<SubcontractorDocument>) => {
      const { data, error } = await supabase
        .from('subcontractor_documents')
        .insert(doc)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Document uploaded successfully')
      queryClient.invalidateQueries({ queryKey: ['subcontractors', variables.subcontractor_id, 'documents'] })
      queryClient.invalidateQueries({ queryKey: ['subcontractors', variables.subcontractor_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document')
    },
  })
}

export function useDeleteSubcontractorDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, subcontractorId }: { id: string; subcontractorId: string }) => {
      const { error } = await supabase.from('subcontractor_documents').delete().eq('id', id)
      if (error) throw error
      return { subcontractorId }
    },
    onSuccess: (data) => {
      toast.success('Document deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['subcontractors', data.subcontractorId, 'documents'] })
      queryClient.invalidateQueries({ queryKey: ['subcontractors', data.subcontractorId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete document')
    },
  })
}
