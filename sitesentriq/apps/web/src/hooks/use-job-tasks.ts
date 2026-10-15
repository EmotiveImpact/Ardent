import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { JobTask } from '@haumea/types'

export function useJobTasks(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job-tasks', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_tasks')
        .select('*')
        .eq('job_id', jobId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as JobTask[]
    },
    enabled: !!jobId,
  })
}

export function useCreateJobTask() {
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (task: Partial<JobTask>) => {
      const { data, error } = await supabase
        .from('job_tasks')
        .insert({ ...task, organisation_id: task.organisation_id || profile?.organisation_id })
        .select()
        .single()
      if (error) throw error
      return data as JobTask
    },
    onSuccess: (data) => {
      toast.success('Task added successfully')
      queryClient.invalidateQueries({ queryKey: ['job-tasks', data.job_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add task')
    },
  })
}

export function useUpdateJobTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<JobTask> & { id: string }) => {
      const { data, error } = await supabase
        .from('job_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as JobTask
    },
    onSuccess: (data) => {
      toast.success('Task updated successfully')
      queryClient.invalidateQueries({ queryKey: ['job-tasks', data.job_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update task')
    },
  })
}

export function useDeleteJobTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, jobId }: { id: string; jobId: string }) => {
      const { error } = await supabase.from('job_tasks').delete().eq('id', id)
      if (error) throw error
      return jobId
    },
    onSuccess: (jobId) => {
      toast.success('Task deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['job-tasks', jobId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete task')
    },
  })
}
