// src/lib/sso/providers.ts
//
// Thin wrappers around Supabase Auth's OAuth flow for the two
// supported enterprise providers. The actual provider configuration
// (client ID, client secret, redirect URI) lives in:
//   Supabase Dashboard → Authentication → Providers → Azure / Google
//
// This file only kicks the user out to the provider's consent screen.

import { supabase } from '@/lib/supabase'

export type SsoProvider = 'azure' | 'google'

export const SSO_CALLBACK_PATH = '/auth/sso/callback'

function buildRedirectUrl(): string {
  if (typeof window === 'undefined') return SSO_CALLBACK_PATH
  return `${window.location.origin}${SSO_CALLBACK_PATH}`
}

/** Begin OAuth sign-in via the named provider. Redirects the page. */
export async function signInWithSso(provider: SsoProvider) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: buildRedirectUrl(),
      scopes: 'email profile openid',
    },
  })
}

export const SSO_PROVIDER_LABELS: Record<SsoProvider, string> = {
  azure: 'Microsoft',
  google: 'Google',
}
