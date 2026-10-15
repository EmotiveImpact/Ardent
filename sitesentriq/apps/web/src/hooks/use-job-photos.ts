import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { uploadFile, deleteFile } from '@/lib/storage'
import type { JobPhoto, JobPhotoType } from '@haumea/types'

const BUCKET = 'job-photos'
const SIGNED_URL_TTL = 60 * 60 // 1 hour

/**
 * Extract the storage object path from a stored file_url. Rows persist a
 * legacy public URL (`.../object/public/job-photos/{path}`); the bucket is
 * now private (migration 00059) so we re-sign for display.
 */
function storagePathFromFileUrl(fileUrl: string): string | null {
  const parts = fileUrl.split(`/${BUCKET}/`)
  return parts.length > 1 ? parts[1] : null
}

export function useJobPhotos(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job-photos', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId!)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      const rows = data as JobPhoto[]

      // job-photos is a private bucket, so getPublicUrl-style links 403.
      // Batch-sign all paths in a single round-trip and swap file_url for
      // the signed URL the gallery renders.
      const pathByIndex = rows.map((row) => storagePathFromFileUrl(row.file_url))
      const paths = pathByIndex.filter((path): path is string => !!path)
      if (paths.length === 0) return rows

      const signedByPath = new Map<string, string>()
      const { data: signedRes } = await supabase.storage
        .from(BUCKET)
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
    },
    enabled: !!jobId,
  })
}

export function useUploadJobPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      jobId: string
      organisationId: string
      file: File
      caption?: string
      photoType: JobPhotoType
      uploadedBy?: string
    }) => {
      // First path segment MUST be the org id — the job-photos bucket RLS
      // (00059) requires foldername[1] = caller's organisation_id, else the
      // upload is rejected. (Read side splits on `/job-photos/`, so the extra
      // segment is transparent.)
      const filePath = `${params.organisationId}/${params.jobId}/${Date.now()}_${params.file.name}`
      const publicUrl = await uploadFile(BUCKET, filePath, params.file)

      const { data, error } = await supabase
        .from('job_photos')
        .insert({
          job_id: params.jobId,
          organisation_id: params.organisationId,
          file_url: publicUrl,
          caption: params.caption || null,
          photo_type: params.photoType,
          uploaded_by: params.uploadedBy || null,
        })
        .select()
        .single()
      if (error) throw error
      return data as JobPhoto
    },
    onSuccess: (_data, params) => {
      toast.success('Photo uploaded successfully')
      queryClient.invalidateQueries({ queryKey: ['job-photos', params.jobId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload photo')
    },
  })
}

export function useDeleteJobPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (photo: JobPhoto) => {
      // Extract storage path from the URL. The gallery list swaps file_url for a
      // SIGNED url (.../object/sign/job-photos/{path}?token=...), so strip any
      // query string — otherwise deleteFile got "{path}?token=..." and the object
      // was never removed (orphaned in the bucket).
      const urlParts = photo.file_url.split(`/${BUCKET}/`)
      if (urlParts.length > 1) {
        const objectPath = urlParts[1].split('?')[0]
        try {
          await deleteFile(BUCKET, objectPath)
        } catch {
          // Storage deletion may fail if file doesn't exist; continue with DB deletion
          console.warn('Could not delete file from storage:', objectPath)
        }
      }

      const { error } = await supabase
        .from('job_photos')
        .delete()
        .eq('id', photo.id)
      if (error) throw error
    },
    onSuccess: (_data, photo) => {
      toast.success('Photo deleted')
      queryClient.invalidateQueries({ queryKey: ['job-photos', photo.job_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete photo')
    },
  })
}
