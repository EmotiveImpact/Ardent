import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { parsePermitGateError, PERMIT_GATE_MESSAGES } from '@/lib/permits'
import { createNotification } from '@/lib/notifications'
import { logTimelineEvent } from '@/lib/timeline'
import { NOTIFICATION_TYPES, TIMELINE_EVENT_TYPES, JOB_STATUSES } from '@/lib/constants'
import { syncJobToGoogleCalendar } from '@/lib/integrations/calendar/google'
import {
  generateCertificate,
  type GenerateCertificateInput,
} from '@/lib/certificates'
import { invokeAutoAssign } from '@/lib/auto-assign'
import type { Job, JobWithRelations } from '@haumea/types'
import { insertFieldEvent, uploadSignaturePng } from '@/lib/field-ops/client'
import { getCurrentLocation, isGeolocationSupported } from '@/lib/field-ops/geolocation'
import { findMatchingPolicy, computeTargets, type SlaPolicy } from '@/lib/sla'

const JOBS_QUERY_TIMEOUT_MS = 8_000

function getErrorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error.toLowerCase()
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase()
  if (typeof error !== 'object') return String(error).toLowerCase()
  const fields = error as {
    name?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }
  let json = ''
  try {
    json = JSON.stringify(error)
  } catch {
    json = ''
  }
  return [fields.name, fields.message, fields.details, fields.hint, json]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function isAbortError(error: unknown): boolean {
  const text = getErrorText(error)
  return (
    text.includes('aborterror') ||
    text.includes('signal is aborted') ||
    text.includes('request was aborted')
  )
}

function isTimeoutError(error: unknown): boolean {
  const text = getErrorText(error)
  return text.includes('timeouterror') || text.includes('jobs query timed out')
}

