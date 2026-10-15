import { Navigate } from 'react-router'
import { Spinner } from '@haumea/ui'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'

/**
 * Public route gate (used for /login, /register, /forgot-password, /invite).
 *
 * If the user is already authenticated, redirect them to their natural
 * landing page based on role. Previously this hard-coded `/dashboard` for
 * everyone, which sent `tenant_user` accounts to a dashboard they have no
 * RLS access to — they'd see an empty shell and the bell-tile counters all
 * read zero with no signal that anything was wrong. Now `tenant_user` →
 * `/site` (their single-property portal), `client_admin` → `/portal`,
 * everyone else → `/dashboard`.
 *
 * Waits for `profile` to resolve before redirecting so the role check is
 * authoritative — without this guard, on TOKEN_REFRESHED events `user` is
 * truthy a tick before `profile` is repopulated and the user would bounce
 * to the wrong landing page for a frame.
 */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth()

  // Escape hatch: if a session exists but the profile lookup permanently fails
  // (auth context times it out after AUTH_PROFILE_TIMEOUT_MS, then sets
  // profile=null + loading=false and bumps its run id so it can never
  // repopulate), the `!profile` spinner below would otherwise spin FOREVER,
  // hard-stranding the user on /login. After a short grace period we fall
  // through to the public page so they can retry — mirroring the recovery
  // screens ProtectedRoute/RoleRoute render for the same profile-less state.
  const stuck = !!user && !loading && !profile
  const [profileTimedOut, setProfileTimedOut] = useState(false)
  useEffect(() => {
    if (!stuck) {
      setProfileTimedOut(false)
      return
    }
    const t = setTimeout(() => setProfileTimedOut(true), 4000)
    return () => clearTimeout(t)
  }, [stuck])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  if (user) {
    // Don't redirect until we know the role — otherwise a TOKEN_REFRESHED
    // tick can briefly send a tenant_user to /dashboard before bouncing back.
    if (!profile) {
      // Profile never resolved — let the public page render so the user can
      // re-authenticate instead of staring at an infinite spinner.
      if (profileTimedOut) return <>{children}</>
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Spinner size="lg" />
        </div>
      )
    }
    const role = profile.role
    const dest =
      role === 'tenant_user' ? '/site' : role === 'client_admin' ? '/portal' : '/dashboard'
    return <Navigate to={dest} replace />
  }

  return <>{children}</>
}
