// W2-T7 — Public, no-login subcontractor work page.
//
// One link = one job for one subcontractor: accept → upload RAMS →
// photos → signature → mark complete. Mounted OUTSIDE the dashboard auth
// shell (like /track/:token): no session, no sidebar, plain fetch to the
// subcontractor-job edge function (token IS the auth), uploads via
// short-lived signed URLs so files never transit the function.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import {
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  Loader2,
  PenLine,
  XCircle,
} from 'lucide-react'
import { SignaturePad } from '@/components/shared/signature-pad'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const FN_URL = `${SUPABASE_URL}/functions/v1/subcontractor-job`

interface Summary {
  token_status: 'issued' | 'accepted' | 'completed' | 'revoked'
  expires_at: string
  subcontractor: string | null
  job: {
    job_number: string | null
    title: string
    description: string | null
    scheduled_date: string | null
    priority: string | null
    property: { name: string | null; address: string | null }
  }
  progress: {
    accepted_at: string | null
    completed_at: string | null
    rams_count: number
    photo_count: number
    has_signature: boolean
  }
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; code: string }
  | { kind: 'ready'; summary: Summary }

async function api(token: string, body?: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  }
  if (body) {
    headers['Content-Type'] = 'application/json'
    return fetch(FN_URL, { method: 'POST', headers, body: JSON.stringify({ token, ...body }) })
  }
  return fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { headers })
}

