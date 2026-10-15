// src/lib/audit/types.ts
// Shared types for the org-wide audit log UI + writer.

export type AuditSeverity = 'info' | 'warning' | 'critical'

export type AuditSource =
  | 'timeline_events'
  | 'system_audit_events'
  | 'sso_provisioning_log'
  | 'accounting_sync_log'

/**
 * Shape returned by the `audit_log_view` (see migration 00024).
 * `id` is text because the underlying view casts uuids to text so
 * different sources can coexist in a UNION.
 */
export interface AuditLogRow {
  id: string
  organisation_id: string
  actor_user_id: string | null
  actor_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  severity: AuditSeverity
  source: AuditSource
  created_at: string
}

/**
 * Built-in quick-filter chips shown above the audit table.
 */
export type QuickFilterId =
  | 'all'
  | 'authentication'
  | 'permissions'
  | 'failed'
  | 'mine'

export interface AuditFilters {
  /** ISO date string (inclusive) — events on/after this moment. */
  fromDate?: string
  /** ISO date string (inclusive) — events on/before this moment. */
  toDate?: string
  /** Multi-select of profile ids. Empty array = no actor filter. */
  actorIds?: string[]
  /** Multi-select of action prefixes (e.g. ["job", "invoice"]). */
  actionPrefixes?: string[]
  /** Multi-select of `entity_type` values. */
  entityTypes?: string[]
  /** Multi-select of severities. */
  severities?: AuditSeverity[]
  /** ILIKE search across `summary` + `metadata::text`. */
  search?: string
}

export interface SavedAuditFilter {
  id: string
  label: string
  filters: AuditFilters
  createdAt: string
}
