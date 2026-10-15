import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logTimelineEvent } from '@/lib/timeline'
import { TIMELINE_EVENT_TYPES } from '@/lib/constants'
import type { Action } from '@haumea/types'

interface ActionFilters {
  status?: string
  property_id?: string
  priority?: string
}

export function useActions(filters?: ActionFilters) {
  return useQuery({
    queryKey: ['actions', filters],
    queryFn: async () => {
      let query = supabase
        .from('actions')
        .select('*, properties(name), jobs(title)')
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.property_id) {
        query = query.eq('property_id', filters.property_id)
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useAction(id: string) {
  return useQuery({
    queryKey: ['actions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('actions')
        .select('*, properties(id, name, address), jobs(id, title)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (action: Partial<Action>) => {
      const { data, error } = await supabase
        .from('actions')
        .insert(action)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success('Action created successfully')
      queryClient.invalidateQueries({ queryKey: ['actions'] })

      // Auto-trigger: log timeline event when action is raised
      if (data) {
        const orgId = data.organisation_id
        if (orgId) {
          logTimelineEvent({
            orgId,
            propertyId: data.property_id,
            eventType: TIMELINE_EVENT_TYPES.ACTION_RAISED,
            description: `Action "${data.title}" raised (${data.priority} priority)`,
          }).catch(console.error)
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create action')
    },
  })
}

export function useUpdateAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Action> & { id: string }) => {
      const { data, error } = await supabase
        .from('actions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    // Optimistic update — patch every cached actions list + the detail row
    onMutate: async (variables) => {
      const { id, ...patch } = variables
      await queryClient.cancelQueries({ queryKey: ['actions'] })
      const prevDetail = queryClient.getQueryData<Record<string, unknown>>(['actions', id])
      const prevLists = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['actions'] })

      if (prevDetail) {
        queryClient.setQueryData(['actions', id], { ...prevDetail, ...patch })
      }
      prevLists.forEach(([key, list]) => {
        if (!Array.isArray(list)) return
        if (key.length === 2 && key[1] === id) return
        queryClient.setQueryData(
          key,
          list.map((row) =>
            row && (row as { id?: string }).id === id ? { ...row, ...patch } : row,
          ),
        )
      })
      return { prevDetail, prevLists, id }
    },
    onError: (error: Error, _vars, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(['actions', context.id], context.prevDetail)
      }
      context?.prevLists?.forEach(([key, list]) => {
        queryClient.setQueryData(key, list)
      })
      toast.error(error.message || 'Failed to update action')
    },
    onSuccess: (data, variables, context) => {
      toast.success('Action updated successfully')
      queryClient.invalidateQueries({ queryKey: ['actions'] })
      queryClient.invalidateQueries({ queryKey: ['actions', variables.id] })

      // Auto-trigger: log a timeline event only on a GENUINE transition into
      // resolved/closed. Editing the resolution notes of an already-resolved
      // action re-sends status:'resolved', which previously re-fired a duplicate
      // ACTION_RESOLVED event. Guard on the prior status (from the onMutate
      // snapshot); if it's already terminal, skip. (Mirrors the job-completion
      // _was_already_completed guard.)
      if (data && (variables.status === 'resolved' || variables.status === 'closed')) {
        const priorStatus = (context?.prevDetail as { status?: string } | undefined)?.status
        const alreadyTerminal = priorStatus === 'resolved' || priorStatus === 'closed'
        const orgId = data.organisation_id
        if (orgId && !alreadyTerminal) {
          logTimelineEvent({
            orgId,
            propertyId: data.property_id,
            eventType: TIMELINE_EVENT_TYPES.ACTION_RESOLVED,
            description: `Action "${data.title}" ${variables.status}`,
          }).catch(console.error)
        }
      }
    },
  })
}

export function useDeleteAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('actions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Action deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['actions'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete action')
    },
  })
}
