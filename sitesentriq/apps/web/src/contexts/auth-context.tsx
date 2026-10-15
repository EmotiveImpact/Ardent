import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { del } from 'idb-keyval'
import { supabase } from '@/lib/supabase'
import { setUserContext, clearUserContext } from '@/lib/observability'
import { logAuditEvent } from '@/lib/audit/log'
import { clearQueue } from '@/lib/offline-queue'
import type { UserProfile, Organisation } from '@haumea/types'

// Re-evaluated when AuthProvider mounts so tests that mutate import.meta.env
// in their setup file see the updated value.
function isDevMode(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  return !url || url === 'https://placeholder.supabase.co'
}
const DEV_MODE = isDevMode()
const AUTH_SESSION_TIMEOUT_MS = 4_000
// 8s (was 5s): the profile+org lookup can chain several round-trips (me() RPC,
// profile fallback, org fetch). Under DB load (a migration/deploy running) or a
// cold start, 5s was tripping the timeout and dropping the org — which surfaced
// the "couldn't finish setting up your workspace" screen for users whose org was
// perfectly fine. A more forgiving budget trips far less; WorkspaceSetupPending
// then silently retries if it ever does. See workspace-setup-pending.tsx.
const AUTH_PROFILE_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

const DEV_USER: User = {
  id: 'dev-user-001',
  email: 'admin@haumea.dev',
  app_metadata: {},
  user_metadata: { full_name: 'Dev Admin' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
} as User

const DEV_PROFILE: UserProfile = {
  id: 'dev-user-001',
  email: 'admin@haumea.dev',
  full_name: 'Dev Admin',
  role: 'org_admin',
  organisation_id: 'dev-org-001',
  created_at: '2026-01-01T00:00:00Z',
}

const DEV_ORG: Organisation = {
  id: 'dev-org-001',
  name: 'Haumea Demo',
  slug: 'haumea-demo',
  created_at: '2026-01-01T00:00:00Z',
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  organisation: Organisation | null
  loading: boolean
  signOut: () => Promise<void>
  /**
   * Re-fetch the signed-in user's profile + organisation into context. Call after
   * editing your own profile (name/phone/avatar) or org settings (name/logo) so the
   * topbar / identity chips reflect the change without a full page reload.
   */
  refreshProfile: () => Promise<void>
  /**
   * Wave 14 / Task 114 — when the signed-in user is a tenant_user
   * (a property_contact, not a profiles row), this holds the single
   * property they are attached to. NULL for org staff.
   */
  currentPropertyId: string | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  organisation: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  currentPropertyId: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  // Lazy-evaluate so test-time env mutation is honoured even when this module
  // was imported (and DEV_MODE captured) before the test setup file ran.
  const devMode = DEV_MODE || isDevMode()
  const [user, setUser] = useState<User | null>(devMode ? DEV_USER : null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(devMode ? DEV_PROFILE : null)
  const [organisation, setOrganisation] = useState<Organisation | null>(devMode ? DEV_ORG : null)
  const [loading, setLoading] = useState(!devMode)
  // Wave 14 / Task 114 — set when the signed-in user is a property_contact
  // (a tenant_user) instead of a profiles row.
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null)
  const authRunRef = useRef(0)
  const queryClient = useQueryClient()

  const fetchProfile = async (userId: string, shouldApply: () => boolean = () => true) => {
    // Wave 17 perf — fast path: single RPC fetches profile + org in one
    // round-trip. Falls back to the two-query path if the RPC isn't
    // deployed yet OR if the profile row isn't there (tenant_user, or
    // mid-signup with no org assigned).
    let data: UserProfile | null = null
    let orgPrefetched = false
    {
      const { data: meData, error: meError } = await supabase.rpc('me')
      type MeResponse = { profile: UserProfile | null; organisation: Organisation | null } | null
      const me = (meData as unknown as MeResponse) ?? null
      if (!meError && me?.profile) {
        data = me.profile
        // The org may legitimately be null mid-signup; the org-create
        // branch below handles that case. When it IS populated we can
        // skip the second profile-org round-trip entirely.
        if (me.organisation) {
          if (shouldApply()) setOrganisation(me.organisation)
          orgPrefetched = true
        }
      } else if (meError) {
        // RPC not deployed → fall through to legacy path below.
        // Anything else (RLS, syntax) also falls through so the app
        // keeps working while we sort it out.
         
        console.warn('[auth] me() RPC unavailable, using fallback:', meError.message)
      }
      if (!data) {
        const { data: legacy } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
        data = legacy as UserProfile | null
      }
    }

    // Wave 14 / Task 114 — if no profiles row, this might be a tenant_user
    // (a property_contact). Resolve their virtual profile from
    // property_contacts.user_id.
    if (!data) {
      const { data: contact } = await supabase
        .from('property_contacts')
        .select('id, organisation_id, client_id, property_id, email, full_name, role_at_site, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle()
      if (contact) {
        const tenantProfile: UserProfile = {
          id: userId,
          email: contact.email,
          full_name: contact.full_name,
          role: 'tenant_user',
          organisation_id: contact.organisation_id,
          created_at: new Date().toISOString(),
        }
        if (!shouldApply()) return
        setCurrentPropertyId(contact.property_id)
        setProfile(tenantProfile)

        // Best-effort fetch of the FM org (used for branding only;
        // tenant_user RLS allows reading their own org row).
        const { data: org } = await supabase
          .from('organisations')
          .select('*')
          .eq('id', contact.organisation_id)
          .maybeSingle()
        if (org && shouldApply()) setOrganisation(org as Organisation)
      } else {
        if (!shouldApply()) return
        setProfile(null)
        setOrganisation(null)
        setCurrentPropertyId(null)
      }
      return
    }

    {
      // Standard org-staff path (existing behaviour).
      let profileData = data as UserProfile

      if (!profileData.organisation_id) {
        // New user — create their organisation from signup metadata.
        // Requires migration 00037: organisations_insert_authenticated RLS
        // policy. Without it, the insert silently 403s and the user lands
        // in the app with no org — every query returns empty. Surface any
        // error here so we can spot regressions instead of failing quietly.
        const { data: { user: authUser } } = await supabase.auth.getUser()
        const companyName = authUser?.user_metadata?.company_name
          || authUser?.email?.split('@')[1]?.split('.')[0]
          || 'My Organisation'
        // Recovery path: claim the first workspace via the claim_workspace RPC
        // (00077). It creates a NEW org with a collision-safe slug and makes the
        // caller org_admin, server-side — direct org/role writes are blocked by
        // the privilege-change trigger (00078), so this RPC is the only safe way.
        const { data: claimedOrgId, error: claimError } = await supabase.rpc('claim_workspace', {
          p_company_name: companyName,
          p_slug: authUser?.user_metadata?.company_slug ?? null,
        })

        if (claimError) {
          console.error('[auth] claim_workspace failed for new user:', claimError)
        } else if (claimedOrgId) {
          const { data: org } = await supabase
            .from('organisations')
            .select('*')
            .eq('id', claimedOrgId as string)
            .single()
          profileData = { ...profileData, organisation_id: claimedOrgId as string, role: 'org_admin' }
          if (org && shouldApply()) setOrganisation(org as Organisation)
        }
      } else if (!orgPrefetched) {
        // Slow path — only runs when me() RPC didn't return an org
        // (legacy fallback or RPC not deployed yet).
        const { data: org } = await supabase
          .from('organisations')
          .select('*')
          .eq('id', profileData.organisation_id)
          .maybeSingle()
        if (org && shouldApply()) setOrganisation(org as Organisation)
      }

      if (shouldApply()) setProfile(profileData)
    }
  }

  useEffect(() => {
    if (devMode) return

    let cancelled = false

    const clearResolvedProfile = () => {
      setProfile(null)
      setOrganisation(null)
      setCurrentPropertyId(null)
    }

    const applySession = async (event: string, nextSession: Session | null) => {
      const runId = ++authRunRef.current
      const isCurrent = () => !cancelled && authRunRef.current === runId
      const blocksUi = event === 'INITIAL_SESSION' || event === 'SIGNED_IN'

      if (blocksUi) setLoading(true)
      setSession(nextSession)
      setUser(nextSession?.user ?? null)

      if (!nextSession?.user) {
        clearResolvedProfile()
        if (event === 'SIGNED_OUT') {
          // Wipe all cached query data + the persisted IndexedDB copy so a
          // different user signing in on this browser cannot read the previous
          // user's rows from cache (keys carry no user/org segment).
          queryClient.clear()
          void del('haumea-query-cache')
          void logAuditEvent({
            action: 'user.signed_out',
            entityType: 'user',
            summary: 'Signed out',
          })
        }
        if (isCurrent()) setLoading(false)
        return
      }

      try {
        await withTimeout(
          fetchProfile(nextSession.user.id, isCurrent),
          AUTH_PROFILE_TIMEOUT_MS,
          'auth profile lookup',
        )
      } catch (error) {
        if (isCurrent()) {
          // Bump authRunRef so any late-resolving inner promise (e.g. the
          // me() RPC that the outer withTimeout abandoned) can no longer
          // call setProfile() — its `shouldApply` check now returns false.
          // Without this bump, the late write could flip the user's UI
          // back from AccessDenied → org_admin 5+ seconds after the
          // timeout already settled, causing visible state flicker and
          // dashboard chrome appearing out of nowhere.
          authRunRef.current += 1
          clearResolvedProfile()
          console.warn(
            '[auth] profile lookup failed; continuing without blocking the UI:',
            error instanceof Error ? error.message : error,
          )
        }
      } finally {
        if (isCurrent()) setLoading(false)
      }

      if (!isCurrent()) return

      // Audit-log auth lifecycle events. These fire after the bounded profile
      // lookup so org context is populated when available, but never blocks UI.
      if (event === 'SIGNED_IN' && nextSession.user) {
        void logAuditEvent({
          action: 'user.signed_in',
          entityType: 'user',
          entityId: nextSession.user.id,
          summary: `Signed in as ${nextSession.user.email ?? nextSession.user.id}`,
          metadata: {
            provider: nextSession.user.app_metadata?.provider ?? 'email',
          },
        })
      } else if (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
        void logAuditEvent({
          action: 'user.password_changed',
          entityType: 'user',
          entityId: nextSession.user.id,
          summary: `Password changed for ${nextSession.user.email ?? nextSession.user.id}`,
          severity: 'warning',
        })
      }
    }

    void withTimeout(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS, 'auth session lookup')
      .then(({ data: { session } }) => applySession('INITIAL_SESSION', session))
      .catch((error) => {
        if (cancelled) return
        // Bump authRunRef so a late-resolving getSession() success (which
        // would call applySession a second time after the timeout already
        // settled the UI) is ignored. Without this, the boot can flip back
        // from "signed-out spinner" → "loading" → "dashboard" several
        // seconds after the user already saw the login page.
        authRunRef.current += 1
        console.warn(
          '[auth] session lookup failed; continuing as signed out:',
          error instanceof Error ? error.message : error,
        )
        setSession(null)
        setUser(null)
        clearResolvedProfile()
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // `getSession()` owns initial boot. Ignoring this prevents a duplicate
      // profile/org fetch on first load.
      if (event === 'INITIAL_SESSION') return
      void applySession(event, session)
    })

    return () => {
      cancelled = true
      authRunRef.current += 1
      subscription.unsubscribe()
    }
  }, [devMode, queryClient])

  // Push the active user to Sentry (id + email + organisation_id only — no full_name).
  useEffect(() => {
    if (profile) {
      setUserContext({
        id: profile.id,
        email: profile.email,
        organisation_id: profile.organisation_id,
      })
    } else {
      clearUserContext()
    }
  }, [profile?.id, profile?.email, profile?.organisation_id, profile])

  const handleSignOut = useCallback(async () => {
    clearUserContext()
    // Wipe per-user state that outlives the React tree on a shared/kiosk
    // browser: the field offline queue (localStorage) and the persisted
    // TanStack query cache (IndexedDB 'haumea-query-cache'). Without this the
    // next user briefly sees the previous user's clients/jobs/invoices painted
    // from disk, and the previous user's queued field writes replay under the
    // new session. Mirrors apps/mobile/hooks/useAuth.ts signOut().
    clearQueue()
    if (DEV_MODE) {
      window.location.href = '/login'
      return
    }
    await supabase.auth.signOut()
    setProfile(null)
    setOrganisation(null)
    setCurrentPropertyId(null)
    queryClient.clear()
    await del('haumea-query-cache')
  }, [queryClient])

  const refreshProfile = useCallback(async () => {
    if (devMode) return
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) return
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', u.id)
      .maybeSingle()
    if (!profileData) return
    setProfile(profileData as UserProfile)
    if (profileData.organisation_id) {
      const { data: org } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', profileData.organisation_id)
        .maybeSingle()
      if (org) setOrganisation(org as Organisation)
    }
  }, [devMode])

  const contextValue = useMemo(
    () => ({
      user,
      session,
      profile,
      organisation,
      loading,
      signOut: handleSignOut,
      refreshProfile,
      currentPropertyId,
    }),
    [user, session, profile, organisation, loading, handleSignOut, refreshProfile, currentPropertyId],
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  return useContext(AuthContext)
}
