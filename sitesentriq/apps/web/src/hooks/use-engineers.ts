import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Engineer, EngineerAccreditation, EngineerDocument, EngineerWithRelations } from '@haumea/types'

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

// ── Engineers ──────────────────────────────────────────

export function useEngineers() {
  return useQuery({
    queryKey: ['engineers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('engineers')
        .select('*, engineer_accreditations(count)')
        .order('name')
      if (error) throw error
      return data as (Engineer & { engineer_accreditations: { count: number }[] })[]
    },
  })
}

export function useEngineer(id: string) {
  return useQuery({
    queryKey: ['engineers', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('engineers')
        .select('*, engineer_accreditations(*), engineer_documents(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      const engineer = data as EngineerWithRelations
      if (engineer.engineer_documents?.length) {
        engineer.engineer_documents = await signDocumentUrls(engineer.engineer_documents)
      }
      return engineer
    },
    enabled: !!id,
  })
}

export function useCreateEngineer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (engineer: Partial<Engineer>) => {
      const { data, error } = await supabase
        .from('engineers')
        .insert(engineer)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Engineer created successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create engineer')
    },
  })
}

export function useUpdateEngineer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Engineer> & { id: string }) => {
      const { data, error } = await supabase
        .from('engineers')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Engineer updated successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers'] })
      queryClient.invalidateQueries({ queryKey: ['engineers', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update engineer')
    },
  })
}

export function useDeleteEngineer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('engineers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Engineer deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete engineer')
    },
  })
}

// ── Accreditations ─────────────────────────────────────

export function useEngineerAccreditations(engineerId: string) {
  return useQuery({
    queryKey: ['engineers', engineerId, 'accreditations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('engineer_accreditations')
        .select('*')
        .eq('engineer_id', engineerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as EngineerAccreditation[]
    },
    enabled: !!engineerId,
  })
}

export function useCreateAccreditation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (accreditation: Partial<EngineerAccreditation>) => {
      const { data, error } = await supabase
        .from('engineer_accreditations')
        .insert(accreditation)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Accreditation added successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers', variables.engineer_id, 'accreditations'] })
      queryClient.invalidateQueries({ queryKey: ['engineers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add accreditation')
    },
  })
}

export function useDeleteAccreditation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, engineerId }: { id: string; engineerId: string }) => {
      const { error } = await supabase.from('engineer_accreditations').delete().eq('id', id)
      if (error) throw error
      return { engineerId }
    },
    onSuccess: (data) => {
      toast.success('Accreditation removed successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers', data.engineerId, 'accreditations'] })
      queryClient.invalidateQueries({ queryKey: ['engineers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove accreditation')
    },
  })
}

// ── Documents ──────────────────────────────────────────

export function useEngineerDocuments(engineerId: string) {
  return useQuery({
    queryKey: ['engineers', engineerId, 'documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('engineer_documents')
        .select('*')
        .eq('engineer_id', engineerId)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return signDocumentUrls(data as EngineerDocument[])
    },
    enabled: !!engineerId,
  })
}

export function useUploadEngineerDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (doc: Partial<EngineerDocument>) => {
      const { data, error } = await supabase
        .from('engineer_documents')
        .insert(doc)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Document uploaded successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers', variables.engineer_id, 'documents'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document')
    },
  })
}

export function useDeleteEngineerDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, engineerId }: { id: string; engineerId: string }) => {
      const { error } = await supabase.from('engineer_documents').delete().eq('id', id)
      if (error) throw error
      return { engineerId }
    },
    onSuccess: (data) => {
      toast.success('Document deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['engineers', data.engineerId, 'documents'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete document')
    },
  })
}
