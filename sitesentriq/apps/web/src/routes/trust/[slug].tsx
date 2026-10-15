// Strategic 1 follow-up — Public Trust URL page.
//
// This is the "Vanta Trust Center" equivalent: a no-login URL where
// any prospect / auditor / insurer / board member can verify the org's
// continuous compliance posture. One link, one number, one updated-on
// timestamp. That's the entire pitch.
//
// What's NOT here:
//   - Sign-in / nav / sidebar — none of it (this page is the marketing
//     surface for the buyer, NOT a dashboard).
//   - Anything that calls supabase.auth.* — the public-trust-score edge
//     function is invoked via plain fetch (anon key in header) so the
//     bundle stays small for the public route.
//   - Any operational data — no client list, no property addresses, no
//     engineer names, no job details. Just a number and a sparkline.
//
// What IS here:
//   - Hero with the org logo (when branding is on), the headline score
//     in display-size type, and a colour-coded band chip.
//   - "Updated <date>" caption.
//   - Optional 4-metric breakdown row (org chooses whether to publish).
//   - Optional 30-day sparkline (org chooses whether to publish).
//   - Footer with a "What this means" disclosure explaining the score
//     formula at a high level — auditors will want this.

import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import {
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  ExternalLink,
  BadgeCheck,
  Bell,
  BellOff,
  Loader2,
} from 'lucide-react'

// Recharts is heavy — lazy-import the sparkline so the hero renders
// before the chart bundle lands. Recharts is already used by the
// analytics dashboard so this doesn't add a new dependency.
const Sparkline = lazy(() => import('@/components/trust/score-sparkline'))

interface TrustResponse {
  org_name: string
  org_logo_url: string | null
  current_score: number
  current_breakdown: {
    compliance: number
    ppm_on_time: number
    pass_rate: number
    action_health: number
  } | null
  score_band: 'exceptional' | 'strong' | 'fair' | 'needs_work'
  snapshot_date: string
  history: { date: string; score: number }[] | null
}

interface TrustError {
  error: 'org_not_found' | 'no_snapshots' | 'invalid_slug' | 'lookup_failed' | string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * Plain fetch — bypasses @supabase/supabase-js so the public route
 * doesn't ship the auth + realtime stack just to read one number.
 */
async function fetchTrust(slug: string): Promise<TrustResponse | TrustError> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: 'lookup_failed' }
  }
  const url = `${SUPABASE_URL}/functions/v1/public-trust-score?slug=${encodeURIComponent(slug)}`
  try {
    // Hard 8s wall-clock cap. Without this an edge-function cold start /
    // wedged Supabase region leaves the Trust URL — the page prospects
    // get sent in cold outreach — on a loading spinner forever. With it,
    // a stall surfaces as { error: 'lookup_failed' } and the UI renders
    // the "We couldn't find that trust link" state instead of hanging.
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // Even with verify_jwt: false, Supabase's gateway requires the
        // anon key — without it you get a 401 before the function runs.
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      signal: AbortSignal.timeout(8_000),
    })
    const body = (await res.json().catch(() => null)) as TrustResponse | TrustError | null
    if (!body) return { error: 'lookup_failed' }
    return body
  } catch {
    return { error: 'lookup_failed' }
  }
}

interface SubscribeOk {
  ok: true
  status: 'subscribed'
}
interface SubscribeErr {
  error: string
}
interface UnsubscribeOk {
  ok: true
  status: 'unsubscribed' | 'not_found'
}

/**
 * POST { slug, email, threshold? } to the trust-subscribe edge function.
 * Mirrors fetchTrust: plain fetch with the anon key in the header so the
 * public bundle stays free of the supabase-js auth stack.
 */
async function subscribeTrust(
  slug: string,
  email: string,
  threshold: number | null,
): Promise<SubscribeOk | SubscribeErr> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: 'lookup_failed' }
  }
  const url = `${SUPABASE_URL}/functions/v1/trust-subscribe`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ slug, email, threshold }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json().catch(() => null)) as SubscribeOk | SubscribeErr | null
    if (!body) return { error: 'lookup_failed' }
    return body
  } catch {
    return { error: 'lookup_failed' }
  }
}

