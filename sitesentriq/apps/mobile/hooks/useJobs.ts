import { useState, useEffect, useCallback } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { supabase, Job } from '@/lib/supabase'
import { applyOrEnqueue, enqueue, uuidv4, type NewOfflineLeafAction } from '@/lib/offline-queue'
import { composeFailAccessNote, buildFailAccessArgs } from '@/lib/fail-access'
import { cacheIsStale, readOfflineCache, writeOfflineCache } from '@/lib/offline-cache'
import { shouldQueueOfflineWrite } from '@/lib/write-gate'

function useRefreshOnReconnect(refresh: () => void) {
  useEffect(() => {
    let wasOnline: boolean | null = null
    return NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable)
      if (wasOnline === false && online) refresh()
      wasOnline = online
    })
  }, [refresh])
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(false)

  const fetchJobs = useCallback(async (opts?: { silent?: boolean }) => {
    // `silent` = background refresh (e.g. on screen re-focus) — don't flip the
    // skeleton/spinner on, just swap the data underneath.
    if (!opts?.silent) setLoading(true)
    setError(null)
    let servedCache = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('Not authenticated')

      const cached = await readOfflineCache<Job[]>(user.id, 'my-jobs')
      if (cached) {
        servedCache = true
        setJobs(cached.data)
        setLastUpdated(cached.updatedAt)
        setIsStale(cacheIsStale(cached.updatedAt))
        // Cold starts become useful as soon as AsyncStorage resolves; the live
        // query below continues as a background refresh.
        if (!opts?.silent) setLoading(false)
      }

      // Jobs link to engineers via engineer_assignments. Its engineer_id stores
      // EITHER the profile/user id (manual assign) OR the engineers record id
      // (auto-assign) depending on the path — so match BOTH, mirroring the web
      // field list. Without the engineers.id, auto-assigned jobs never appeared.
      const { data: engRecord } = await supabase
        .from('engineers')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle()
      const assignmentIds = [user.id, (engRecord as { id?: string } | null)?.id].filter(Boolean) as string[]

      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*, properties(name, address), clients(name), engineer_assignments!inner(engineer_id)')
        .in('engineer_assignments.engineer_id', assignmentIds)
        .order('scheduled_date', { ascending: true })

      if (fetchError) throw fetchError
      const nextJobs = (data as Job[]) ?? []
      setJobs(nextJobs)
      const updatedAt = await writeOfflineCache(user.id, 'my-jobs', nextJobs)
      setLastUpdated(updatedAt)
      setIsStale(false)
    } catch (err) {
      if (servedCache) setIsStale(true)
      else setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      // A silent (focus) refetch must not touch `loading` at all — otherwise its
      // finally can flip loading=false mid-way through a visible pull-to-refresh
      // and dismiss the spinner early.
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])
  useRefreshOnReconnect(fetchJobs)

  // Today's jobs — scheduled_date is a timestamptz. Bucket by the engineer's
  // LOCAL calendar day (the timezone the rest of the UI renders in via
  // toLocaleTimeString), not the UTC date. Comparing UTC dates would push a
  // job scheduled near midnight into the wrong day for any non-UTC engineer.
  const localYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayYmd = localYmd(new Date())
  const todayJobs = jobs.filter(job => {
    if (!job.scheduled_date) return false
    return localYmd(new Date(job.scheduled_date)) === todayYmd
  })

  return { jobs, todayJobs, loading, error, refetch: fetchJobs, lastUpdated, isStale }
}

