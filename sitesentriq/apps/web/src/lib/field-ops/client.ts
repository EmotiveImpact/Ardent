/**
 * Supabase data access for field-ops.
 * Defensive against DEV_MODE (placeholder env vars) — falls back to mock paths
 * so the UI flow can still be exercised without a real backend.
 */
import { supabase } from '@/lib/supabase'
import type { FieldEvent, FieldEventType } from './types'
import type { GeoSample } from './geolocation'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

const SIGNATURES_BUCKET = 'field-signatures'

export interface InsertFieldEventInput {
  organisation_id: string
  job_id: string
  engineer_id?: string | null
  event_type: FieldEventType
  geo?: GeoSample | null
  metadata?: Record<string, unknown> | null
}

export async function insertFieldEvent(
  input: InsertFieldEventInput,
): Promise<FieldEvent | null> {
  const payload = {
    organisation_id: input.organisation_id,
    job_id: input.job_id,
    engineer_id: input.engineer_id ?? null,
    event_type: input.event_type,
    latitude: input.geo?.lat ?? null,
    longitude: input.geo?.lng ?? null,
    accuracy_metres: input.geo?.accuracyM ?? null,
    metadata: input.metadata ?? null,
  }

  if (DEV_MODE) {
    console.log('[DEV_MODE] insertFieldEvent:', payload)
    return {
      id: `mock-${Date.now()}`,
      ...payload,
      engineer_id: payload.engineer_id ?? null,
      metadata: payload.metadata ?? null,
      created_at: new Date().toISOString(),
    } as FieldEvent
  }

  const { data, error } = await supabase
    .from('field_events')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[field-ops] insertFieldEvent failed:', error.message)
    return null
  }
  return data as FieldEvent
}

export async function listFieldEvents(jobId: string): Promise<FieldEvent[]> {
  if (DEV_MODE) {
    console.log('[DEV_MODE] listFieldEvents:', jobId)
    return []
  }
  const { data, error } = await supabase
    .from('field_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[field-ops] listFieldEvents failed:', error.message)
    return []
  }
  return (data as FieldEvent[]) ?? []
}

/** Convert a data-URL signature into a PNG Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = /data:([^;]+);base64/.exec(header)
  const mime = mimeMatch?.[1] ?? 'image/png'
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/**
 * Upload a captured signature PNG to the private `field-signatures` bucket.
 * Returns the storage path (not a public URL — the bucket is private).
 */
export async function uploadSignaturePng(
  jobId: string,
  dataUrl: string,
): Promise<{ path: string; publicUrl?: string } | null> {
  const path = `${jobId}/${Date.now()}.png`

  if (DEV_MODE) {
    console.log('[DEV_MODE] uploadSignaturePng:', path)
    return {
      path,
      publicUrl: `https://placeholder.supabase.co/storage/v1/object/${SIGNATURES_BUCKET}/${path}`,
    }
  }

  const blob = dataUrlToBlob(dataUrl)
  const { error } = await supabase.storage
    .from(SIGNATURES_BUCKET)
    .upload(path, blob, { contentType: 'image/png', upsert: false })

  if (error) {
    console.error('[field-ops] uploadSignaturePng failed:', error.message)
    return null
  }

  return { path }
}

/**
 * Create a short-lived signed URL for a private signature PNG.
 * Returns null in dev mode or on failure (caller should show a placeholder).
 */
export async function createSignatureSignedUrl(
  storagePath: string,
  ttlSeconds = 60 * 10,
): Promise<string | null> {
  if (DEV_MODE) {
    return `https://placeholder.supabase.co/storage/v1/object/${SIGNATURES_BUCKET}/${storagePath}`
  }
  const { data, error } = await supabase.storage
    .from(SIGNATURES_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds)
  if (error) {
    console.error('[field-ops] createSignatureSignedUrl failed:', error.message)
    return null
  }
  return data?.signedUrl ?? null
}
