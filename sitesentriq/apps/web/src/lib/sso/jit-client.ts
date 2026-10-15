// src/lib/sso/jit-client.ts
//
// Browser-side helper that calls the `sso-jit-provision` edge function.
// Returns the action taken so the caller can route the user appropriately.

import { supabase } from '@/lib/supabase'

export type JitAction =
  | 'provisioned'
  | 'already_member'
  | 'blocked'
  | 'no_mapping'
  | 'error'

export interface JitResponse {
  action: JitAction
  org_id: string | null
  role: string | null
  error?: string
}

/**
 * Invoke the JIT provision edge function. The current Supabase session
 * is forwarded automatically by `supabase.functions.invoke`.
 */
export async function provisionFromSso(args: {
  user_id: string
  email: string
  provider: 'azure' | 'google'
}): Promise<JitResponse> {
  const { data, error } = await supabase.functions.invoke<JitResponse>(
    'sso-jit-provision',
    { body: args }
  )

  if (error) {
    return {
      action: 'error',
      org_id: null,
      role: null,
      error: error.message,
    }
  }
  return (
    data ?? {
      action: 'error',
      org_id: null,
      role: null,
      error: 'Empty response from sso-jit-provision',
    }
  )
}
