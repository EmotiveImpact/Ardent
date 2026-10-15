import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button, Chip, Spinner } from '@haumea/ui'
import {
  Calendar,
  Copy,
  Check,
  RefreshCw,
  Link2,
  AlertTriangle,
  Apple,
  CalendarPlus,
  Plug,
  Unplug,
} from 'lucide-react'
import { SkeletonBox } from '@/components/shared/skeletons'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import {
  calendarFeedBaseUrl,
  listCalendarFeedTokens,
  mintCalendarFeedToken,
  revokeCalendarFeedToken,
  type IcsTokenInfo,
  type MintedToken,
} from '@/lib/integrations/calendar/feed-token'
import { PageHeader, Text } from '@haumea/ui'
import {
  buildGoogleOAuthUrl,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleConnection,
  syncGoogleCalendarNow,
  type GoogleCalendarConnection,
} from '@/lib/integrations/calendar/google'

const OAUTH_STATE_KEY = 'haumea_google_calendar_oauth_state'

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'never'
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return d.toLocaleString()
}

const cardCls = 'bg-surface-card border border-border-default rounded-xl'
const cardHeaderCls = 'flex items-center gap-3 px-5 pt-5 pb-3'
const cardBodyCls = 'px-5 pb-5 pt-1'
const linkBtnCls =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label font-medium border border-border-default bg-surface-card text-text-primary hover:bg-surface-elevated transition-colors'

