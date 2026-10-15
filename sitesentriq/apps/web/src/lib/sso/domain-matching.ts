// src/lib/sso/domain-matching.ts
//
// Helpers for resolving an email's domain to an organisation via
// the `sso_domain_mappings` table. Used by the SSO callback to
// decide whether to JIT-provision a user into an existing tenant
// or send them to /onboarding to create a new one.

import { supabase } from '@/lib/supabase'

/** Extract the lowercase domain portion of an email. Returns null if invalid. */
export function getEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain.includes('.')) return null
  return domain
}

export interface DomainMatch {
  org_id: string
  default_role: string
  auto_provision: boolean
}

/**
 * Look up an active SSO domain mapping for the given email.
 * Returns null if no active mapping exists. Auto-provision flag is
 * included so callers can distinguish "blocked" vs "missing mapping".
 *
 * NOTE: this client-side query relies on the `sso_domain_mappings`
 * SELECT policy. Anonymous callers will get nothing back; the JIT
 * provision edge function performs the authoritative lookup using
 * the service role.
 */
export async function matchDomainToOrg(
  email: string
): Promise<DomainMatch | null> {
  const domain = getEmailDomain(email)
  if (!domain) return null

  const { data, error } = await supabase
    .from('sso_domain_mappings')
    .select('organisation_id, default_role, auto_provision')
    .eq('domain', domain)
    .is('disabled_at', null)
    .maybeSingle()

  if (error || !data) return null
  return {
    org_id: data.organisation_id as string,
    default_role: data.default_role as string,
    auto_provision: data.auto_provision as boolean,
  }
}