/** GET/POST the unsubscribe token to the trust-subscribe edge function. */
async function unsubscribeTrust(token: string): Promise<UnsubscribeOk | SubscribeErr> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: 'lookup_failed' }
  }
  const url = `${SUPABASE_URL}/functions/v1/trust-subscribe`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ unsubscribe_token: token }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json().catch(() => null)) as UnsubscribeOk | SubscribeErr | null
    if (!body) return { error: 'lookup_failed' }
    return body
  } catch {
    return { error: 'lookup_failed' }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Map the edge function's error codes to human copy for the subscribe form.
const SUBSCRIBE_ERROR_COPY: Record<string, string> = {
  invalid_email: 'That email address doesn’t look right.',
  invalid_threshold: 'Choose a threshold between 1 and 100.',
  invalid_slug: 'This trust link is no longer valid.',
  org_not_found: 'This trust link is no longer valid.',
}

// Band tints map onto the canonical status tokens so the score chip and
// progress bars stay legible across all themes. Strong reuses the brand
// accent (warm orange) since "strong-but-not-exceptional" is a positive
// brand-voice signal rather than a hard "compliant" green.
const BAND_META: Record<
  TrustResponse['score_band'],
  { label: string; tint: string; ring: string; bar: string; icon: typeof ShieldCheck }
> = {
  exceptional: {
    label: 'Exceptional',
    tint: 'bg-status-compliant/10 text-status-compliant',
    ring: 'ring-status-compliant/30',
    bar: 'bg-status-compliant',
    icon: ShieldCheck,
  },
  strong: {
    label: 'Strong',
    tint: 'bg-accent/10 text-text-accent',
    ring: 'ring-accent/30',
    bar: 'bg-accent',
    icon: ShieldCheck,
  },
  fair: {
    label: 'Fair',
    tint: 'bg-status-due-soon/10 text-status-due-soon',
    ring: 'ring-status-due-soon/30',
    bar: 'bg-status-due-soon',
    icon: ShieldAlert,
  },
  needs_work: {
    label: 'Needs work',
    tint: 'bg-status-overdue/10 text-status-overdue',
    ring: 'ring-status-overdue/30',
    bar: 'bg-status-overdue',
    icon: ShieldX,
  },
}

const METRIC_META: Record<
  keyof NonNullable<TrustResponse['current_breakdown']>,
  { label: string; description: string }
> = {
  compliance: {
    label: 'Compliance items',
    description: 'Statutory items in compliant or due-soon status',
  },
  ppm_on_time: {
    label: 'PPM on-time',
    description: 'Planned maintenance jobs completed before the due date',
  },
  pass_rate: {
    label: 'First-time pass rate',
    description: 'Inspections that passed without remedial work',
  },
  action_health: {
    label: 'Action health',
    description: 'Open defects resolved within their target SLA',
  },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Mutate (or create) a single <meta> tag in document.head.
 *
 * We do this imperatively instead of pulling in react-helmet-async because
 * (a) this is the only route in the app that needs per-route meta — the
 * dashboard SPA is gated behind auth and never shared as a link — and
 * (b) every kB matters on the public bundle.
 *
 * Each tag we touch gets a `data-trust-meta` attribute so the cleanup pass
 * on unmount only removes tags we own and leaves index.html's defaults
 * alone.
 */
function setMeta(
  selector: string,
  attrs: Record<string, string>,
  content: string,
): void {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  const isNew = !el
  if (!el) {
    el = document.createElement('meta')
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
  if (isNew) el.setAttribute('data-trust-meta', '1')
}

function setLink(rel: string, href: string): void {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-trust-meta]`)
  const isNew = !el
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
  if (isNew) el.setAttribute('data-trust-meta', '1')
}

function ErrorState({ kind }: { kind: TrustError['error'] }) {
  const isMissing = kind === 'org_not_found' || kind === 'invalid_slug'
  const isPending = kind === 'no_snapshots'
  const title = isMissing
    ? 'Trust page not found'
    : isPending
      ? 'Score will appear shortly'
      : 'Something went wrong'
  const copy = isMissing
    ? "We couldn't find a Trust URL at this address. Check the link or contact the company that shared it with you."
    : isPending
      ? "This organisation has published a Trust URL but their compliance score hasn't been computed yet. Scores refresh daily — check back soon."
      : 'We had trouble loading this page. Please try again in a few minutes.'
  const Icon = isMissing ? ShieldX : isPending ? Clock : ShieldAlert

  return (
    <div className="min-h-screen bg-surface-page grid place-items-center p-6">
      <div className="max-w-md w-full bg-surface-card rounded-2xl shadow-sm border border-border-default p-8 text-center">
        <Icon size={36} className="text-text-muted mx-auto mb-4" strokeWidth={1.5} />
        <h1 className="text-title font-semibold text-text-primary mb-2 tracking-[-0.01em]">{title}</h1>
        <p className="text-body text-text-secondary leading-relaxed">{copy}</p>
        <div className="mt-6 pt-5 border-t border-border-subtle">
          <a
            href="https://sitesentriq.com"
            className="inline-flex items-center gap-1.5 text-caption font-medium text-text-accent hover:opacity-80"
          >
            Verified by SiteSentriq <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-surface-page grid place-items-center p-6">
      <div className="text-text-muted text-body inline-flex items-center gap-2">
        <Clock size={16} className="animate-pulse" />
        Loading…
      </div>
    </div>
  )
}

/**
 * "Watch this score" subscribe card. Rendered only once a score has
 * loaded — there's nothing to watch otherwise. Plain Tailwind + design
 * tokens to match the rest of this (HeroUI-free) public route.
 */
function WatchCard({ slug, orgName }: { slug: string; orgName: string }) {
  const [email, setEmail] = useState('')
  const [useThreshold, setUseThreshold] = useState(false)
  const [threshold, setThreshold] = useState('80')
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)

    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setState('error')
      setErrorMsg('That email address doesn’t look right.')
      return
    }
    let thr: number | null = null
    if (useThreshold) {
      const n = Number(threshold)
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        setState('error')
        setErrorMsg('Choose a threshold between 1 and 100.')
        return
      }
      thr = n
    }

    setState('submitting')
    const result = await subscribeTrust(slug, trimmed, thr)
    if ('error' in result) {
      setState('error')
      setErrorMsg(SUBSCRIBE_ERROR_COPY[result.error] ?? 'Something went wrong. Please try again.')
      return
    }
    setState('done')
  }

  if (state === 'done') {
    return (
      <div className="mt-6 bg-surface-card rounded-2xl border border-border-default p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-status-compliant/10 text-status-compliant shrink-0">
            <CheckCircle2 size={18} strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-label font-semibold text-text-primary">You’re watching this score</p>
            <p className="text-caption text-text-secondary mt-1 leading-relaxed">
              We’ve sent a confirmation to <span className="font-medium text-text-primary">{email.trim()}</span>.
              You’ll get an email if {orgName}’s score{' '}
              {useThreshold ? `falls below ${threshold}` : 'drops'}. Every alert includes a one-click
              unsubscribe link.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 bg-surface-card rounded-2xl border border-border-default p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 ring-1 ring-inset ring-accent/30 text-text-accent shrink-0">
          <Bell size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="text-label font-semibold text-text-primary">Watch this score</p>
          <p className="text-caption text-text-secondary mt-1 leading-relaxed">
            Get an email if {orgName}’s compliance score drops or a statutory item lapses. No account needed.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        <div>
          <label htmlFor="watch-email" className="sr-only">
            Email address
          </label>
          <input
            id="watch-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (state === 'error') setState('idle')
            }}
            disabled={state === 'submitting'}
            className="w-full rounded-xl border border-border-default bg-surface-page px-3.5 py-2.5 text-label text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent disabled:opacity-60"
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useThreshold}
            onChange={(e) => setUseThreshold(e.target.checked)}
            disabled={state === 'submitting'}
            className="h-4 w-4 rounded border-border-default text-accent focus:ring-accent/40 [accent-color:var(--accent)]"
          />
          <span className="text-caption text-text-secondary">Only alert me below a specific score</span>
        </label>

        {useThreshold && (
          <div className="flex items-center gap-2">
            <label htmlFor="watch-threshold" className="text-caption text-text-secondary">
              Alert below
            </label>
            <input
              id="watch-threshold"
              type="number"
              min={1}
              max={100}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={state === 'submitting'}
              className="w-20 rounded-lg border border-border-default bg-surface-page px-2.5 py-1.5 text-label text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent disabled:opacity-60"
            />
            <span className="text-caption text-text-muted">/ 100</span>
          </div>
        )}

        {state === 'error' && errorMsg && (
          <p className="text-caption text-status-overdue" role="alert">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={state === 'submitting'}
          className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-accent px-4 py-2.5 text-label font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {state === 'submitting' ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Subscribing…
            </>
          ) : (
            <>
              <Bell size={15} strokeWidth={2.2} />
              Watch this score
            </>
          )}
        </button>
      </form>
      <p className="mt-3 text-micro text-text-muted leading-relaxed">
        We only use your email to send score alerts. Unsubscribe anytime from any alert email.
      </p>
    </div>
  )
}

/** Confirmation banner shown when the page is opened from an unsubscribe link. */
function UnsubscribedBanner({ state }: { state: 'pending' | 'done' | 'not_found' | 'error' }) {
  if (state === 'pending') {
    return (
      <div className="mb-6 rounded-2xl border border-border-default bg-surface-card p-4 shadow-sm flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-text-muted" />
        <p className="text-caption text-text-secondary">Updating your subscription…</p>
      </div>
    )
  }
  const isError = state === 'error'
  return (
    <div className="mb-6 rounded-2xl border border-border-default bg-surface-card p-4 shadow-sm flex items-start gap-3">
      <span
        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
          isError ? 'bg-status-overdue/10 text-status-overdue' : 'bg-status-compliant/10 text-status-compliant'
        }`}
      >
        {isError ? <ShieldAlert size={16} /> : <BellOff size={16} />}
      </span>
      <div>
        <p className="text-label font-semibold text-text-primary">
          {isError ? 'Couldn’t update your subscription' : 'You’ve been unsubscribed'}
        </p>
        <p className="text-caption text-text-secondary mt-0.5 leading-relaxed">
          {isError
            ? 'Please try the unsubscribe link again, or contact the company that shared this page.'
            : 'You won’t receive any more score alerts for this organisation.'}
        </p>
      </div>
    </div>
  )
}

