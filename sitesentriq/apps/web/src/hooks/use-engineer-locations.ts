import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface LocationPayload {
  organisationId?: string | null
  engineerId: string
  currentJobId?: string | null
  latitude: number
  longitude: number
  accuracyMetres?: number | null
  movementStatus?: 'available' | 'travelling' | 'on_site' | 'offline'
  etaAt?: string | null
}

export function useRecordEngineerLocation() {
  return useMutation({
    mutationFn: async (payload: LocationPayload) => {
      const { data, error } = await supabase.rpc('record_engineer_location', {
        p_engineer_id: payload.engineerId,
        p_current_job_id: payload.currentJobId ?? null,
        p_latitude: payload.latitude,
        p_longitude: payload.longitude,
        p_accuracy_metres: payload.accuracyMetres ?? null,
        p_movement_status: payload.movementStatus ?? 'travelling',
        p_eta_at: payload.etaAt ?? null,
      })

      if (!error) return data

      if (!/record_engineer_location|schema cache|does not exist/i.test(error.message)) {
        throw error
      }

      const { data: fallback, error: insertError } = await supabase
        .from('engineer_locations')
        .insert({
          engineer_id: payload.engineerId,
          organisation_id: payload.organisationId ?? undefined,
          current_job_id: payload.currentJobId ?? null,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy_metres: payload.accuracyMetres ?? null,
          movement_status: payload.movementStatus ?? 'travelling',
          eta_at: payload.etaAt ?? null,
        })
        .select()
        .single()
      if (insertError) throw insertError
      return fallback
    },
  })
}