function createTimeoutSignal(parentSignal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Jobs query timed out after ${ms}ms`, 'TimeoutError'))
  }, ms)
  const onAbort = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', onAbort, { once: true })

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', onAbort)
    },
  }
}

export function useJobs(filters?: { status?: string; property_id?: string; date?: string }) {
  return useQuery<JobWithRelations[]>({
    queryKey: ['jobs', filters],
    queryFn: async ({ signal }) => {
      const timeout = createTimeoutSignal(signal, JOBS_QUERY_TIMEOUT_MS)

      const buildQuery = (select: string) => {
        let query = supabase
          .from('jobs')
          .select(select)
          // DESCENDING so the 200-row cap keeps the MOST-RECENT jobs (current +
          // upcoming), not the 200 oldest. Ascending+limit dropped every current
          // job once an org passed 200 rows, blanking the scheduler/Jobs list.
          // Consumers bucket/sort for display, so array order is not relied on.
          .order('scheduled_date', { ascending: false })
          // Wave 17 perf — cap unbounded fetch. Lists with >200 rows should
          // paginate; for now we surface the most-recent 200 ordered by
          // scheduled_date to keep cold-load JSON payloads bounded.
          .limit(200)
          .abortSignal(timeout.signal)
        if (filters?.status) query = query.eq('status', filters.status)
        if (filters?.property_id) query = query.eq('property_id', filters.property_id)
        if (filters?.date) query = query.gte('scheduled_date', filters.date)
        return query
      }

      try {
        const full = await buildQuery('*, properties(name), engineer_assignments(engineer_id, profiles:engineer_id(full_name))')
        if (!full.error) return ((full.data ?? []) as unknown) as JobWithRelations[]
        if (isAbortError(full.error)) throw full.error

        // Keep the Jobs list available if a nested relation is unavailable or
        // blocked by RLS. Engineer names can be absent; the base jobs table
        // must not disappear because one expansion failed.
        console.warn('[use-jobs] relation-expanded jobs query failed; retrying base list:', full.error.message)
        const withoutAssignments = await buildQuery('*, properties(name)')
        if (!withoutAssignments.error) return ((withoutAssignments.data ?? []) as unknown) as JobWithRelations[]
        if (isAbortError(withoutAssignments.error)) throw withoutAssignments.error

        const base = await buildQuery('*')
        if (base.error) throw base.error
        return ((base.data ?? []) as unknown) as JobWithRelations[]
      } catch (error) {
        if (isTimeoutError(error)) {
          throw new Error('Jobs took too long to load. Check the connection and try again.')
        }
        throw error
      } finally {
        timeout.cleanup()
      }
    },
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['jobs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(name, address), engineer_assignments(*, profiles:engineer_id(full_name, email)), service_reports(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (job: Partial<Job>) => {
      const { data, error } = await supabase.from('jobs').insert(job).select().single()
      if (error) throw error
      return data
    },
    onSuccess: async (data) => {
      toast.success('Job scheduled successfully')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })

      // ── SLA targets — apply matching policy on create (best-effort) ───
      // Read from the cached `useSlaPolicies()` query first; fall back to
      // a network fetch if no cache yet. Never block the UI on this.
      try {
        if (data?.id && data?.organisation_id) {
          let policies = queryClient.getQueryData<SlaPolicy[]>(['sla-policies'])
          if (!policies) {
            const { data: rows } = await supabase
              .from('sla_policies')
              .select('*')
              .eq('organisation_id', data.organisation_id)
            policies = (rows ?? []) as SlaPolicy[]
            queryClient.setQueryData(['sla-policies'], policies)
          }
          const policy = findMatchingPolicy(policies, {
            priority: data.priority,
            // jobs.category may not exist on the table; use sla_priority/job_type as a hint
            category:
              (data as { category?: string }).category ??
              (data as { job_type?: string }).job_type ??
              null,
          })
          if (policy) {
            const targets = computeTargets({
              policy,
              fromTime: data.scheduled_date ?? data.created_at ?? new Date(),
            })
            await supabase
              .from('jobs')
              .update({
                response_target_at: targets.response_target_at,
                completion_target_at: targets.completion_target_at,
                sla_policy_id: policy.id,
              })
              .eq('id', data.id)
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
            queryClient.invalidateQueries({ queryKey: ['jobs', data.id] })
          }
        }
      } catch (err) {
        console.warn('[use-jobs] sla apply skipped:', err)
      }

      // Auto-assign on create — fire and forget if org has it enabled.
      try {
        if (!data?.id || !data?.organisation_id) return
        const { data: settings } = await supabase
          .from('auto_assignment_settings')
          .select('auto_assign_on_create')
          .eq('organisation_id', data.organisation_id)
          .maybeSingle()
        if (settings && (settings as { auto_assign_on_create: boolean }).auto_assign_on_create) {
          invokeAutoAssign(data.id, 'apply').catch(() => undefined)
        }
      } catch { /* defensive — never block UI */ }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create job')
    },
  })
}

export function useUpdateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Job> & { id: string }) => {
      // SLA: when an engineer is being assigned for the first time and
      // response_at is still null, stamp it now. Best-effort — only fires
      // when caller passes engineer_id directly on the job row.
      const patch = { ...updates } as Record<string, unknown>
      if (
        (patch.engineer_id || patch.engineer_record_id) &&
        patch.response_at == null
      ) {
        // Read current row to confirm response_at is still null before stamping.
        const { data: existing } = await supabase
          .from('jobs')
          .select('response_at')
          .eq('id', id)
          .maybeSingle()
        if (existing && (existing as { response_at: string | null }).response_at == null) {
          patch.response_at = new Date().toISOString()
        }
      }
      // Stamp completed_date when a job transitions to 'completed'. The status
      // dropdown, field-mode Complete/swipe, and the web action bar all pass only
      // { status: 'completed' }; without this the Completed Date stayed '-' and
      // every completed_date-based reader (service-history ordering, MTTR, the
      // open-jobs sparkline) was wrong. The signature flow sets it explicitly, so
      // only default it when the caller didn't supply one. Clear it if a job is
      // moved back OUT of completed (guarded so unrelated patches never touch it).
      // Capture whether the job was ALREADY completed before this update, so
      // onSuccess can fire the completion side-effects (timeline event, client
      // notification, completion email) only on the genuine transition INTO
      // completed — not every time someone re-selects "Completed" on an
      // already-completed job, which would duplicate the audit event + notify.
      let wasAlreadyCompleted = false
      if (patch.status === 'completed') {
        const { data: cur } = await supabase
          .from('jobs')
          .select('status')
          .eq('id', id)
          .maybeSingle()
        wasAlreadyCompleted = (cur as { status?: string } | null)?.status === 'completed'
      }
      if (patch.status === 'completed' && patch.completed_date == null) {
        patch.completed_date = new Date().toISOString()
      } else if (patch.status != null && patch.status !== 'completed') {
        patch.completed_date = null
      }
      const { data, error } = await supabase.from('jobs').update(patch).eq('id', id).select().single()
      if (error) throw error
      return { ...data, _was_already_completed: wasAlreadyCompleted } as typeof data & {
        _was_already_completed: boolean
      }
    },
    // Optimistic update: flip status / fields locally so kanban-style boards
    // reflect the change instantly, with rollback on failure.
    onMutate: async (variables) => {
      const { id, ...patch } = variables
      await queryClient.cancelQueries({ queryKey: ['jobs'] })
      await queryClient.cancelQueries({ queryKey: ['jobs', id] })

      const prevDetail = queryClient.getQueryData<Record<string, unknown>>(['jobs', id])
      // Snapshot every cached jobs list (filters vary)
      const prevLists = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['jobs'] })

      // Detail
      if (prevDetail) {
        queryClient.setQueryData(['jobs', id], { ...prevDetail, ...patch })
      }
      // Lists — patch matching row
      prevLists.forEach(([key, list]) => {
        if (!Array.isArray(list)) return
        // Skip the detail key (which is ['jobs', id])
        if (key.length === 2 && key[1] === id) return
        // The property service-history list (['jobs','property',propertyId]) is
        // a completed-only list. If this update moves the job OUT of 'completed',
        // drop it from that list instead of patching it in place (otherwise a
        // reopened job lingers in the completed history until the next refetch).
        const isCompletedOnlyList = key[1] === 'property'
        let next = list.map((row) =>
          row && (row as { id?: string }).id === id ? { ...row, ...patch } : row,
        )
        if (
          isCompletedOnlyList &&
          'status' in patch &&
          (patch as { status?: string }).status !== 'completed'
        ) {
          next = next.filter((row) => (row as { id?: string }).id !== id)
        }
        queryClient.setQueryData(key, next)
      })
      return { prevDetail, prevLists, id }
    },
    onError: (error: Error, _vars, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(['jobs', context.id], context.prevDetail)
      }
      context?.prevLists?.forEach(([key, list]) => {
        queryClient.setQueryData(key, list)
      })
      // DB gate errors arrive as raw `code: detail` Postgres messages.
      const gateCode = parsePermitGateError(error.message)
      if (gateCode) {
        // permit-to-work (00121) — translate for humans.
        toast.error(PERMIT_GATE_MESSAGES[gateCode])
      } else if ((error.message ?? '').includes('subcontractor_not_compliant')) {
        // The subcontractor panel owns this gate — it opens the override
        // dialog (admins) or shows its own message. Stay silent to avoid a
        // duplicate raw-SQL toast alongside the panel's handling.
      } else {
        toast.error(error.message || 'Failed to update job')
      }
    },
    onSuccess: (data, v) => {
      toast.success('Job updated successfully')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', v.id] })

      // Fire-and-forget Google Calendar push for the current user.
      // Defensive — never let calendar sync break the UI.
      void (async () => {
        try {
          const { data: userData } = await supabase.auth.getUser()
          if (userData?.user?.id && v.id) {
            await syncJobToGoogleCalendar(userData.user.id, v.id)
          }
        } catch (err) {
          console.warn('[use-jobs] google calendar sync skipped:', err)
        }
      })()

      // Auto-trigger: when job TRANSITIONS to completed, log timeline + notify.
      // Skip if it was already completed (a re-applied status) so we don't
      // duplicate the audit event / notification.
      if (v.status === JOB_STATUSES.COMPLETED && data && !data._was_already_completed) {
        const orgId = data.organisation_id
        const propertyId = data.property_id

        logTimelineEvent({
          orgId,
          propertyId,
          eventType: TIMELINE_EVENT_TYPES.VISIT_COMPLETED,
          description: `Job "${data.title || data.id}" marked as completed`,
        })

        // Only notify a real recipient — `created_by` is often unset, and a `?? ''`
        // userId is an invalid uuid that throws + is silently swallowed.
        if (orgId && data.created_by) {
          createNotification({
            userId: data.created_by,
            orgId,
            type: NOTIFICATION_TYPES.JOB_COMPLETED,
            title: 'Job completed',
            message: `Job "${data.title || data.id}" has been completed`,
          })
        }

        // Sprint 2 / C1 — auto job-completion email to the client.
        // Fire-and-forget: never block the UI on email delivery, and
        // don't surface the error to the user as a toast (the timeline
        // event above is the user-facing confirmation). The edge
        // function handles "no recipient" / "email unconfigured"
        // gracefully and just logs.
        void (async () => {
          try {
            const { error: emailErr } = await supabase.functions.invoke('job-completion-email', {
              body: { job_id: data.id },
            })
            if (emailErr) {
              console.debug('[use-jobs] completion email skipped:', emailErr.message)
            }
          } catch (err) {
            console.debug('[use-jobs] completion email threw (non-blocking):', err)
          }
        })()

        // Sprint 2 / C2 — auto-mint a compliance certificate when the
        // job's data unambiguously maps to a known template (gas_safety
        // / eicr / fra) and the latest service report passed. Conservative
        // by design: idempotent (won't double-mint), never on a fail
        // outcome, never guesses the template type. See auto-mint.ts.
        void (async () => {
          try {
            const { maybeAutoMintCertificate } = await import('@/lib/certificates/auto-mint')
            const result = await maybeAutoMintCertificate(data.id)
            if (result.status === 'minted') {
              toast.success(`Certificate ${result.certificate_number} auto-issued`)
            } else if (result.status === 'error') {
              console.warn('[use-jobs] cert auto-mint failed:', result.reason)
            } else {
              console.debug('[use-jobs] cert auto-mint skipped:', result.reason)
            }
          } catch (err) {
            console.debug('[use-jobs] cert auto-mint threw (non-blocking):', err)
          }
        })()
      }
    },
  })
}

export function useDeleteJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('jobs').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] })
      const prevLists = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['jobs'] })
      const prevDetail = queryClient.getQueryData<Record<string, unknown>>(['jobs', id])

      prevLists.forEach(([key, list]) => {
        if (!Array.isArray(list)) return
        queryClient.setQueryData(
          key,
          list.filter((row) => row && row.id !== id),
        )
      })
      queryClient.removeQueries({ queryKey: ['jobs', id], exact: true })

      return { id, prevLists, prevDetail }
    },
    onSuccess: () => {
      toast.success('Job deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['jobs'], refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
    },
    onError: (error: Error, _id, context) => {
      context?.prevLists?.forEach(([key, list]) => {
        queryClient.setQueryData(key, list)
      })
      if (context?.prevDetail) {
        queryClient.setQueryData(['jobs', context.id], context.prevDetail)
      }
      toast.error(error.message || 'Failed to delete job')
    },
  })
}

export function useBulkDeleteJobs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('jobs').delete().in('id', ids)
      if (error) throw error
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] })
      const idSet = new Set(ids)
      const prevLists = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['jobs'] })
      const prevDetails = ids.map((id) => [id, queryClient.getQueryData(['jobs', id])] as const)

      prevLists.forEach(([key, list]) => {
        if (!Array.isArray(list)) return
        queryClient.setQueryData(
          key,
          list.filter((row) => row && typeof row.id === 'string' && !idSet.has(row.id)),
        )
      })
      ids.forEach((id) => queryClient.removeQueries({ queryKey: ['jobs', id], exact: true }))

      return { ids, prevLists, prevDetails }
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} job${ids.length !== 1 ? 's' : ''} deleted`)
      queryClient.invalidateQueries({ queryKey: ['jobs'], refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
    },
    onError: (error: Error, _ids, context) => {
      context?.prevLists?.forEach(([key, list]) => {
        queryClient.setQueryData(key, list)
      })
      context?.prevDetails?.forEach(([id, detail]) => {
        if (detail) queryClient.setQueryData(['jobs', id], detail)
      })
      toast.error(error.message || 'Failed to delete jobs')
    },
  })
}