export default function PublicTrustPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const unsubToken = searchParams.get('unsub')
  const [data, setData] = useState<TrustResponse | null>(null)
  const [err, setErr] = useState<TrustError['error'] | null>(null)
  const [unsubState, setUnsubState] = useState<'pending' | 'done' | 'not_found' | 'error' | null>(
    unsubToken ? 'pending' : null,
  )

  // Honour the unsubscribe link (?unsub=<token>) the alert emails point
  // at. Runs once on mount when the param is present; independent of the
  // score fetch so it works even if the org later disabled its Trust URL.
  useEffect(() => {
    if (!unsubToken) return
    let cancelled = false
    setUnsubState('pending')
    void (async () => {
      const result = await unsubscribeTrust(unsubToken)
      if (cancelled) return
      if ('error' in result) setUnsubState('error')
      else setUnsubState(result.status === 'unsubscribed' ? 'done' : 'not_found')
    })()
    return () => {
      cancelled = true
    }
  }, [unsubToken])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void (async () => {
      const result = await fetchTrust(slug)
      if (cancelled) return
      if ('error' in result) {
        setErr(result.error)
        setData(null)
      } else {
        setErr(null)
        setData(result)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  // Per-route document head — the Trust URL is the link people drop into
  // tender responses, broker emails, and prospect Slack threads, so the
  // unfurl preview has to look like a real trust badge, not a generic SPA.
  //
  // We set everything client-side once `data` resolves; crawlers that run
  // JS (LinkedIn, X/Twitter, Slack's unfurler in recent updates, Discord)
  // pick this up. Email clients that pre-render with a non-JS crawler will
  // fall back to whatever's in index.html — acceptable trade-off for the
  // public-bundle weight saving.
  //
  // TODO(Wave A5): a /trust/:slug/og.png edge function that renders a
  // per-org Open Graph card with the live score baked in (Vercel OG /
  // Satori). Until that ships, every page points at the same static
  // placeholder PNG (designers can swap /trust-og-default.png in public/).
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!data) {
      document.title = 'Compliance verification · SiteSentriq Trust'
      return
    }

    const trustUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/trust/${slug ?? ''}`
        : `/trust/${slug ?? ''}`
    const updated = formatDate(data.snapshot_date)
    const title = `${data.org_name} compliance verification · SiteSentriq Trust`
    const description =
      `Live compliance score for ${data.org_name}, verified continuously by SiteSentriq. ` +
      `Score ${data.current_score}/100 — updated ${updated}.`
    const ogImage =
      typeof window !== 'undefined'
        ? `${window.location.origin}/trust-og-default.png`
        : '/trust-og-default.png'

    document.title = title
    setMeta('meta[name="description"]', { name: 'description' }, description)
    // Public-by-design; org-level opt-out lives in branding settings and
    // would set this to "noindex,nofollow" before snapshot publish. Until
    // that surface exists we default-allow indexing.
    setMeta('meta[name="robots"]', { name: 'robots' }, 'index,follow')

    // Open Graph
    setMeta('meta[property="og:title"]', { property: 'og:title' }, title)
    setMeta('meta[property="og:description"]', { property: 'og:description' }, description)
    setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website')
    setMeta('meta[property="og:url"]', { property: 'og:url' }, trustUrl)
    setMeta('meta[property="og:image"]', { property: 'og:image' }, ogImage)
    setMeta(
      'meta[property="og:image:alt"]',
      { property: 'og:image:alt' },
      `${data.org_name} continuous compliance score, verified by SiteSentriq`,
    )
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, 'SiteSentriq Trust')

    // Twitter / X
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image')
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title)
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description)
    setMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, ogImage)

    // Canonical favicon — index.html already declares /favicon.svg but we
    // re-assert it with data-trust-meta so the cleanup pass is symmetric.
    setLink('icon', '/favicon.svg')

    return () => {
      // Tidy on unmount so the dashboard chrome doesn't inherit the public
      // page's title/meta when the user navigates back into the app shell.
      document
        .querySelectorAll('[data-trust-meta]')
        .forEach((node) => node.parentNode?.removeChild(node))
    }
  }, [data, slug])

  // Belt-and-braces for the print path: some browsers (notably Safari)
  // refuse to paint the contents of a closed <details> even when CSS
  // says display:block, so we open every details element on the page
  // right before the print dialog appears and restore state afterwards.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const opened: HTMLDetailsElement[] = []
    const onBeforePrint = () => {
      document.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
        if (!d.open) {
          d.open = true
          opened.push(d)
        }
      })
    }
    const onAfterPrint = () => {
      opened.splice(0).forEach((d) => {
        d.open = false
      })
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [])

  const band = useMemo(() => (data ? BAND_META[data.score_band] : null), [data])

  if (!slug) return <ErrorState kind="invalid_slug" />
  // When opened purely from an unsubscribe link and the score can't load
  // (e.g. the org has since disabled its Trust URL), still confirm the
  // unsubscribe rather than showing a bare "not found" error.
  if (err) {
    if (unsubState) {
      return (
        <div className="min-h-screen bg-surface-page grid place-items-center p-6">
          <div className="max-w-md w-full">
            <UnsubscribedBanner state={unsubState} />
          </div>
        </div>
      )
    }
    return <ErrorState kind={err} />
  }
  if (!data || !band) return <LoadingState />

  const BandIcon = band.icon

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-page to-surface-card">
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-16">
        {/* Unsubscribe confirmation — shown when opened from an alert email link. */}
        {unsubState && <UnsubscribedBanner state={unsubState} />}

        {/* Logo / org name strip */}
        <div className="flex items-center gap-3 mb-10">
          {data.org_logo_url ? (
            <img
              src={data.org_logo_url}
              alt={`${data.org_name} logo`}
              className="h-10 max-w-[160px] object-contain"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <span className="text-accent-foreground font-bold text-[16px]">
                {data.org_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Trust
            </p>
            <p className="text-[15px] font-semibold text-text-primary truncate">{data.org_name}</p>
          </div>
        </div>

        {/* Hero — the score is the page */}
        <div className="bg-surface-card rounded-3xl shadow-sm border border-border-default p-8 sm:p-12">
          <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
            Compliance Score
          </p>
          <div className="mt-4 flex items-end gap-4 flex-wrap">
            <span
              className="text-display sm:text-[112px] font-bold leading-none tracking-[-0.04em] text-text-primary tabular-nums"
              aria-label={`Compliance score ${data.current_score} out of 100`}
            >
              {data.current_score}
            </span>
            <span className="text-headline font-semibold text-text-muted leading-none mb-2 tabular-nums">
              / 100
            </span>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${band.tint} ring-1 ring-inset ${band.ring} text-label font-semibold mb-2`}
            >
              <BandIcon size={14} strokeWidth={2.2} />
              {band.label}
            </span>
          </div>

          <p className="mt-5 text-label text-text-muted inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-status-compliant" />
            Updated {formatDate(data.snapshot_date)} · refreshed daily
          </p>

          {/* 30-day sparkline — lazy-loaded */}
          {data.history && data.history.length > 1 && (
            <div className="mt-8 pt-6 border-t border-border-subtle">
              <p className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">
                Last 30 days
              </p>
              <Suspense
                fallback={
                  <div className="h-[80px] bg-surface-elevated rounded-lg animate-pulse" aria-hidden />
                }
              >
                <Sparkline points={data.history} band={data.score_band} />
              </Suspense>
            </div>
          )}
        </div>

        {/* Breakdown row */}
        {data.current_breakdown && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              Object.entries(data.current_breakdown) as [
                keyof typeof METRIC_META,
                number,
              ][]
            ).map(([key, value]) => {
              const meta = METRIC_META[key]
              const v = Math.max(0, Math.min(100, Math.round(value)))
              return (
                <div
                  key={key}
                  className="bg-surface-card rounded-2xl border border-border-default p-5 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-label font-semibold text-text-primary">{meta.label}</p>
                    <p className="text-[18px] font-bold text-text-primary tabular-nums leading-none">
                      {v}
                      <span className="text-caption text-text-muted font-medium">/100</span>
                    </p>
                  </div>
                  <p className="text-micro text-text-muted mt-1.5 leading-relaxed">
                    {meta.description}
                  </p>
                  {/* Mini bar */}
                  <div
                    className="mt-3 h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden"
                    role="progressbar"
                    aria-valuenow={v}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`${band.bar} h-full rounded-full transition-[width] duration-500`}
                      style={{ width: `${v}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Watch this score — public subscribe card. Only meaningful once
            a score has loaded, which is guaranteed here (data is set). */}
        <WatchCard slug={slug} orgName={data.org_name} />

        {/* "What this means" disclosure */}
        <details className="mt-6 bg-surface-card rounded-2xl border border-border-default p-5 group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <span className="text-label font-semibold text-text-primary">
              What this score means
            </span>
            <span className="text-micro text-text-muted group-open:hidden">Show details</span>
            <span className="text-micro text-text-muted hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-4 space-y-3 text-label text-text-secondary leading-relaxed">
            <p>
              The Compliance Score is a single 0-100 number that reflects how well an
              organisation is managing its statutory and operational facilities-management
              obligations on the day shown above. It is computed once daily from a weighted
              blend of four signals:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-text-primary">Compliance items (40%)</strong> —
                proportion of statutory items currently in compliant or due-soon status.
              </li>
              <li>
                <strong className="text-text-primary">PPM on-time (25%)</strong> — proportion
                of planned-preventative-maintenance jobs completed by the due date.
              </li>
              <li>
                <strong className="text-text-primary">First-time pass rate (25%)</strong> —
                proportion of recent inspections that passed without remedial work.
              </li>
              <li>
                <strong className="text-text-primary">Action health (10%)</strong> — proportion
                of open defects being resolved within their target SLA.
              </li>
            </ul>
            <p>
              Bands: <strong>Exceptional</strong> 90+, <strong>Strong</strong> 75-89,{' '}
              <strong>Fair</strong> 60-74, <strong>Needs work</strong> below 60.
            </p>
            <p className="text-caption text-text-muted">
              This page is published by the organisation and updated automatically. It is
              independently computed by Haumea from the raw operational data; the
              organisation cannot edit the underlying numbers.
            </p>
          </div>
        </details>

        {/* Footer — trust-grade wordmark, not a marketing CTA.
            The 'Verified at' timestamp doubles as the auditor-facing
            integrity stamp. Print stylesheet (below) rewrites this block
            with the canonical SiteSentriq URL so a Cmd-P export is
            self-contained. */}
        <footer className="mt-12 pt-8 border-t border-border-subtle trust-footer">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 ring-1 ring-inset ring-accent/30 text-text-accent">
                <BadgeCheck size={16} strokeWidth={2.2} />
              </span>
              <div className="leading-tight">
                <p className="text-label font-semibold text-text-primary tracking-[-0.005em]">
                  SiteSentriq
                </p>
                <p className="text-micro text-text-muted">
                  Continuously verified compliance
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right text-micro text-text-muted leading-relaxed tabular-nums">
              <p>Verified at {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</p>
              <p className="trust-footer-link">
                <a
                  href="https://sitesentriq.com"
                  className="font-medium text-text-secondary hover:text-text-primary"
                >
                  sitesentriq.com
                </a>
                <span aria-hidden> · </span>
                <span>
                  sitesentriq.com/trust/{slug}
                </span>
              </p>
            </div>
          </div>
        </footer>

        {/* Print-only canonical footer — appears only when an auditor or
            broker hits Cmd-P. CSS below hides the screen footer's link
            chrome and unhides this block. Keeps the printed page
            self-contained (URL + timestamp visible without colour). */}
        <div className="trust-print-footer" aria-hidden>
          <hr />
          <p>
            Verified at {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC ·
            sitesentriq.com/trust/{slug}
          </p>
        </div>
      </div>

      {/* Scoped print stylesheet.
          Inlined rather than added to index.css so the rules ship with the
          public bundle and don't leak into the dashboard print path. */}
      <style>{`
        .trust-print-footer { display: none; }
        @media print {
          /* Force a clean white sheet — gradients waste ink and look muddy. */
          html, body { background: #ffffff !important; }
          .trust-print-footer {
            display: block;
            margin-top: 24px;
            padding-top: 12px;
            font-size: 10pt;
            color: #555;
            text-align: center;
          }
          .trust-print-footer hr {
            border: 0;
            border-top: 1px solid #d1d5db;
            margin-bottom: 8px;
          }
          /* Screen footer — keep the wordmark, drop the link affordances. */
          .trust-footer a { color: inherit !important; text-decoration: none !important; }
          .trust-footer-link { display: none !important; }
          /* Make the headline score unmissable on paper. */
          [aria-label^="Compliance score"] {
            color: #000 !important;
            font-weight: 800 !important;
          }
          /* Greyscale-friendly breakdown bars — auditors print in mono. */
          [role="progressbar"] > div {
            background: #111 !important;
          }
          /* Force the "What this means" disclosure open on paper —
             auditors expect the formula on the printed page. The
             beforeprint listener below sets the 'open' attribute too,
             but this rule keeps the body visible even if JS is off. */
          details > summary { display: none !important; }
          details > div,
          details:not([open]) > div { display: block !important; margin-top: 0 !important; }
          /* Hide any incidental nav chrome the parent layout might inject. */
          aside, nav, [data-sidebar], [data-topbar] { display: none !important; }
        }
      `}</style>
    </div>
  )
}
