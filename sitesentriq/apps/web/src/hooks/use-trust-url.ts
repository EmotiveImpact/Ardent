// Strategic 1 follow-up — Hooks for the public Trust URL settings.
//
//   useTrustUrlSettings:        read the current org's trust URL config
//   useUpdateTrustUrlSettings:  mutation to update slug + toggles
//   buildTrustUrl:              pure URL builder (also tested in
//                               use-trust-url.test.ts)
//   isValidSlug / suggestSlug:  app-side slug validators (kept here so
//                               the settings page + tests share one
//                               source of truth — and the edge function
//                               mirrors the same regex)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

export interface TrustUrlSettings {
  trust_url_slug: string | null
  trust_url_enabled: boolean
  trust_url_show_breakdown: boolean
  trust_url_show_history: boolean
}

export interface UpdateTrustUrlInput {
  trust_url_slug: string | null
  trust_url_enabled: boolean
  trust_url_show_breakdown: boolean
  trust_url_show_history: boolean
}

const TRUST_FIELDS = [
  'trust_url_slug',
  'trust_url_enabled',
  'trust_url_show_breakdown',
  'trust_url_show_history',
] as const

const SLUG_RE = /^[a-z0-9-]{3,32}$/

/**
 * Slug rules — kept in lock-step with the regex inside the
 * public-trust-score edge function. Lowercase a-z, 0-9, hyphens, 3-32.
 * Deliberately rejects leading / trailing hyphens to avoid weird URLs
 * like /trust/-acme- ; we don't bother with reserved-word checks here
 * because the partial unique index handles uniqueness at the DB.
 */
export function isValidSlug(slug: string): boolean {
  if (!slug) return false
  if (!SLUG_RE.test(slug)) return false
  if (slug.startsWith('-') || slug.endsWith('-')) return false
  if (slug.includes('--')) return false
  return true
}

/**
 * Suggest a slug from the org name. Lowercase, ASCII-only, hyphens
 * between words. Trims to the 32-char limit. Used for the auto-fill in
 * the settings UI — the user can still hand-edit before saving.
 */
export function suggestSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '') // re-trim if slice cut mid-hyphen-run
  return ascii
}

/**
 * Build the public Trust URL the user can share. Uses window.origin so
 * preview deploys get preview links; falls back to a relative path on
 * the server (for tests / SSR scenarios).
 */
export function buildTrustUrl(slug: string): string {
  if (typeof window === 'undefined') return `/trust/${slug}`
  return `${window.location.origin}/trust/${slug}`
}

export function useTrustUrlSettings() {
  const { organisation } = useAuth()
  const orgId = organisation?.id ?? null
  return useQuery<TrustUrlSettings | null>({
    queryKey: ['trust-url-settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return null
      const { data, error } = await supabase
        .from('organisations')
        .select(TRUST_FIELDS.join(','))
        .eq('id', orgId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as TrustUrlSettings
      return {
        trust_url_slug: row.trust_url_slug ?? null,
        trust_url_enabled: row.trust_url_enabled ?? false,
        trust_url_show_breakdown: row.trust_url_show_breakdown ?? true,
        trust_url_show_history: row.trust_url_show_history ?? true,
      }
    },
  })
}

export function useUpdateTrustUrlSettings() {
  const qc = useQueryClient()
  const { organisation } = useAuth()
  const orgId = organisation?.id ?? null
  return useMutation({
    mutationFn: async (input: UpdateTrustUrlInput) => {
      if (!orgId) throw new Error('No organisation in scope')
      // Normalise slug — lowercase + trim. The DB partial-unique index
      // will surface conflicts, which we surface to the user as a toast.
      const slug = input.trust_url_slug
        ? input.trust_url_slug.trim().toLowerCase()
        : null
      if (input.trust_url_enabled) {
        if (!slug) throw new Error('Pick a slug before publishing your Trust URL.')
        if (!isValidSlug(slug)) {
          throw new Error('Slug must be 3-32 chars, lowercase a-z, 0-9, and hyphens only.')
        }
      }
      const { data, error } = await supabase
        .from('organisations')
        .update({
          trust_url_slug: slug,
          trust_url_enabled: input.trust_url_enabled,
          trust_url_show_breakdown: input.trust_url_show_breakdown,
          trust_url_show_history: input.trust_url_show_history,
        })
        .eq('id', orgId)
        .select(TRUST_FIELDS.join(','))
        .single()
      if (error) {
        // Postgres unique violation → friendlier message than the raw
        // "duplicate key value violates unique constraint ..." string.
        if (error.code === '23505') {
          throw new Error('That slug is already taken — please pick another.')
        }
        throw error
      }
      return data as unknown as TrustUrlSettings
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trust-url-settings', orgId] })
      toast.success('Trust URL settings saved')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not save Trust URL settings')
    },
  })
}
