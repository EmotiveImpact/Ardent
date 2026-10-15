/**
 * Saved report template CRUD + TanStack Query hooks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { ReportDefinition } from './query'

export interface ReportTemplate {
  id: string
  organisation_id: string
  name: string
  description: string | null
  dataset: string
  definition: ReportDefinition
  is_org_wide: boolean
  is_system: boolean
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface ReportSchedule {
  id: string
  organisation_id: string
  template_id: string
  frequency: 'daily' | 'weekly' | 'monthly'
  cron: string | null
  format: 'csv' | 'pdf' | 'html'
  recipients: string[]
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

/* ── Fetch ──────────────────────────────────────── */

export function useReportTemplates() {
  return useQuery({
    queryKey: ['report-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .order('is_system', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as ReportTemplate[]
    },
  })
}

export function useReportTemplate(id: string | null) {
  return useQuery({
    queryKey: ['report-templates', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as ReportTemplate
    },
    enabled: !!id,
  })
}

/* ── Mutations ──────────────────────────────────── */

export function useCreateReportTemplate() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuthContext()

  return useMutation({
    mutationFn: async (payload: {
      name: string
      description?: string
      dataset: string
      definition: ReportDefinition
      is_org_wide?: boolean
    }) => {
      if (!organisation?.id) throw new Error('No organisation context')
      const { data, error } = await supabase
        .from('report_templates')
        .insert({
          organisation_id: organisation.id,
          name: payload.name,
          description: payload.description ?? null,
          dataset: payload.dataset,
          definition: payload.definition,
          is_org_wide: payload.is_org_wide ?? false,
          is_system: false,
          created_by_user_id: profile?.id ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as ReportTemplate
    },
    onSuccess: () => {
      toast.success('Report template saved')
      queryClient.invalidateQueries({ queryKey: ['report-templates'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save template'),
  })
}

export function useUpdateReportTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      name?: string
      description?: string | null
      definition?: ReportDefinition
      is_org_wide?: boolean
    }) => {
      const { id, ...rest } = payload
      const { data, error } = await supabase
        .from('report_templates')
        .update(rest)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ReportTemplate
    },
    onSuccess: () => {
      toast.success('Template updated')
      queryClient.invalidateQueries({ queryKey: ['report-templates'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update template'),
  })
}

export function useDeleteReportTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('report_templates').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      toast.success('Template deleted')
      queryClient.invalidateQueries({ queryKey: ['report-templates'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete template'),
  })
}

/* ── Schedules ──────────────────────────────────── */

const FREQUENCY_TO_CRON: Record<string, string> = {
  daily: '0 7 * * *',     // 7am every day
  weekly: '0 7 * * 1',    // 7am every Monday
  monthly: '0 7 1 * *',   // 7am on the 1st of every month
}

export function frequencyToCron(freq: 'daily' | 'weekly' | 'monthly'): string {
  return FREQUENCY_TO_CRON[freq] ?? FREQUENCY_TO_CRON.weekly
}

export function nextRunAt(freq: 'daily' | 'weekly' | 'monthly'): Date {
  const d = new Date()
  d.setHours(7, 0, 0, 0)
  if (freq === 'daily') {
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
  } else if (freq === 'weekly') {
    // Next Monday
    const day = d.getDay()
    const offset = (8 - day) % 7 || 7
    d.setDate(d.getDate() + offset)
  } else {
    // 1st of next month
    d.setMonth(d.getMonth() + 1, 1)
  }
  return d
}

export function useReportSchedules(templateId?: string) {
  return useQuery({
    queryKey: ['report-schedules', templateId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('report_schedules').select('*').order('created_at', { ascending: false })
      if (templateId) q = q.eq('template_id', templateId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ReportSchedule[]
    },
  })
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient()
  const { profile, organisation } = useAuthContext()

  return useMutation({
    mutationFn: async (payload: {
      template_id: string
      frequency: 'daily' | 'weekly' | 'monthly'
      format: 'csv' | 'pdf' | 'html'
      recipients: string[]
    }) => {
      if (!organisation?.id) throw new Error('No organisation context')
      const { data, error } = await supabase
        .from('report_schedules')
        .insert({
          organisation_id: organisation.id,
          template_id: payload.template_id,
          frequency: payload.frequency,
          cron: frequencyToCron(payload.frequency),
          format: payload.format,
          recipients: payload.recipients,
          enabled: true,
          next_run_at: nextRunAt(payload.frequency).toISOString(),
          created_by_user_id: profile?.id ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as ReportSchedule
    },
    onSuccess: () => {
      toast.success('Report schedule created')
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to schedule report'),
  })
}

export function useDeleteReportSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('report_schedules').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      toast.success('Schedule removed')
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove schedule'),
  })
}

/* ── Run logging ────────────────────────────────── */

export async function logReportRun(payload: {
  template_id?: string
  format: 'json' | 'csv' | 'pdf' | 'html'
  row_count: number
  latency_ms: number
  error_message?: string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('organisation_id')
    .eq('id', user?.id ?? '')
    .maybeSingle()
  if (!profile?.organisation_id) return
  await supabase.from('report_runs').insert({
    organisation_id: profile.organisation_id,
    template_id: payload.template_id ?? null,
    run_by_user_id: user?.id ?? null,
    format: payload.format === 'json' ? 'json' : payload.format,
    row_count: payload.row_count,
    latency_ms: payload.latency_ms,
    error_message: payload.error_message ?? null,
  })
}
