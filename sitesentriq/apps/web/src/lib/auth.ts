import { supabase } from './supabase'

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

/**
 * Where to land users after they click the confirmation link in their email.
 * Sending them to /onboarding (instead of the default site root) means brand-
 * new org admins immediately enter the wizard once their session is hydrated,
 * rather than bouncing through /login → /dashboard and missing the tour.
 *
 * The host obviously varies between local dev, preview, and prod — derive it
 * at call time rather than baking a literal URL.
 */
function getEmailRedirectTo(path = '/onboarding'): string | undefined {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${path}`
}

export async function signUp(email: string, password: string, metadata?: Record<string, unknown>) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: getEmailRedirectTo('/onboarding'),
    },
  })
}

/**
 * Re-send the email-confirmation link for an unverified signup. Backed by
 * Supabase's `auth.resend` endpoint — same `emailRedirectTo` so the second
 * link still lands the user in the onboarding wizard.
 */
export async function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: getEmailRedirectTo('/onboarding'),
    },
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession() {
  return supabase.auth.getSession()
}

export function onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
  return supabase.auth.onAuthStateChange(callback)
}
