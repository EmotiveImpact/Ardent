import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@haumea/ui'
import { AppCard, Heading, Text } from '@haumea/ui'
import { CalendarPlus, Check, Clock, Copy, Link2, Mail, MapPin, Navigation, X } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { sendTrackingLink } from '@/lib/email'
import { useUpdateJob } from '@/hooks/use-jobs'
import { buildIcsUrl, buildWebcalUrl } from '@/hooks/use-job-ics-url'
import {
  buildEtaPublicUrl,
  useIssueJobEtaToken,
  useJobEtaTokens,
  useRevokeJobEtaToken,
} from '@/hooks/use-job-eta-token'
import type { EngineerAssignmentWithProfile } from '@haumea/types'

function formatArrivalWindow(earliestAt: string | null, latestAt: string | null): string | undefined {
  if (!earliestAt || !latestAt) return undefined
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  try {
    return `${fmt(earliestAt)} – ${fmt(latestAt)}`
  } catch {
    return undefined
  }
}

export function JobEtaPanel({
  jobId,
  organisationId,
  status,
  earliestAt,
  latestAt,
  propertyAddress,
  propertyName,
  clientId,
  assignments,
}: {
  jobId: string
  organisationId: string
  status: string
  earliestAt: string | null
  latestAt: string | null
  propertyAddress?: string | null
  propertyName?: string | null
  clientId?: string | null
  assignments?: EngineerAssignmentWithProfile[]
}) {
  const showEtaEditor = status === 'scheduled' || status === 'in_progress' || status === 'travelling'
  const engineerName =
    assignments?.[0]?.profiles?.full_name?.trim().split(/\s+/)[0] ?? null

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <ShareTrackingLinkButton
        jobId={jobId}
        organisationId={organisationId}
        clientId={clientId ?? null}
        propertyName={propertyName ?? null}
        engineerName={engineerName}
        earliestAt={earliestAt}
        latestAt={latestAt}
      />
      {showEtaEditor ? (
        <EtaWindowEditor jobId={jobId} earliestAt={earliestAt} latestAt={latestAt} />
      ) : null}
      <AppCard>
        <div className="mb-3 flex items-center gap-2">
          <Navigation size={16} className="text-brand-500" />
          <Heading level={2} scale="body">
            Engineer location
          </Heading>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg bg-surface-page p-3">
            <div className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-text-muted" />
              <Text scale="caption" tone="muted">
                {propertyAddress || 'No property address recorded'}
              </Text>
            </div>
          </div>
          {assignments && assignments.length > 0 ? (
            <ul className="space-y-2">
              {assignments.map((assignment) => (
                <li key={assignment.id} className="flex items-center gap-3 rounded-lg bg-surface-page p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-label font-medium text-accent-soft-foreground">
                    {assignment.profiles?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <Text scale="caption" weight="medium" className="truncate">
                      {assignment.profiles?.full_name || 'Unknown'}
                    </Text>
                    <Text scale="micro" tone="muted" className="truncate">
                      {assignment.profiles?.email || ''}
                    </Text>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Text scale="caption" tone="muted">
              No engineer assigned yet.
            </Text>
          )}
        </div>
      </AppCard>
    </aside>
  )
}

function ShareTrackingLinkButton({
  jobId,
  organisationId,
  clientId,
  propertyName,
  engineerName,
  earliestAt,
  latestAt,
}: {
  jobId: string
  organisationId: string
  clientId: string | null
  propertyName: string | null
  engineerName: string | null
  earliestAt: string | null
  latestAt: string | null
}) {
  const issue = useIssueJobEtaToken()
  const revoke = useRevokeJobEtaToken()
  const { data: existingTokens } = useJobEtaTokens(jobId)
  const [recentlyCopied, setRecentlyCopied] = useState(false)
  const [recentlyCopiedIcs, setRecentlyCopiedIcs] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [recentlyEmailed, setRecentlyEmailed] = useState(false)

  const liveToken = existingTokens && existingTokens.length > 0 ? existingTokens[0] : null

  // Customer contact email — pulled from the client record so the FM admin
  // can send the tracking link in one click rather than copy-pasting.
  const { data: contactEmail } = useQuery({
    queryKey: ['client-contact-email', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('contact_email')
        .eq('id', clientId!)
        .maybeSingle()
      if (error) throw error
      return (data?.contact_email as string | null) ?? null
    },
  })

  /** Mint a token if there isn't a live one, otherwise reuse it. */
  const ensureToken = async (): Promise<string> => {
    if (liveToken) return liveToken.token
    const result = await issue.mutateAsync({ jobId, organisationId })
    return result.token
  }

  const handleShare = async () => {
    let url: string
    if (liveToken) {
      url = buildEtaPublicUrl(liveToken.token)
    } else {
      const result = await issue.mutateAsync({ jobId, organisationId })
      url = result.public_url
    }
    try {
      await navigator.clipboard.writeText(url)
      setRecentlyCopied(true)
      toast.success('Tracking link copied - paste it into SMS / email')
      setTimeout(() => setRecentlyCopied(false), 2000)
    } catch {
      toast.message('Tracking link', { description: url })
    }
  }

  const handleEmail = async () => {
    if (!contactEmail) {
      toast.error('No customer email on file for this client')
      return
    }
    setEmailing(true)
    try {
      const token = await ensureToken()
      const result = await sendTrackingLink({
        to: contactEmail,
        engineerName: engineerName ?? undefined,
        propertyName: propertyName ?? undefined,
        arrivalWindow: formatArrivalWindow(earliestAt, latestAt),
        trackUrl: buildEtaPublicUrl(token),
      })
      if (result.success) {
        setRecentlyEmailed(true)
        toast.success(`Tracking link sent to ${contactEmail}`)
        setTimeout(() => setRecentlyEmailed(false), 2500)
      } else {
        toast.error(result.error || 'Could not send the tracking link')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the tracking link')
    } finally {
      setEmailing(false)
    }
  }

  const handleShareIcs = async () => {
    let token: string
    if (liveToken) {
      token = liveToken.token
    } else {
      const result = await issue.mutateAsync({ jobId, organisationId })
      token = result.token
    }
    const url = buildIcsUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      setRecentlyCopiedIcs(true)
      toast.success('ICS subscription URL copied')
      setTimeout(() => setRecentlyCopiedIcs(false), 2000)
    } catch {
      toast.message('ICS subscription URL', { description: url })
    }
  }

  const handleRevoke = async () => {
    if (!liveToken) return
    await revoke.mutateAsync(liveToken.id)
  }

  return (
    <AppCard>
      <div className="space-y-2">
      <Button
        variant="primary"
        size="sm"
        fullWidth
        isDisabled={emailing || issue.isPending || !contactEmail}
        onPress={handleEmail}
        aria-label={contactEmail ? `Send tracking link to ${contactEmail}` : 'No customer email on file'}
      >
        {recentlyEmailed ? (
          <>
            <Check size={14} />
            Sent
          </>
        ) : (
          <>
            <Mail size={14} />
            {emailing ? 'Sending…' : 'Send tracking link to customer'}
          </>
        )}
      </Button>
      {!contactEmail ? (
        <Text scale="micro" tone="muted" className="block">
          Add a contact email to this client to enable one-click send.
        </Text>
      ) : null}
      <Button variant="outline" size="sm" fullWidth isDisabled={issue.isPending} onPress={handleShare}>
        {recentlyCopied ? (
          <>
            <Check size={14} />
            Copied
          </>
        ) : (
          <>
            {liveToken ? <Copy size={14} /> : <Link2 size={14} />}
            {liveToken ? 'Copy tracking link' : 'Share tracking link'}
          </>
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        fullWidth
        isDisabled={issue.isPending}
        onPress={handleShareIcs}
        aria-label="Copy ICS calendar subscription URL"
      >
        {recentlyCopiedIcs ? (
          <>
            <Check size={14} />
            Copied
          </>
        ) : (
          <>
            <CalendarPlus size={14} />
            Customer calendar (.ics)
          </>
        )}
      </Button>
      {liveToken ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <a
            href={buildWebcalUrl(liveToken.token)}
            className="inline-flex text-micro text-text-muted hover:text-brand-500"
            title="One-tap subscribe on macOS / iOS"
          >
            webcal://
          </a>
          <Button variant="ghost" size="sm" isDisabled={revoke.isPending} onPress={handleRevoke} aria-label="Revoke tracking link">
            <X size={14} />
          </Button>
        </div>
      ) : null}
      </div>
    </AppCard>
  )
}

function EtaWindowEditor({
  jobId,
  earliestAt,
  latestAt,
}: {
  jobId: string
  earliestAt: string | null
  latestAt: string | null
}) {
  const update = useUpdateJob()

  const toLocalInput = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [earliest, setEarliest] = useState(toLocalInput(earliestAt))
  const [latest, setLatest] = useState(toLocalInput(latestAt))
  const dirty = earliest !== toLocalInput(earliestAt) || latest !== toLocalInput(latestAt)

  const setQuickPick = (minsFromNow: number) => {
    const start = new Date(Date.now() + minsFromNow * 60_000)
    const end = new Date(start.getTime() + 30 * 60_000)
    setEarliest(toLocalInput(start.toISOString()))
    setLatest(toLocalInput(end.toISOString()))
  }

  const handleSave = async () => {
    if (!earliest || !latest) {
      toast.error('Both arrival times are required')
      return
    }
    if (new Date(latest) < new Date(earliest)) {
      toast.error('"Latest" must be after "earliest"')
      return
    }
    await update.mutateAsync({
      id: jobId,
      eta_earliest_at: new Date(earliest).toISOString(),
      eta_latest_at: new Date(latest).toISOString(),
    })
  }

  const handleClear = async () => {
    await update.mutateAsync({
      id: jobId,
      eta_earliest_at: null,
      eta_latest_at: null,
    })
    setEarliest('')
    setLatest('')
  }

  return (
    <AppCard>
      <div className="mb-3 flex items-center gap-2">
        <Clock size={14} className="text-brand-500" />
        <Heading level={2} scale="body">
          Customer arrival window
        </Heading>
      </div>
      <Text scale="micro" tone="muted" className="mb-3">
        Shown on the public tracking link.
      </Text>
      <div className="space-y-3">
        <label className="block">
          <span className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">Earliest arrival</span>
          <input
            type="datetime-local"
            value={earliest}
            onChange={(e) => setEarliest(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
        <label className="block">
          <span className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">Latest arrival</span>
          <input
            type="datetime-local"
            value={latest}
            onChange={(e) => setLatest(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-micro text-text-muted">Quick:</span>
          {[30, 60, 120].map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => setQuickPick(mins)}
              className="inline-flex rounded-md bg-surface-page px-2.5 py-1 text-micro font-medium text-text-secondary hover:bg-border-subtle"
            >
              {mins === 30 ? 'In 30 min' : `In ${mins / 60} hr`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
          <Button variant="primary" size="sm" isDisabled={!dirty || update.isPending} onPress={handleSave}>
            {update.isPending ? 'Saving...' : 'Save window'}
          </Button>
          {(earliestAt || latestAt) ? (
            <Button variant="ghost" size="sm" isDisabled={update.isPending} onPress={handleClear}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </AppCard>
  )
}