export function useJobsByProperty(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['jobs', 'property', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(name), engineer_assignments(engineer_id, profiles:engineer_id(full_name))')
        .eq('property_id', propertyId!)
        .eq('status', 'completed')
        .order('completed_date', { ascending: false })
        // Wave 17 perf — cap unbounded service-history fetch.
        .limit(200)
      if (error) throw error
      return data
    },
    enabled: !!propertyId,
  })
}

// ── Field-ops mutations (Builder 8A) ─────────────────────────────────────

/**
 * Engineer-side check-in: writes an `arrived` field_event with current GPS
 * (best-effort) and flips the job to `in_progress` with `arrived_at = now()`.
 */
export function useCheckInJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ jobId, engineerId, organisationId }: { jobId: string; engineerId?: string; organisationId?: string }) => {
      let geo = null
      if (isGeolocationSupported()) {
        const result = await getCurrentLocation().catch(() => null)
        if (result && result.ok) geo = result.sample
      }

      // We need org id. If caller didn't provide, fetch it from the job row.
      let orgId = organisationId
      if (!orgId) {
        const { data } = await supabase.from('jobs').select('organisation_id').eq('id', jobId).single()
        orgId = (data?.organisation_id as string | undefined) ?? undefined
      }
      if (!orgId) throw new Error('organisation_id missing for job')

      await insertFieldEvent({
        organisation_id: orgId,
        job_id: jobId,
        engineer_id: engineerId,
        event_type: 'arrived',
        geo,
      })

      const { data, error } = await supabase
        .from('jobs')
        .update({ status: JOB_STATUSES.IN_PROGRESS, arrived_at: new Date().toISOString() })
        .eq('id', jobId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      toast.success('Checked in on site')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', vars.jobId] })
      queryClient.invalidateQueries({ queryKey: ['field_events', vars.jobId] })
    },
    onError: (e: Error) => toast.error(e.message || 'Check-in failed'),
  })
}

