import { usePermissions } from '@/hooks/use-permissions'
import { hasPermission, hasAnyPermission } from '@/lib/permissions'

interface PermissionGateProps {
  children: React.ReactNode
  permission?: string
  permissions?: string[]
  fallback?: React.ReactNode
}

export function PermissionGate({ children, permission, permissions, fallback = null }: PermissionGateProps) {
  const { role } = usePermissions()

  if (permission && !hasPermission(role, permission as Parameters<typeof hasPermission>[1])) {
    return <>{fallback}</>
  }
  if (permissions && !hasAnyPermission(role, permissions as Parameters<typeof hasAnyPermission>[1])) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