export default function CalendarIntegrationPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tokens, setTokens] = useState<IcsTokenInfo[]>([])
  const [tokensLoading, setTokensLoading] = useState(true)
  const [minted, setMinted] = useState<MintedToken | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const [googleConn, setGoogleConn] = useState<GoogleCalendarConnection | null>(null)
  const [googleLoading, setGoogleLoading] = useState(true)
  const [googleSyncing, setGoogleSyncing] = useState(false)

  const redirectUri = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/dashboard/integrations/calendar`
  }, [])

  // ── Load existing iCal feed tokens ─────────────────
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setTokensLoading(true)
    listCalendarFeedTokens(user.id)
      .then((rows) => {
        if (!cancelled) setTokens(rows)
      })
      .catch((err) => {
        console.warn(err)
        if (!cancelled) setTokens([])
      })
      .finally(() => {
        if (!cancelled) setTokensLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // ── Load Google connection ────────────────────────
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setGoogleLoading(true)
    getGoogleConnection(user.id)
      .then((conn) => {
        if (!cancelled) setGoogleConn(conn)
      })
      .finally(() => {
        if (!cancelled) setGoogleLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // ── Handle OAuth callback (?code=...&state=...) ───
  useEffect(() => {
    if (!user) return
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      toast.error(`Google Calendar connection cancelled (${errorParam})`)
      setSearchParams({}, { replace: true })
      return
    }

    if (!code) return
    const expected = sessionStorage.getItem(OAUTH_STATE_KEY)
    if (!expected || expected !== state) {
      toast.error('OAuth state mismatch — please try connecting again.')
      setSearchParams({}, { replace: true })
      return
    }

    sessionStorage.removeItem(OAUTH_STATE_KEY)
    setSearchParams({}, { replace: true })

    ;(async () => {
      try {
        await connectGoogleCalendar(code, redirectUri)
        toast.success('Google Calendar connected')
        const conn = await getGoogleConnection(user.id)
        setGoogleConn(conn)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to connect Google Calendar'
        toast.error(msg)
      }
    })()
  }, [user, searchParams, setSearchParams, redirectUri])

  // ── iCal handlers ─────────────────────────────────
  async function handleGenerateToken() {
    if (!user) return
    setGenerating(true)
    try {
      const m = await mintCalendarFeedToken(user.id)
      setMinted(m)
      const rows = await listCalendarFeedTokens(user.id)
      setTokens(rows)
      toast.success('Calendar feed generated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate feed URL'
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeCalendarFeedToken(id)
      setTokens((prev) => prev.filter((t) => t.id !== id))
      toast.success('Feed link revoked')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke'
      toast.error(msg)
    }
  }

  async function handleCopy() {
    if (!minted) return
    try {
      await navigator.clipboard.writeText(minted.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy URL')
    }
  }

  // ── Google handlers ───────────────────────────────
  function handleConnectGoogle() {
    try {
      const state = crypto.randomUUID()
      sessionStorage.setItem(OAUTH_STATE_KEY, state)
      const url = buildGoogleOAuthUrl(redirectUri, state)
      window.location.assign(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start OAuth flow'
      toast.error(msg)
    }
  }

  async function handleDisconnectGoogle() {
    setGoogleSyncing(true)
    try {
      await disconnectGoogleCalendar()
      setGoogleConn(null)
      toast.success('Google Calendar disconnected')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect'
      toast.error(msg)
    } finally {
      setGoogleSyncing(false)
    }
  }

  async function handleSyncNow() {
    if (!user) return
    setGoogleSyncing(true)
    try {
      const r = await syncGoogleCalendarNow()
      toast.success(`Synced ${r.synced} job${r.synced === 1 ? '' : 's'}${r.failed ? ` (${r.failed} failed)` : ''}`)
      const conn = await getGoogleConnection(user.id)
      setGoogleConn(conn)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed'
      toast.error(msg)
    } finally {
      setGoogleSyncing(false)
    }
  }

  const feedConfigured = Boolean(calendarFeedBaseUrl())
  const googleClientConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

  return (
    <div className="max-w-4xl space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Integrations', path: '/dashboard/integrations' },
          { label: 'Calendar Sync' },
        ]}
      />

      <header className="mb-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Calendar size={18} className="text-brand-500" />
          </div>
          <PageHeader title="Calendar Sync" />
        </div>
        <p className="text-label text-text-secondary">
          Bring your assigned jobs into the calendar app you already use.
        </p>
      </header>

      {/* ── iCal subscription card ───────────────────── */}
      <section className={cardCls}>
        <div className={cardHeaderCls}>
          <div className="w-8 h-8 rounded-md bg-surface-elevated flex items-center justify-center flex-shrink-0">
            <Link2 size={16} className="text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">Subscribe (iCal)</h2>
            <p className="text-[12.5px] text-text-secondary">
              A read-only feed that auto-refreshes. Works in Apple Calendar, Outlook, Google
              Calendar, Fantastical, and any other iCal client.
            </p>
          </div>
        </div>
        <div className={`${cardBodyCls} space-y-4`}>
          {!feedConfigured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-status-due-soon/10 border border-status-due-soon/30">
              <AlertTriangle size={16} className="text-status-due-soon mt-0.5" />
              <p className="text-[12.5px] text-text-secondary">
                Supabase URL not configured. Set{' '}
                <code className="text-text-primary">VITE_SUPABASE_URL</code> so we can build the
                feed URL.
              </p>
            </div>
          )}

          {minted && (
            <div className="space-y-2">
              <label className="text-caption font-medium uppercase tracking-wide text-text-secondary">
                Your feed URL
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={minted.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 px-3 py-2 rounded-lg border border-border-default bg-surface-elevated text-[12.5px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <Button size="sm" variant="ghost" onPress={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a className={linkBtnCls} href={minted.webcalUrl}>
                  <Apple size={14} />
                  Add to Apple Calendar
                </a>
                <a
                  className={linkBtnCls}
                  href={minted.googleCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarPlus size={14} />
                  Add to Google Calendar
                </a>
              </div>
              <p className="text-[11.5px] text-text-secondary pt-1">
                This URL contains a personal access token. Treat it like a password. If shared by
                accident, revoke it below and generate a new one.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onPress={handleGenerateToken}
              isDisabled={!feedConfigured || generating}
            >
              {generating ? (
                <Spinner size="sm" color="current" className="mr-1" />
              ) : (
                <RefreshCw size={14} />
              )}
              {tokens.length > 0 ? 'Regenerate URL' : 'Generate URL'}
            </Button>
            {tokens.length > 0 && (
              <Text scale="caption" as="span" tone="subtle">
                {tokens.length} active link{tokens.length === 1 ? '' : 's'}
              </Text>
            )}
          </div>

          {/* Existing tokens list */}
          {tokensLoading ? (
            <div className="py-2 space-y-2"><SkeletonBox className="h-4 w-2/3" /><SkeletonBox className="h-4 w-1/2" /></div>
          ) : tokens.length > 0 ? (
            <div className="border-t border-border-default pt-3">
              <p className="text-[11.5px] uppercase tracking-wide text-text-secondary mb-2">
                Active links
              </p>
              <ul className="space-y-1.5">
                {tokens.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface-elevated border border-border-default"
                  >
                    <div className="min-w-0">
                      <p className="text-label text-text-primary truncate">
                        {t.label || 'Calendar feed'}
                      </p>
                      <p className="text-[11.5px] text-text-secondary">
                        Created {formatRelative(t.created_at)} · Last used{' '}
                        {formatRelative(t.last_used_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="danger-soft"
                      onPress={() => handleRevoke(t.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Google Calendar push card ───────────────── */}
      <section className={cardCls}>
        <div className={cardHeaderCls}>
          <div className="w-8 h-8 rounded-md bg-surface-elevated flex items-center justify-center flex-shrink-0">
            <CalendarPlus size={16} className="text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Google Calendar (push)
            </h2>
            <p className="text-[12.5px] text-text-secondary">
              We write events directly into your Google Calendar so updates appear instantly.
            </p>
          </div>
          {googleConn && (
            <Chip size="sm" color="success" variant="soft">Connected</Chip>
          )}
        </div>
        <div className={`${cardBodyCls} space-y-3`}>
          {googleLoading ? (
            <div className="py-2 space-y-2"><SkeletonBox className="h-4 w-2/3" /><SkeletonBox className="h-4 w-1/2" /></div>
          ) : googleConn ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="px-3 py-2 rounded-md bg-surface-elevated border border-border-default">
                  <p className="text-[11.5px] uppercase tracking-wide text-text-secondary">
                    Calendar
                  </p>
                  <p className="text-label text-text-primary">
                    {googleConn.calendar_id ?? 'primary'}
                  </p>
                </div>
                <div className="px-3 py-2 rounded-md bg-surface-elevated border border-border-default">
                  <p className="text-[11.5px] uppercase tracking-wide text-text-secondary">
                    Last synced
                  </p>
                  <p className="text-label text-text-primary">
                    {formatRelative(googleConn.last_synced_at)}
                  </p>
                </div>
              </div>
              {googleConn.last_error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-status-overdue/10 border border-status-overdue/30">
                  <AlertTriangle size={16} className="text-status-overdue mt-0.5" />
                  <p className="text-[12.5px] text-text-secondary">{googleConn.last_error}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={googleSyncing}
                  onPress={handleSyncNow}
                >
                  {googleSyncing ? (
                    <Spinner size="sm" color="current" className="mr-1" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Sync now
                </Button>
                <Button
                  size="sm"
                  variant="danger-soft"
                  onPress={handleDisconnectGoogle}
                  isDisabled={googleSyncing}
                >
                  <Unplug size={14} />
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary">
                Connect once and we'll push every assigned job over the next 90 days into your
                Google Calendar.
              </p>
              <Button
                variant="primary"
                size="sm"
                onPress={handleConnectGoogle}
                isDisabled={!googleClientConfigured}
              >
                <Plug size={14} />
                Connect Google Calendar
              </Button>
              {!googleClientConfigured && (
                <p className="text-[11.5px] text-text-secondary">
                  <code className="text-text-primary">VITE_GOOGLE_CLIENT_ID</code> not configured —
                  ask your admin to set it up.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── What gets synced ────────────────────────── */}
      <section className={cardCls}>
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-[15px] font-semibold text-text-primary">What gets synced</h2>
        </div>
        <div className={`${cardBodyCls}`}>
          <ul className="space-y-2 text-label text-text-secondary">
            <li className="flex items-start gap-2">
              <Check size={14} className="text-brand-500 mt-1 flex-shrink-0" />
              <span>Jobs assigned to you, scheduled within the next 90 days.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check size={14} className="text-brand-500 mt-1 flex-shrink-0" />
              <span>Job title, property, address, priority, status, and description.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check size={14} className="text-brand-500 mt-1 flex-shrink-0" />
              <span>A 30-minute reminder for high or critical priority jobs.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check size={14} className="text-brand-500 mt-1 flex-shrink-0" />
              <span>
                Updates flow one-way: Facilities OS &rarr; your calendar. Edits in your calendar do
                not change the job.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
