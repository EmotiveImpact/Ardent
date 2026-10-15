import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logTimelineEvent } from '@/lib/timeline'
import { TIMELINE_EVENT_TYPES } from '@/lib/constants'
import type { ServiceReport } from '@haumea/types'

export function useReports() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_reports')
        .select('*, jobs(title, properties(name)), profiles:engineer_id(full_name)')
        .order('submitted_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useReport(id: string) {
  return useQuery({
    queryKey: ['reports', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_reports')
        .select('*, jobs(title, description, properties(name, address)), profiles:engineer_id(full_name, email)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (report: Partial<ServiceReport> & { property_id?: string }) => {
      const { property_id, ...reportData } = report
      const { data, error } = await supabase
        .from('service_reports')
        .insert(reportData)
        .select('*, jobs(title, properties(name))')
        .single()
      if (error) throw error
      // Attach property_id for timeline usage
      return { ...data, _property_id: property_id }
    },
    onSuccess: (data) => {
      toast.success('Service report submitted successfully')
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })

      // Auto-trigger: log timeline event when report is submitted
      if (data) {
        const orgId = data.organisation_id
        if (orgId) {
          const jobTitle = data.jobs?.title ?? data.job_id
          logTimelineEvent({
            orgId,
            propertyId: data._property_id,
            eventType: TIMELINE_EVENT_TYPES.REPORT_UPLOADED,
            description: `Service report submitted for "${jobTitle}"`,
            userId: data.engineer_id,
          }).catch(console.error)
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit report')
    },
  })
}
