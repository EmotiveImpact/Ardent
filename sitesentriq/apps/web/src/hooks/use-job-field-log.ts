import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface JobNote {
  id: string
  content: string
  user_name: string | null
  created_at: string
}

export interface JobPart {
  id: string
  description: string
  quantity: number
  unit_cost: number | null
  created_at: string
}

/**
 * Notes the engineer logged on a job (mobile `addNote` → `notes` table). Surfaced
 * read-only on the web job detail so office staff see the field log. Newest first.
 */
export function useJobNotes(jobId: string | undefined) {
  return useQuery<JobNote[]>({
    queryKey: ['job-notes', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, content, user_name, created_at')
        .eq('job_id', jobId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as JobNote[]
    },
    enabled: !!jobId,
  })
}

/**
 * Parts/materials the engineer logged on a job (mobile `PartsForm` → `job_parts`,
 * migration 00092). Surfaced on the web job detail for costing/invoicing.
 */
export function useJobParts(jobId: string | undefined) {
  return useQuery<JobPart[]>({
    queryKey: ['job-parts', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_parts')
        .select('id, description, quantity, unit_cost, created_at')
        .eq('job_id', jobId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as JobPart[]
    },
    enabled: !!jobId,
  })
}
