// src/lib/audit/saved-filters.ts
// Per-user localStorage-backed saved filter sets for the audit log.
// Mirrors the saved-views pattern in src/components/shared/saved-views.tsx.

import type { AuditFilters, SavedAuditFilter } from './types'

const STORAGE_PREFIX = 'haumea_audit_saved_filters_'

function key(userId: string): string {
  return STORAGE_PREFIX + userId
}

export function loadSavedFilters(userId: string): SavedAuditFilter[] {
  try {
    const raw = localStorage.getItem(key(userId))
    if (raw) return JSON.parse(raw) as SavedAuditFilter[]
  } catch {
    /* ignore */
  }
  return []
}

export function saveSavedFilters(
  userId: string,
  filters: SavedAuditFilter[],
): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(filters))
  } catch {
    /* ignore — quota or private mode */
  }
}

export function addSavedFilter(
  userId: string,
  label: string,
  filters: AuditFilters,
): SavedAuditFilter {
  const all = loadSavedFilters(userId)
  const entry: SavedAuditFilter = {
    id: `audit-filter-${Date.now()}`,
    label,
    filters,
    createdAt: new Date().toISOString(),
  }
  all.push(entry)
  saveSavedFilters(userId, all)
  return entry
}

export function removeSavedFilter(userId: string, id: string): void {
  const all = loadSavedFilters(userId).filter((f) => f.id !== id)
  saveSavedFilters(userId, all)
}

/**
 * Quick filter chips. These never change — they're built into the UI.
 * "Mine" injects the current user's id at render time.
 */
export function quickFilterPresets(currentUserId: string | undefined): Array<{
  id: string
  label: string
  filters: AuditFilters
}> {
  return [
    { id: 'all', label: 'All', filters: {} },
    {
      id: 'authentication',
      label: 'Authentication',
      filters: { actionPrefixes: ['user', 'sso'] },
    },
    {
      id: 'permissions',
      label: 'Permission changes',
      filters: { actionPrefixes: ['user'], search: 'role' },
    },
    {
      id: 'failed',
      label: 'Failed actions',
      filters: { severities: ['critical', 'warning'] },
    },
    {
      id: 'mine',
      label: 'My actions',
      filters: currentUserId ? { actorIds: [currentUserId] } : {},
    },
  ]
}