export default function SubbieWorkPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [showSignature, setShowSignature] = useState(false)
  const ramsInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      const res = await api(token)
      const data = await res.json()
      if (!res.ok) {
        setState({ kind: 'error', code: data?.error ?? 'lookup_failed' })
      } else {
        setState({ kind: 'ready', summary: data as Summary })
      }
    } catch {
      setState({ kind: 'error', code: 'lookup_failed' })
    }
  }, [token])

  useEffect(() => {
    void reload()
  }, [reload])

  const act = async (label: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(label)
    try {
      const res = await api(token, body)
      const data = await res.json()
      if (!res.ok) {
        alert(data?.error ? `Something went wrong: ${data.error}` : 'Something went wrong')
        return false
      }
      await reload()
      return true
    } catch {
      alert('Network problem — please try again')
      return false
    } finally {
      setBusy(null)
    }
  }

  const uploadFile = async (kind: 'rams' | 'photo', file: File) => {
    setBusy(kind)
    try {
      const res = await api(token, {
        action: 'request_upload',
        kind,
        filename: file.name,
        content_type: file.type,
      })
      const data = await res.json()
      if (!res.ok || !data?.upload?.signed_url) {
        alert(data?.error === 'content_type_not_allowed'
          ? 'That file type is not accepted here.'
          : 'Upload failed — please try again.')
        return
      }
      const put = await fetch(data.upload.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!put.ok) {
        alert('Upload failed — please try again.')
        return
      }
      await reload()
    } catch {
      alert('Network problem — please try again')
    } finally {
      setBusy(null)
    }
  }

  // ── Error / loading shells ─────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center py-16 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-3 text-sm">Loading your job…</p>
        </div>
      </Shell>
    )
  }
  if (state.kind === 'error') {
    const message =
      state.code === 'token_expired'
        ? 'This work link has expired. Ask the office to send a fresh one.'
        : state.code === 'token_revoked'
          ? 'This work link has been withdrawn. Contact the office if you still need access.'
          : 'This work link is not valid. Check you have the full link from your message.'
    return (
      <Shell>
        <div className="flex flex-col items-center py-16 text-center">
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="mt-4 max-w-sm text-[15px] text-slate-700">{message}</p>
        </div>
      </Shell>
    )
  }

  const { summary } = state
  const { job, progress, token_status } = summary
  const accepted = token_status === 'accepted'
  const completed = token_status === 'completed'

  return (
    <Shell subtitle={summary.subcontractor ?? undefined}>
      {/* Job card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {job.job_number ?? 'Work order'}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">{job.title}</h1>
        {job.description && <p className="mt-2 text-sm text-slate-600">{job.description}</p>}
        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          {job.property.name && (
            <p className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              {job.property.name}
              {job.property.address ? ` — ${job.property.address}` : ''}
            </p>
          )}
          {job.scheduled_date && (
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              {new Date(job.scheduled_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {completed ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
          <p className="mt-2 font-medium text-emerald-800">Work submitted</p>
          <p className="mt-1 text-sm text-emerald-700">
            The office has been notified and will review your submission. You can close this page.
          </p>
        </div>
      ) : !accepted ? (
        <div className="mt-5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act('accept', { action: 'accept' })}
            className="w-full rounded-xl bg-[#e8772e] px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#d96a24] disabled:opacity-60"
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept this job'}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            Accepting unlocks document upload, photos and sign-off.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {/* Step: RAMS */}
          <StepCard
            icon={<FileUp className="h-5 w-5" />}
            title="Upload RAMS"
            done={progress.rams_count > 0}
            doneLabel={`${progress.rams_count} uploaded — awaiting office approval`}
            actionLabel={busy === 'rams' ? 'Uploading…' : 'Upload RAMS / method statement'}
            disabled={busy !== null}
            onAction={() => ramsInputRef.current?.click()}
          />
          <input
            ref={ramsInputRef}
            type="file"
            accept=".pdf,.doc,.docx,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadFile('rams', f)
              e.target.value = ''
            }}
          />

          {/* Step: photos */}
          <StepCard
            icon={<Camera className="h-5 w-5" />}
            title="Add photos"
            done={progress.photo_count > 0}
            doneLabel={`${progress.photo_count} photo${progress.photo_count === 1 ? '' : 's'} attached`}
            actionLabel={busy === 'photo' ? 'Uploading…' : 'Add a photo'}
            disabled={busy !== null}
            onAction={() => photoInputRef.current?.click()}
            optional
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadFile('photo', f)
              e.target.value = ''
            }}
          />

          {/* Step: signature */}
          <StepCard
            icon={<PenLine className="h-5 w-5" />}
            title="Sign off"
            done={progress.has_signature}
            doneLabel="Signature captured"
            actionLabel="Add signature"
            disabled={busy !== null}
            onAction={() => setShowSignature((v) => !v)}
          />
          {showSignature && !progress.has_signature && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <SignaturePad
                label="Sign in the box below"
                onSave={(dataUrl) => {
                  void act('signature', { action: 'signature', base64: dataUrl }).then((ok) => {
                    if (ok) setShowSignature(false)
                  })
                }}
                onClear={() => undefined}
              />
            </div>
          )}

          {/* Step: complete — guide the field worker on what's still outstanding
              rather than letting them submit an empty job and hit a raw error. */}
          {(() => {
            const missing: string[] = []
            if (progress.rams_count === 0) missing.push('upload your RAMS')
            if (!progress.has_signature) missing.push('add your signature')
            const blocked = missing.length > 0
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="flex items-center gap-2 text-[15px] font-medium text-slate-900">
                  <ClipboardCheck className="h-5 w-5 text-slate-500" /> Finish &amp; submit
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Completion notes for the office (optional)"
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#e8772e]/40"
                />
                {blocked && (
                  <p className="mt-2 text-xs text-slate-500">
                    Before submitting, please {missing.join(' and ')}.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy !== null || blocked}
                  onClick={() => act('complete', { action: 'complete', notes })}
                  className="mt-3 w-full rounded-xl bg-[#e8772e] px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#d96a24] disabled:opacity-60"
                >
                  {busy === 'complete' ? 'Submitting…' : 'Mark work complete'}
                </button>
              </div>
            )
          })()}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#e8772e]">
            Work link
          </p>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
        <p className="mt-8 text-center text-[11px] text-slate-400">
          Secure single-job link · Powered by SiteSentriq
        </p>
      </div>
    </div>
  )
}

function StepCard({
  icon,
  title,
  done,
  doneLabel,
  actionLabel,
  onAction,
  disabled,
  optional,
}: {
  icon: React.ReactNode
  title: string
  done: boolean
  doneLabel: string
  actionLabel: string
  onAction: () => void
  disabled?: boolean
  optional?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={done ? 'text-emerald-600' : 'text-slate-500'}>
          {done ? <CheckCircle2 className="h-5 w-5" /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-slate-900">
            {title}
            {optional && <span className="ml-1.5 text-xs font-normal text-slate-400">optional</span>}
          </p>
          {done && <p className="text-xs text-emerald-700">{doneLabel}</p>}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onAction}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
