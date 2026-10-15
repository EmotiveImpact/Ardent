import { useAuth } from './use-auth'
import { hasPermission, hasAnyPermission } from '@/lib/permissions'

export function usePermissions() {
  const { profile } = useAuth()
  const role = profile?.role

  return {
    can: (permission: Parameters<typeof hasPermission>[1]) => hasPermission(role, permission),
    canAny: (permissions: Parameters<typeof hasAnyPermission>[1]) => hasAnyPermission(role, permissions),
    role,
  }
}