/**
 * Engineer-side complete-with-signature: uploads PNG, writes signature_captured
 * + working_completed events, updates the job row, logs a timeline event,
 * notifies the client. All best-effort with toast on failure.
 */
export function useCompleteJobWithSignature() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      jobId: string
      organisationId: string
      engineerId?: string
      outcome: string
      notes: string
      signatureDataUrl: string
      customerName: string
      customerRole: string
      customerEmail?: string
      customerPhone?: string
      emailCopy: boolean
    }) => {
      // 1. Upload PNG
      const upload = await uploadSignaturePng(input.jobId, input.signatureDataUrl)
      if (!upload) throw new Error('Failed to upload signature')

      // 2. signature_captured event
      await insertFieldEvent({
        organisation_id: input.organisationId,
        job_id: input.jobId,
        engineer_id: input.engineerId,
        event_type: 'signature_captured',
        geo: null,
        metadata: {
          signature_path: upload.path,
          customer_name: input.customerName,
          customer_role: input.customerRole,
          customer_email: input.customerEmail ?? null,
          customer_phone: input.customerPhone ?? null,
          email_copy_requested: input.emailCopy,
        },
      })

      // 3. working_completed event
      await insertFieldEvent({
        organisation_id: input.organisationId,
        job_id: input.jobId,
        engineer_id: input.engineerId,
        event_type: 'working_completed',
        geo: null,
        metadata: { outcome: input.outcome },
      })

      // 4. Update job row
      const nowIso = new Date().toISOString()
      const updates: Record<string, unknown> = {
        status: JOB_STATUSES.COMPLETED,
        completed_date: nowIso,
        outcome: input.outcome,
        signature_url: upload.path,
        customer_signature_name: input.customerName,
        customer_signature_role: input.customerRole,
        customer_signature_at: nowIso,
      }
      const { data: jobRow, error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', input.jobId)
        .select()
        .single()
      if (error) throw error

      // 5. service_reports — keep existing reporting flow happy
      await supabase.from('service_reports').insert({
        job_id: input.jobId,
        organisation_id: input.organisationId,
        engineer_id: input.engineerId ?? null,
        notes: input.notes || null,
        outcome: input.outcome,
        signature_url: upload.path,
      })

      // 6. Timeline + notification — best-effort
      try {
        await logTimelineEvent({
          orgId: input.organisationId,
          propertyId: (jobRow as { property_id?: string } | null)?.property_id,
          eventType: TIMELINE_EVENT_TYPES.VISIT_COMPLETED,
          description: `Job "${(jobRow as { title?: string } | null)?.title ?? input.jobId}" completed and signed by ${input.customerName}`,
          metadata: {
            outcome: input.outcome,
            customer_name: input.customerName,
            customer_role: input.customerRole,
          },
        })
      } catch (err) {
        console.warn('[complete-with-signature] timeline log failed', err)
      }

      try {
        const created_by = (jobRow as { created_by?: string } | null)?.created_by
        if (created_by) {
          await createNotification({
            userId: created_by,
            orgId: input.organisationId,
            type: NOTIFICATION_TYPES.JOB_COMPLETED,
            title: 'Job completed',
            message: `Signed off by ${input.customerName}`,
          })
        }
      } catch (err) {
        console.warn('[complete-with-signature] notification failed', err)
      }

      return jobRow
    },
    onSuccess: (_data, vars) => {
      toast.success('Job completed and signed off')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', vars.jobId] })
      queryClient.invalidateQueries({ queryKey: ['field_events', vars.jobId] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to complete job'),
  })
}

export function useAutoAssignJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ jobId, mode }: { jobId: string; mode: 'suggest' | 'apply' }) => {
      const result = await invokeAutoAssign(jobId, mode)
      return result
    },
    onSuccess: (result, vars) => {
      if (vars.mode === 'apply' && result.applied) {
        toast.success(`Engineer auto-assigned (score ${result.applied.score})`)
        queryClient.invalidateQueries({ queryKey: ['jobs'] })
        queryClient.invalidateQueries({ queryKey: ['jobs', vars.jobId] })
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Auto-assign failed'),
  })
}

