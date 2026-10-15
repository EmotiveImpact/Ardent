// GDPR types — shared between admin / user-facing pages.

export type GdprRequestType = 'export' | 'delete'
export type GdprRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface GdprRequest {
  id: string
  organisation_id: string
  requested_by_user_id: string
  request_type: GdprRequestType
  subject_user_id: string | null
  subject_email: string | null
  status: GdprRequestStatus
  download_url: string | null
  completed_at: string | null
  failure_reason: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface GdprRequestWithSubject extends GdprRequest {
  subject_full_name?: string | null
  requested_by_full_name?: string | null
  requested_by_email?: string | null
}

export interface ExportFnResult {
  ok: boolean
  request_id: string
  download_url: string | null
  object_path: string
  expires_in_seconds: number
  completed_at: string
  error?: string
}

export interface DeleteFnResult {
  ok: boolean
  request_id: string
  strategy: 'soft-anonymise'
  steps: Record<string, string>
  warnings: string[]
  completed_at: string
  note: string
  error?: string
}