export function useJob(id: string) {
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(false)

  const fetchJob = useCallback(async () => {
    setLoading(true)
    setError(null)
    let servedCache = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('Not authenticated')
      const resource = `job:${id}`
      const cached = await readOfflineCache<Job>(user.id, resource)
      if (cached) {
        servedCache = true
        setJob(cached.data)
        setLastUpdated(cached.updatedAt)
        setIsStale(cacheIsStale(cached.updatedAt))
        setLoading(false)
      }

      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*, properties(name, address), clients(name, contact_phone)')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      const nextJob = data as Job
      setJob(nextJob)
      const updatedAt = await writeOfflineCache(user.id, resource, nextJob)
      setLastUpdated(updatedAt)
      setIsStale(false)
    } catch (err) {
      if (servedCache) setIsStale(true)
      else setError(err instanceof Error ? err.message : 'Failed to load job')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])
  useRefreshOnReconnect(fetchJob)

  // ─── Field-critical mutations ────────────────────────────────────
  // Each of the three writes below first checks NetInfo. If we're offline,
  // we enqueue the mutation to AsyncStorage (drained on reconnect by
  // useOffline) and update the job state optimistically so the engineer's
  // UI stays consistent with their action. If we're online we hit Supabase
  // directly — same behaviour as before, plus the queue path as a fallback.
  // Returns `{ error }` for compatibility with the call sites; offline
  // enqueues return `{ error: null }` because the mutation is durable.

  // GPS for arrival/departure lives in field_events, not jobs. The event is a
  // required member of the same replay sequence as the status change, so a
  // check-in can no longer appear successful with silently missing evidence.
  async function buildFieldEvent(
    eventType: 'arrived' | 'working_completed',
    lat: number,
    lng: number,
  ): Promise<NewOfflineLeafAction> {
    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) throw new Error('Job organisation unavailable for GPS evidence')
    const { data: { session } } = await supabase.auth.getSession()
    return { kind: 'insert', table: 'field_events', payload: {
      id: uuidv4(),
      organisation_id: orgId,
      job_id: id,
      engineer_id: session?.user?.id ?? null,
      event_type: eventType,
      latitude: lat,
      longitude: lng,
    } }
  }

  async function checkIn(lat: number, lng: number): Promise<{ error: { message: string } | null; queued?: boolean }> {
    // Real columns: arrived_at / working_started_at / status. The old
    // checkin_at/checkin_lat/checkin_lng columns never existed → the update threw.
    const now = new Date().toISOString()
    const patch = {
      arrived_at: now,
      working_started_at: now,
      status: 'in_progress' as const,
    }
    const evidence = await buildFieldEvent('arrived', lat, lng)
    const action = {
      kind: 'sequence' as const,
      actions: [
        { kind: 'update' as const, table: 'jobs', payload: patch, where: { id } },
        evidence,
      ],
    }
    const result = await shouldQueueOfflineWrite()
      ? (await enqueue(action), { queued: true })
      : await applyOrEnqueue(action)
    setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
    if (!result.queued) await fetchJob()
    return { error: null, queued: result.queued }
  }

  async function checkOut(lat: number, lng: number): Promise<{ error: { message: string } | null; queued?: boolean }> {
    // Real columns: completed_date / status (no checkout_*/lat/lng columns).
    const patch = {
      completed_date: new Date().toISOString(),
      status: 'completed' as const,
    }
    const evidence = await buildFieldEvent('working_completed', lat, lng)
    const action = {
      kind: 'sequence' as const,
      actions: [
        { kind: 'update' as const, table: 'jobs', payload: patch, where: { id } },
        evidence,
        { kind: 'function_invoke' as const, fn: 'job-completion-email', body: { job_id: id } },
      ],
    }
    const result = await shouldQueueOfflineWrite()
      ? (await enqueue(action), { queued: true })
      : await applyOrEnqueue(action)
    setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
    if (!result.queued) await fetchJob()
    return { error: null, queued: result.queued }
  }

  async function updateStatus(status: 'pending' | 'pending_external' | 'incomplete' | 'revisit') {
    // These are the existing jobs_status_check values. Product-facing labels
    // use clearer field language (on hold / awaiting parts) without emitting
    // nonexistent on_hold or awaiting_parts database values.
    const patch = { status }
    const action = { kind: 'update' as const, table: 'jobs', payload: patch, where: { id } }
    const result = await shouldQueueOfflineWrite()
      ? (await enqueue(action), { queued: true })
      : await applyOrEnqueue(action)
    setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
    if (!result.queued) await fetchJob()
    return { error: null, queued: result.queued }
  }

  async function setExpectedArrival(minutes: number) {
    const expected = new Date(Date.now() + minutes * 60_000)
    const patch = {
      expected_arrival_at: expected.toISOString(),
      eta_earliest_at: new Date(expected.getTime() - 10 * 60_000).toISOString(),
      eta_latest_at: new Date(expected.getTime() + 10 * 60_000).toISOString(),
    }
    const action = { kind: 'update' as const, table: 'jobs', payload: patch, where: { id } }
    const result = await shouldQueueOfflineWrite()
      ? (await enqueue(action), { queued: true })
      : await applyOrEnqueue(action)
    setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
    return { ...result, expectedArrivalAt: patch.expected_arrival_at }
  }

  // Sprint 3 / C3 — Engineer notes, with offline-queued save.
  // Inserts into the existing `notes` table (chronological log, one
  // row per note, author + timestamp preserved). Offline-queued via
  // the existing AsyncStorage queue — drains on reconnect.
  //
  // Why not a single text column on jobs:
  //   The dashboard already shows `notes` as a chronological feed on
  //   property + job + asset detail pages. Inserting a new row keeps
  //   that feed's history intact and lets the FM team see "engineer
  //   added a note at 14:32" rather than overwriting earlier context.
  async function addNote(content: string) {
    if (!content.trim()) return { error: { message: 'note is empty' } }
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }

    // We need organisation_id for the insert. Pull it from the loaded
    // job — if the job hasn't loaded yet we bail (the UI shouldn't
    // surface the note input in that state anyway).
    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) return { error: { message: 'job not loaded' } }

    const row = {
      job_id: id,
      organisation_id: orgId,
      content: content.trim(),
      user_id: u.id,
      user_name: u.user_metadata?.full_name ?? u.email ?? 'Engineer',
    }

    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'insert', table: 'notes', payload: row })
      return { error: null, queued: true }
    }
    const { error } = await supabase.from('notes').insert(row)
    return { error }
  }

  // Critical fix #3 — Service report submission, with offline-queued save.
  // Inserts into the `service_reports` table. The web edge function
  // (supabase/functions/job-completion-email/index.ts) reads the most
  // recent report for the job to populate the customer-facing email
  // outcome chip + engineer name. Without this the email goes out
  // empty when an engineer closes a job from mobile.
  //
  // Signature: reference the engineer's own signature
  // (`jobs.engineer_signature_url`, migration 00090) captured via
  // saveSignature(type:'engineer'). The engineer signs once per visit; the
  // report just references that URL. We fall back to the customer slot only
  // if no engineer signature exists, so the report is never left blank when
  // a signature was in fact captured.
  //
  // Checklist (jsonb): not surfaced from mobile yet — the web side
  // doesn't render structured checklists in the email either, so leaving
  // it null is consistent with current behaviour. See open question in
  // commit message.
  async function submitServiceReport(payload: {
    outcome: 'pass' | 'fail' | 'incomplete' | 'revisit' | 'n_a'
    notes: string
  }) {
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }

    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) return { error: { message: 'job not loaded' } }

    const row = {
      job_id: id,
      organisation_id: orgId,
      engineer_id: u.id,
      outcome: payload.outcome,
      notes: payload.notes.trim() || null,
      // The engineer's sign-off lives in jobs.engineer_signature_url (00090);
      // jobs.signature_url is the CUSTOMER slot. Prefer the engineer's, fall
      // back to the customer signature only if the engineer didn't sign.
      signature_url:
        (job as unknown as { engineer_signature_url?: string | null } | null)
          ?.engineer_signature_url ??
        (job as unknown as { signature_url?: string | null } | null)
          ?.signature_url ??
        null,
      submitted_at: new Date().toISOString(),
    }

    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'insert', table: 'service_reports', payload: row })
      return { error: null, queued: true, row }
    }
    const { error } = await supabase.from('service_reports').insert(row)
    return { error, row }
  }

  // ─── Time logging ────────────────────────────────────────────────
  // Mirrors the web canonical insert in
  // apps/web/src/lib/time-tracking/hooks.ts → useUpsertManualEntry().
  // That insert sends EXACTLY: organisation_id, job_id, engineer_id, kind,
  // started_at, ended_at, rate_per_hour (null), billable, notes (null).
  // It deliberately OMITS duration_minutes (nullable; the timesheet computes
  // duration from started/ended) and billed_invoice_id (nullable, set later
  // at invoicing). We replicate that field-for-field.
  //
  // NOT-NULL columns on time_entries are: organisation_id, job_id,
  // engineer_id, kind, started_at, billable (verified against the live
  // schema). kind also has a CHECK constraint allowing ONLY
  // travel | on_site | admin | break — 'labour' is NOT a valid value and
  // would throw (incl. on offline replay), so we restrict to those four and
  // default to on_site (the web's engineer default for time on a job).
  async function logTime(payload: {
    kind: 'travel' | 'on_site' | 'admin' | 'break'
    startedAt: string
    endedAt: string
    billable: boolean
    notes?: string | null
  }) {
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }

    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) return { error: { message: 'job not loaded' } }

    const row = {
      organisation_id: orgId,
      job_id: id,
      engineer_id: u.id,
      kind: payload.kind,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
      // Mirror the web: rate_per_hour is left null here; the timesheet falls
      // back to the engineer's default_billable_rate when costing.
      rate_per_hour: null,
      billable: payload.billable,
      notes: payload.notes?.trim() || null,
    }

    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'insert', table: 'time_entries', payload: row })
      return { error: null, queued: true }
    }
    const { error } = await supabase.from('time_entries').insert(row)
    return { error }
  }

  // ─── Raise a defect (action) ─────────────────────────────────────
  // Mirrors the web canonical insert in
  // apps/web/src/routes/actions/new.tsx → useCreateAction (use-actions.ts).
  // The web spreads the form { title, description, priority, property_id,
  // job_id, due_date } and adds status:'open' + organisation_id, then inserts
  // straight into `actions`. It NEVER sends asset_id — and those inserts
  // succeed, because asset_id is nullable on the live schema. We replicate
  // that, and additionally let the engineer optionally pin the defect to one
  // of the property's assets (assetId), since jobs carries no asset_id column
  // (no job→asset relation exists). null asset_id is fully valid.
  //
  // NOT-NULL columns on actions are only: organisation_id, title, status,
  // priority (status/priority also have DB defaults). We set created_by +
  // assigned_to to the current engineer so the dashboard shows provenance.
  async function raiseAction(payload: {
    title: string
    description?: string | null
    priority: 'low' | 'medium' | 'high'
    dueDate?: string | null
    assetId?: string | null
  }) {
    if (!payload.title.trim()) return { error: { message: 'title is required' } }
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }

    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) return { error: { message: 'job not loaded' } }

    const propertyId = (job as unknown as { property_id?: string | null } | null)?.property_id ?? null

    const row = {
      organisation_id: orgId,
      property_id: propertyId,
      job_id: id,
      // Nullable on the schema; the web omits it entirely. We pass the
      // engineer's optional pick or null — never a bogus value.
      asset_id: payload.assetId || null,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      status: 'open' as const,
      priority: payload.priority,
      due_date: payload.dueDate || null,
      assigned_to: u.id,
      created_by: u.id,
    }

    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'insert', table: 'actions', payload: row })
      return { error: null, queued: true }
    }
    const { error } = await supabase.from('actions').insert(row)
    return { error }
  }

  async function saveSignature(signatureUrl: string, type: 'customer' | 'engineer') {
    // The SignaturePad hands us a base64 data URL. Upload it to the private
    // `field-signatures` bucket and store the OBJECT PATH (canonical — mirrors
    // the web uploadSignaturePng) so the tenant download (sign-tenant-file) and
    // the completion email can re-sign + resolve it. A raw data URL only rendered
    // in-app and 403'd everywhere else.
    const column = type === 'customer' ? 'signature_url' : 'engineer_signature_url'
    const stamp: Record<string, string> = type === 'customer' ? { customer_signature_at: new Date().toISOString() } : {}

    // Non-data values (already a path/url) are stored as-is for backwards compat.
    if (!signatureUrl.startsWith('data:')) {
      const patch: Record<string, string> = { [column]: signatureUrl, ...stamp }
      const action = { kind: 'update' as const, table: 'jobs', payload: patch, where: { id } }
      const result = await shouldQueueOfflineWrite()
        ? (await enqueue(action), { queued: true })
        : await applyOrEnqueue(action)
      setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
      if (!result.queued) await fetchJob()
      return { error: null, queued: result.queued }
    }

    const path = `${id}/${type}-${Date.now()}.png`
    const patch: Record<string, string> = { [column]: path, ...stamp }

    const action = {
      kind: 'sequence' as const,
      actions: [
        {
          kind: 'storage_upload' as const,
          payload: { bucket: 'field-signatures', path, base64_data: signatureUrl, content_type: 'image/png' },
        },
        { kind: 'update' as const, table: 'jobs', payload: patch, where: { id } },
      ],
    }
    const result = await shouldQueueOfflineWrite()
      ? (await enqueue(action), { queued: true })
      : await applyOrEnqueue(action)
    setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
    if (!result.queued) await fetchJob()
    return { error: null, queued: result.queued }
  }

  // ─── Failed access ───────────────────────────────────────────────
  // The #1 reason a visit doesn't complete. Sets jobs.status = 'failed_access'
  // AND logs the reason note in ONE transactional RPC (record_failed_access,
  // migration 00114) so the pair can't split across offline drain passes —
  // previously two independent queue actions could leave a status change with
  // no reason, or a reason on a job whose status never changed.
  async function failAccess(payload: { reason: string; notes?: string | null }) {
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }

    const note = composeFailAccessNote(payload)
    // Stamp the note PK here (not server-side) so an offline replay of the
    // same queued action converges on conflict instead of duplicating.
    const args = buildFailAccessArgs({
      jobId: id,
      noteId: uuidv4(),
      note,
      userName: u.user_metadata?.full_name ?? u.email ?? 'Engineer',
    })
    const patch = { status: 'failed_access' as const }

    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'rpc', fn: 'record_failed_access', args })
      setJob(prev => (prev ? ({ ...prev, ...patch } as Job) : prev))
      return { error: null, queued: true }
    }
    const { error } = await supabase.rpc('record_failed_access', args)
    if (!error) await fetchJob()
    return { error }
  }

  // ─── Parts / materials used on the job ───────────────────────────
  // Inserts into job_parts (migration 00092). RLS requires added_by =
  // auth.uid() + the caller's org. Offline-queued like the other writes.
  async function addPart(payload: { description: string; quantity: number; unitCost?: number | null }) {
    if (!payload.description.trim()) return { error: { message: 'description is required' } }
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }
    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) return { error: { message: 'job not loaded' } }

    const row = {
      organisation_id: orgId,
      job_id: id,
      description: payload.description.trim(),
      quantity: payload.quantity,
      unit_cost: payload.unitCost ?? null,
      added_by: u.id,
    }
    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'insert', table: 'job_parts', payload: row })
      return { error: null, queued: true }
    }
    const { error } = await supabase.from('job_parts').insert(row)
    return { error }
  }

  // ─── Compliance certificate form (V1 #9) ─────────────────────────
  // Inserts into cert_completions (migration 00103). RLS requires
  // completed_by = auth.uid() + the caller's org. Offline-queued.
  async function saveCert(payload: {
    certType: string
    answers: Record<string, string>
    outcome?: 'pass' | 'fail' | 'remedial' | 'n_a' | null
    notes?: string | null
    assetId?: string | null
  }) {
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user
    if (!u) return { error: { message: 'not authenticated' } }
    const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
    if (!orgId) return { error: { message: 'job not loaded' } }

    const row = {
      organisation_id: orgId,
      job_id: id,
      asset_id: payload.assetId ?? null,
      cert_type: payload.certType,
      answers: payload.answers,
      outcome: payload.outcome ?? null,
      notes: payload.notes?.trim() || null,
      completed_by: u.id,
    }
    if (await shouldQueueOfflineWrite()) {
      await enqueue({ kind: 'insert', table: 'cert_completions', payload: row })
      return { error: null, queued: true }
    }
    const { error } = await supabase.from('cert_completions').insert(row)
    return { error }
  }

  return {
    job,
    loading,
    error,
    refetch: fetchJob,
    checkIn,
    checkOut,
    updateStatus,
    setExpectedArrival,
    saveSignature,
    addNote,
    submitServiceReport,
    logTime,
    raiseAction,
    failAccess,
    addPart,
    saveCert,
    lastUpdated,
    isStale,
  }
}
