import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { insertFieldEvent, listFieldEvents } from './client'
import type { InsertFieldEventInput } from './client'

export function useFieldEvents(jobId: string | undefined) {
  return useQuery({
    queryKey: ['field_events', jobId],
    queryFn: () => listFieldEvents(jobId!),
    enabled: !!jobId,
  })
}

export function useInsertFieldEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InsertFieldEventInput) => insertFieldEvent(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['field_events', input.job_id] })
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to log field event')
    },
  })
}
