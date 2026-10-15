import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

/**
 * Response shape from the generate-tender-pack edge function.
 */
export interface TenderPackResponse {
  ok: boolean
  url: string
  storage_path: string
  expires_in: number
  pdf_render_mode: 'browserless' | 'html_only'
  pdf_error: string | null
  summary: {
    score: number | null
    score_date: string | null
    trend_points: number
    certificate_count: number
    compliance_total: number
    active_contracts: number
  }
}

/**
 * Admin-only mutation — calls the generate-tender-pack edge function for
 * the current org. The function assembles the branded compliance
 * evidence bundle (score + 12-month trend + in-date certificates +
 * compliance summary + active contracts) and returns a short-lived
 * signed URL to the rendered PDF (or HTML fallback).
 */
export function useGenerateTenderPack() {
  const { organisation } = useAuth()
  const orgId = organisation?.id ?? null

  return useMutation<TenderPackResponse, Error>({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organisation context')
      const { data, error } = await supabase.functions.invoke('generate-tender-pack', {
        body: { organisation_id: orgId },
      })
      if (error) throw error
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }
      const result = data as TenderPackResponse
      if (!result?.url) {
        throw new Error('Tender pack generated but no download URL was returned')
      }
      return result
    },
  })
}
