import { useState, useEffect } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, UserProfile } from '@/lib/supabase'
import { registerExpoPushTokenWithBackend } from '@/lib/notifications'
import { clearOfflineQueue } from '@/lib/offline-queue'

interface AuthState {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately — no need for getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setState(prev => ({ ...prev, session, user: session?.user ?? null }))

        if (session?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          const profile = data as UserProfile | null
          setState(prev => ({
            ...prev,
            profile,
            loading: false,
          }))
          // Sprint 2A — register Expo push token once we have both a
          // user and an org. Best-effort, non-blocking. The helper is
          // idempotent (UNIQUE on token) so re-registering on subsequent
          // app starts just refreshes last_used_at.
          if (profile?.organisation_id) {
            registerExpoPushTokenWithBackend({
              userId: session.user.id,
              organisationId: profile.organisation_id,
            })
              .then((res) => {
                if (!res.ok) {
                  console.log('[auth] expo push registration skipped:', res.reason)
                }
              })
              .catch((err) => {
                console.warn('[auth] expo push registration threw', err)
              })
          }
        } else {
          setState(prev => ({ ...prev, profile: null, loading: false }))
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    // Drop any pending offline writes BEFORE ending the session. The queue is a
    // single global AsyncStorage key with each payload's user/engineer/org id
    // baked in at enqueue time. On a shared device, leaving it would let the
    // NEXT engineer's session replay this engineer's writes — RLS-rejected
    // forever if they're in a different org, or misattributed if the same org.
    // Clearing on sign-out scopes the queue to the session that created it.
    await clearOfflineQueue()
    await supabase.auth.signOut()
  }

  return { ...state, signIn, signOut }
}
