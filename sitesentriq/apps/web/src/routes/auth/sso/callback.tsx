// src/routes/auth/sso/callback.tsx
//
// Mounted at `/auth/sso/callback`. Supabase's OAuth flow drops the
// user back here after the provider hands off — by that point the
// auth-js client has already exchanged the code and set a session
// in localStorage (PKCE flow). We:
//   1. Read the session.
//   2. If it has a domain mapping, hit `sso-jit-provision` to attach
//      the user to that org with the configured default role.
//   3. Route:
//        provisioned / already_member → /dashboard
//        no_mapping                   → /onboarding (Phase 8 wizard)
//        blocked                      → /login?error=sso_blocked
//        error                        → /login?error=sso_failed
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Card, Spinner } from '@haumea/ui'
import { AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { provisionFromSso } from '@/lib/sso/jit-client'
import { Wordmark } from '@haumea/ui'

function detectProvider(user: {
  app_metadata?: { provider?: string }
}): 'azure' | 'google' | null {
  const p = user?.app_metadata?.provider
  if (p === 'azure') return 'azure'
  if (p === 'google') return 'google'
  return null
}

/**
 * If `handle_new_user` already seated this user in an org (e.g. they were
 * invited and signed in via SSO instead of the magic link), return the surface
 * they belong on so we route there instead of dumping them in the onboarding
 * wizard for an org that already exists. Returns null when they have no org yet.
 */
async function existingOrgDestination(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userId)
    .maybeSingle()
  const profile = data as { organisation_id?: string | null; role?: string } | null
  if (!profile?.organisation_id) return null
  if (profile.role === 'client_admin') return '/portal'
  if (profile.role === 'tenant_user') return '/site'
  return '/dashboard'
}

export default function SsoCallbackPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>('Finishing sign-in…')
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        // Allow Supabase a moment to materialise the session from the
        // URL hash if we beat it to the punch (rare but observed).
        const { data: sessionData, error: sessionErr } =
          await supabase.auth.getSession()

        if (cancelled) return
        if (sessionErr || !sessionData.session) {
          throw new Error(
            sessionErr?.message ?? 'No session — sign-in did not complete'
          )
        }

        const user = sessionData.session.user
        const email = user.email
        if (!email) {
          throw new Error('Provider did not return an email address')
        }

        const provider = detectProvider(user)
        if (!provider) {
          // Unknown provider — they're authenticated, just not via Azure /
          // Google. If they were invited into an org, go there; else onboard.
          const dest = await existingOrgDestination(user.id)
          if (cancelled) return
          navigate(dest ?? '/onboarding', { replace: true })
          return
        }

        setStatus('Linking your account…')
        const result = await provisionFromSso({
          user_id: user.id,
          email,
          provider,
        })

        if (cancelled) return

        switch (result.action) {
          case 'provisioned':
          case 'already_member':
            navigate('/dashboard', { replace: true })
            return
          case 'no_mapping': {
            // No SSO domain mapping. But the user may already have been seated
            // in an org by handle_new_user (an invited user who signed in via
            // SSO rather than the magic link) — route them there instead of the
            // setup wizard. Only truly org-less users get onboarding.
            const dest = await existingOrgDestination(user.id)
            if (cancelled) return
            navigate(dest ?? '/onboarding', { replace: true })
            return
          }
          case 'blocked':
            await supabase.auth.signOut()
            navigate('/login?error=sso_blocked', { replace: true })
            return
          case 'error':
          default: {
            await supabase.auth.signOut()
            const detail = encodeURIComponent(result.error ?? 'unknown')
            navigate(`/login?error=sso_failed&detail=${detail}`, {
              replace: true,
            })
            return
          }
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'sso_failed'
        setErrored(true)
        setStatus(message)
        try {
          await supabase.auth.signOut()
        } catch {
          // ignore — we're redirecting anyway
        }
        const detail = encodeURIComponent(message)
        navigate(`/login?error=sso_failed&detail=${detail}`, { replace: true })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8">
          <Wordmark size="lg" className="mb-4 text-text-primary" />
        </div>
        <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm flex flex-col items-center gap-3">
          {errored ? (
            <AlertCircle size={24} className="text-status-overdue" />
          ) : (
            <Spinner size="md" />
          )}
          <p className="text-label text-text-secondary text-center">
            {status}
          </p>
        </Card>
      </div>
    </div>
  )
}
