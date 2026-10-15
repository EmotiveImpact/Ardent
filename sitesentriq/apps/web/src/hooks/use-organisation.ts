import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'

export interface OrganisationRow {
  id: string
  name: string
  slug: string
  logo_url?: string | null
  created_at: string
  updated_at: string
}

export function useOrganisation() {
  const { organisation, loading } = useAuthContext()
  return { organisation, isLoading: loading }
}

export function useOrganisationDetails() {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['organisation', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return null
      const { data, error } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', organisation.id)
        .single()
      if (error) throw error
      return data as OrganisationRow
    },
    enabled: !!organisation?.id,
  })
}

export function useUpdateOrganisation() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()
  return useMutation({
    mutationFn: async (updates: { name?: string; logo_url?: string | null }) => {
      if (!organisation?.id) throw new Error('No organisation found')
      const { data, error } = await supabase
        .from('organisations')
        .update(updates)
        .eq('id', organisation.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organisation'] })
      toast.success('Organisation updated successfully')
    },
    onError: (error) => {
      toast.error(`Failed to update organisation: ${error.message}`)
    },
  })
}

export function useUploadOrgLogo() {
  const { organisation } = useAuthContext()
  const updateOrg = useUpdateOrganisation()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!organisation?.id) throw new Error('No organisation found')
      const ext = file.name.split('.').pop()
      const path = `${organisation.id}/logo.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('org-logos')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('org-logos')
        .getPublicUrl(path)

      await updateOrg.mutateAsync({ logo_url: urlData.publicUrl })
      return urlData.publicUrl
    },
    onSuccess: () => {
      toast.success('Logo uploaded successfully')
    },
    onError: (error) => {
      toast.error(`Failed to upload logo: ${error.message}`)
    },
  })
}
