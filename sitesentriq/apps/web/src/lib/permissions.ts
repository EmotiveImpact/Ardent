export type Permission =
  | 'clients:read' | 'clients:write'
  | 'properties:read' | 'properties:write'
  | 'assets:read' | 'assets:write'
  | 'compliance:read' | 'compliance:write'
  | 'maintenance:read' | 'maintenance:write'
  | 'scheduler:read' | 'scheduler:write'
  | 'jobs:read' | 'jobs:write'
  | 'reports:read' | 'reports:write'
  | 'documents:read' | 'documents:write'
  | 'quotes:read' | 'quotes:write'
  | 'invoices:read' | 'invoices:write'
  | 'analytics:read'
  | 'settings:read' | 'settings:write'
  | 'users:read' | 'users:write'
  | 'audit:read' | 'audit:export'
  | 'import:write'
  | 'branding:write'
  | 'data:export' | 'data:delete' | 'privacy:read'
  // Wave 14 / Task 114 — site-level tenant portal permissions.
  | 'site:read' | 'site:raise_callout' | 'site:approve_quote'

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: [
    'clients:read', 'clients:write', 'properties:read', 'properties:write',
    'assets:read', 'assets:write', 'compliance:read', 'compliance:write',
    'maintenance:read', 'maintenance:write', 'scheduler:read', 'scheduler:write',
    'jobs:read', 'jobs:write', 'reports:read', 'reports:write',
    'documents:read', 'documents:write', 'quotes:read', 'quotes:write',
    'invoices:read', 'invoices:write', 'analytics:read',
    'settings:read', 'settings:write', 'users:read', 'users:write',
    'audit:read', 'audit:export',
    'import:write',
    'branding:write',
    'data:export', 'data:delete', 'privacy:read',
  ],
  org_admin: [
    'clients:read', 'clients:write', 'properties:read', 'properties:write',
    'assets:read', 'assets:write', 'compliance:read', 'compliance:write',
    'maintenance:read', 'maintenance:write', 'scheduler:read', 'scheduler:write',
    'jobs:read', 'jobs:write', 'reports:read', 'reports:write',
    'documents:read', 'documents:write', 'quotes:read', 'quotes:write',
    'invoices:read', 'invoices:write', 'analytics:read',
    'settings:read', 'settings:write', 'users:read', 'users:write',
    'audit:read', 'audit:export',
    'import:write',
    'branding:write',
    'data:export', 'data:delete', 'privacy:read',
  ],
  scheduler: [
    'clients:read', 'properties:read', 'assets:read',
    'compliance:read', 'maintenance:read',
    'scheduler:read', 'scheduler:write',
    'jobs:read', 'jobs:write',
    'reports:read', 'documents:read',
    'privacy:read',
  ],
  finance: [
    'clients:read', 'properties:read',
    'quotes:read', 'quotes:write',
    'invoices:read', 'invoices:write',
    'analytics:read', 'reports:read', 'documents:read',
    'privacy:read',
  ],
  engineer: [
    'jobs:read', 'jobs:write',
    'reports:read', 'reports:write',
    'documents:read', 'documents:write',
    'assets:read', 'compliance:read',
    'properties:read',
    'privacy:read',
  ],
  client_admin: [
    'compliance:read', 'reports:read', 'documents:read',
    'invoices:read', 'quotes:read', 'properties:read',
    'privacy:read',
  ],
  auditor: [
    'compliance:read', 'reports:read', 'documents:read',
    'assets:read', 'properties:read', 'clients:read',
    'audit:read',
    'privacy:read',
  ],
  // Wave 14 / Task 114 — single-property end-user (pub manager,
  // school facilities lead etc). Lives at /site/* only.
  tenant_user: [
    'site:read', 'site:raise_callout', 'site:approve_quote',
    // Read-only equivalents so existing TanStack Query hooks
    // (which gate on these) work in the /site routes too.
    'compliance:read', 'documents:read', 'quotes:read',
    'reports:read',
  ],
}

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function hasAnyPermission(role: string | undefined, permissions: Permission[]): boolean {
  if (!role) return false
  return permissions.some(p => hasPermission(role, p))
}

export function getPermissions(role: string | undefined): Permission[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role] ?? []
}
