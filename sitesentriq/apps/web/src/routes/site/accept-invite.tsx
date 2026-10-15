// Wave 14 / Task 114 — Public route: accept a tenant portal invite.
//
// URL: /site/accept-invite?invite=TOKEN
//
// Flow:
//   1. Read token from URL.
//   2. Show a small form: full name (pre-filled), set password.
//   3. POST to `site-accept-invite` edge function which:
//      - looks up property_contacts by token + checks expiry
//      - creates auth.users (or signs them up) and returns a session
//      - sets property_contacts.user_id, accepted_at, status='active'
//      - clears invite_token
//   4. We use the returned session via supabase.auth.setSession,
//      then route to /site.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router'
import { Button, Spinner } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { APP_NAME } from '@/lib/constants'

interface AcceptResponse {
  ok?: boolean
  error?: string
  email?: string
  full_name?: string
  property_name?: string
  client_name?: string
  org_name?: string
  // returned only on a successful POST
  access_token?: string
  refresh_token?: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

async function callAcceptFn(body: Record<string, unknown>): Promise<AcceptResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: 'Supabase not configured' }
  }
  const url = `${SUPABASE_URL}/functions/v1/site-accept-invite`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  return (await res.json()) as AcceptResponse
}

export default function SiteAcceptInvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('invite') ?? ''

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<AcceptResponse | null>(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setDetails({ error: 'Missing invite token' })
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const r = await callAcceptFn({ token, action: 'inspect' })
      if (cancelled) return
      setDetails(r)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const onAccept = async () => {
    if (submitting) return
    if (password.length < 8) {
      toast.error('Choose a password of at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      const r = await callAcceptFn({ token, action: 'accept', password })
      if (r.error || !r.access_token || !r.refresh_token) {
        throw new Error(r.error || 'Failed to accept invite')
      }
      await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      })
      toast.success('Welcome aboard!')
      navigate('/site', { replace: true })
    } catch (err) {
      toast.error((err as Error).message || 'Could not accept invite')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!details || details.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <AppCard padding="lg" className="max-w-md w-full text-center">
          <div className="space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-status-overdue/10 flex items-center justify-center">
              <AlertCircle size={20} className="text-status-overdue" />
            </div>
            <h1 className="text-[16px] font-semibold text-text-primary">
              Invite is invalid or expired
            </h1>
            <p className="text-label text-text-muted">
              {details?.error ?? 'Please ask your FM team to send a fresh invite.'}
            </p>
            <Link to="/login" className="text-caption text-brand-600 hover:underline">
              Back to sign-in
            </Link>
          </div>
        </AppCard>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <AppCard padding="lg" className="max-w-md w-full">
        <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-brand-500" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold text-text-primary">
              You're invited to {details.property_name ?? 'the site portal'}
            </h1>
            <p className="text-caption text-text-muted">
              {details.org_name ?? APP_NAME} · service portal
            </p>
          </div>
        </div>

        <div className="text-label text-text-secondary space-y-2">
          <p>
            Hi {details.full_name ?? 'there'}, set a password below and you'll get
            instant access to compliance, visits and call-outs for{' '}
            <strong>{details.property_name ?? 'your site'}</strong>.
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
            Email
          </label>
          <input
            type="email"
            value={details.email ?? ''}
            disabled
            className="w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 text-text-muted"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
            Choose a password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-navy-950/30"
            placeholder="At least 8 characters"
            autoFocus
          />
        </div>

        <Button
          variant="primary"
          isDisabled={submitting}
          onPress={onAccept}
          className="w-full"
        >
          {submitting ? 'Activating…' : 'Accept invite & sign in'}
        </Button>

        <p className="text-micro text-text-muted text-center">
          By continuing you agree to receive maintenance & compliance notifications
          for this site.
        </p>
        </div>
      </AppCard>
    </div>
  )
}
