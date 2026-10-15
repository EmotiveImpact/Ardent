import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APP_CONFIG } from '@/constants/config'

export const supabase = createClient(
  APP_CONFIG.supabaseUrl,
  APP_CONFIG.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)

// Types matching Haumea schema
export interface Job {
  id: string
  /** Human-readable per-org job number, e.g. "H-101" (migration 00097). */
  job_number?: string | null
  title: string
  description: string | null
  // jobs.status CHECK set (00001 + expanded 00100). String-typed for the
  // expanded workflow statuses so new values don't need a code change.
  status: string
  /** Permit-to-work flag (00121): in_progress is DB-gated on an issued permit. */
  requires_permit?: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
  scheduled_date: string | null
  // jobs has time_window / time_start / time_end (NOT scheduled_time).
  time_window: string | null
  time_start: string | null
  property_id: string | null
  client_id: string | null
  // jobs.engineer_record_id -> engineers; per-engineer assignment lives in engineer_assignments.
  engineer_record_id: string | null
  // Real arrival/completion columns (NOT checkin_*/checkout_*; GPS lives in field_events).
  arrived_at: string | null
  working_started_at: string | null
  completed_date: string | null
  expected_arrival_at?: string | null
  eta_earliest_at?: string | null
  eta_latest_at?: string | null
  // Single signature slot + customer sign-off metadata (no engineer_signature_url column).
  signature_url: string | null
  customer_signature_name: string | null
  customer_signature_role: string | null
  customer_signature_at: string | null
  organisation_id: string
  created_at: string
  // Joined fields
  properties?: { name: string; address: string } | null
  clients?: { name: string; contact_phone?: string | null } | null
}

export interface ServiceReportRow {
  id: string
  job_id: string
  organisation_id: string
  engineer_id: string | null
  outcome: 'pass' | 'fail' | 'incomplete' | 'revisit' | 'n_a' | null
  notes: string | null
  signature_url: string | null
  submitted_at: string
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
  organisation_id: string
  avatar_url: string | null
  created_at: string
}
