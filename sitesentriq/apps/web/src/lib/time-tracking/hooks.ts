/**
 * TanStack Query hooks for time-entries.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { TimeEntry, TimeEntryKind } from './types'
import { TIME_ENTRY_DEFAULT_BILLABLE } from './types'
import { addDaysIso } from './compute'

const TABLE = 'time_entries'

export function useJobTimeEntries(jobId: string | undefined) {
  return useQuery({
    queryKey: ['time_entries', 'job', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('job_id', jobId!)
        .order('started_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TimeEntry[]
    },
    refetchInterval: (query) => {
      const list = query.state.data as TimeEntry[] | undefined
      const hasRunning = list?.some((e) => !e.ended_at)
      return hasRunning ? 60_000 : false
    },
  })
}

export function useEngineerTimesheet(
  engineerId: string | undefined,
  weekStart: string | undefined,
) {
  return useQuery({
    queryKey: ['time_entries', 'engineer', engineerId, weekStart],
    enabled: !!engineerId && !!weekStart,
    queryFn: async () => {
      const startIso = `${weekStart}T00:00:00.000Z`
      const endIso = `${addDaysIso(weekStart!, 7)}T00:00:00.000Z`
      const { data, error } = await supabase
        .from(TABLE)
        .select('*, jobs:job_id(id, title)')
        .eq('engineer_id', engineerId!)
        .gte('started_at', startIso)
        .lt('started_at', endIso)
        .order('started_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as (TimeEntry & { jobs?: { id: string; title: string } | null })[]
    },
  })
}

export function useRunningEntry(engineerId: string | undefined) {
  return useQuery({
    queryKey: ['time_entries', 'running', engineerId],
    enabled: !!engineerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('engineer_id', engineerId!)
        .is('ended_at', null)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as TimeEntry | null
    },
    refetchInterval: 60_000,
  })
}

export function useEngineerRates() {
  return useQuery({
    queryKey: ['engineers', 'rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('engineers')
        .select('profile_id, default_billable_rate')
      if (error) throw error
      const out: Record<string, number | null> = {}
      for (const row of (data ?? []) as { profile_id: string | null; default_billable_rate: number | null }[]) {
        if (row.profile_id) out[row.profile_id] = row.default_billable_rate
      }
      return out
    },
    staleTime: 60_000,
  })
}

export function useStartTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      jobId: string
      engineerId: string
      organisationId: string
      kind: TimeEntryKind
      ratePerHour?: number | null
      notes?: string | null
    }) => {
      const { data: running } = await supabase
        .from(TABLE)
        .select('id')
        .eq('engineer_id', input.engineerId)
        .is('ended_at', null)
        .maybeSingle()
      if (running?.id) {
        await supabase
          .from(TABLE)
          .update({ ended_at: new Date().toISOString() })
          .eq('id', running.id)
      }

      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          organisation_id: input.organisationId,
          job_id: input.jobId,
          engineer_id: input.engineerId,
          kind: input.kind,
          started_at: new Date().toISOString(),
          billable: TIME_ENTRY_DEFAULT_BILLABLE[input.kind],
          rate_per_hour: input.ratePerHour ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as TimeEntry
    },
    onSuccess: (_data, vars) => {
      toast.success('Timer started')
      qc.invalidateQueries({ queryKey: ['time_entries'] })
      qc.invalidateQueries({ queryKey: ['time_entries', 'job', vars.jobId] })
      qc.invalidateQueries({ queryKey: ['time_entries', 'running', vars.engineerId] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to start timer'),
  })
}

export function useStopTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ ended_at: new Date().toISOString() })
        .eq('id', entryId)
        .select()
        .single()
      if (error) throw error
      return data as TimeEntry
    },
    onSuccess: () => {
      toast.success('Timer stopped')
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to stop timer'),
  })
}

export function useUpsertManualEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      jobId: string
      engineerId: string
      organisationId: string
      kind: TimeEntryKind
      startedAt: string
      endedAt: string
      ratePerHour?: number | null
      billable?: boolean
      notes?: string | null
    }) => {
      const payload = {
        organisation_id: input.organisationId,
        job_id: input.jobId,
        engineer_id: input.engineerId,
        kind: input.kind,
        started_at: input.startedAt,
        ended_at: input.endedAt,
        rate_per_hour: input.ratePerHour ?? null,
        billable: input.billable ?? TIME_ENTRY_DEFAULT_BILLABLE[input.kind],
        notes: input.notes ?? null,
      }
      if (input.id) {
        const { data, error } = await supabase
          .from(TABLE)
          .update(payload)
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw error
        return data as TimeEntry
      } else {
        const { data, error } = await supabase
          .from(TABLE)
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as TimeEntry
      }
    },
    onSuccess: () => {
      toast.success('Entry saved')
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save entry'),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      toast.success('Entry deleted')
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete entry'),
  })
}

export function useMarkEntriesBilled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { entryIds: string[]; invoiceId: string }) => {
      if (input.entryIds.length === 0) return []
      const { data, error } = await supabase
        .from(TABLE)
        .update({ billed_invoice_id: input.invoiceId })
        .in('id', input.entryIds)
        .select()
      if (error) throw error
      return data as TimeEntry[]
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to mark entries billed'),
  })
}

export function useUnbilledJobEntries(jobId: string | undefined) {
  return useQuery({
    queryKey: ['time_entries', 'unbilled', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('job_id', jobId!)
        .eq('billable', true)
        .is('billed_invoice_id', null)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TimeEntry[]
    },
  })
}