export function useAssignEngineer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ job_id, engineer_id }: { job_id: string; engineer_id: string }) => {
      const { data, error } = await supabase.from('engineer_assignments').insert({ job_id, engineer_id }).select().single()
      if (error) throw error

      // SLA: stamp response_at on the parent job if it was still null —
      // first-engineer-assigned counts as "responded" for response-leg metrics.
      try {
        const { data: jobRow } = await supabase
          .from('jobs')
          .select('response_at')
          .eq('id', job_id)
          .maybeSingle()
        if (jobRow && (jobRow as { response_at: string | null }).response_at == null) {
          await supabase
            .from('jobs')
            .update({ response_at: new Date().toISOString() })
            .eq('id', job_id)
        }
      } catch { /* defensive — never block assignment */ }

      return data
    },
    onSuccess: (_data, vars) => {
      toast.success('Engineer assigned successfully')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', vars.job_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign engineer')
    },
  })
}

/**
 * Generate a compliance certificate from a job (or compliance item).
 * Builds the template HTML, mints a certificate number, uploads the
 * HTML to Supabase storage, and inserts the certificates row.
 *
 * Builder 8B (Wave 8) — auto-generated PDF compliance certificates.
 */
export function useGenerateCertificate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateCertificateInput) => {
      return await generateCertificate(input)
    },
    onSuccess: (_data, vars) => {
      toast.success('Certificate generated')
      // Invalidate any cached certificate lists keyed on job /
      // compliance item so the new row appears immediately.
      if (vars.jobId) {
        queryClient.invalidateQueries({ queryKey: ['certificates', 'job', vars.jobId] })
      }
      if (vars.complianceItemId) {
        queryClient.invalidateQueries({
          queryKey: ['certificates', 'compliance', vars.complianceItemId],
        })
      }
      queryClient.invalidateQueries({ queryKey: ['certificates'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate certificate')
    },
  })
}
