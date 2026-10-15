// W3-T9 — golden-thread Building Information Pack export.
// Mirrors use-tender-pack: invoke the edge function, unwrap errors, return
// the signed URLs. The function enforces per-property org access server-side.

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface BuildingPackResponse {
  ok: boolean
  html_url: string
  manifest_url: string | null
  storage_paths: { html: string; manifest: string }
  expires_in: number
  pdf_render_mode: 'browserless' | 'html_only'
  pdf_error: string | null
  summary: {
    assets: number
    compliance_items: number
    documents: number
    document_versions: number
    jobs: number
    certificates: number
    rams: number
    permits: number
    risk_assessments: number
  }
}

export function useExportBuildingPack() {
  return useMutation<BuildingPackResponse, Error, { propertyId: string }>({
    mutationFn: async ({ propertyId }) => {
      const { data, error } = await supabase.functions.invoke('building-pack-export', {
        body: { property_id: propertyId },
      })
      if (error) throw error
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }
      const result = data as BuildingPackResponse
      if (!result?.html_url) {
        throw new Error('Building pack generated but no download URL was returned')
      }
      return result
    },
  })
}
