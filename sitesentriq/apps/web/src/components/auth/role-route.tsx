import type { ReactNode } from 'react'
import { Spinner } from '@haumea/ui'
import type { Permission } from '@/lib/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { useAuthContext } from '@/contexts/auth-context'
import { AccessDenied } from '@/components/shared/access-denied'

interface RoleRouteProps {
  children: ReactNode
  /** User must have at least one of these permissions to access the route. */
  requiredPermissions: Permission[]
}

/**
 * Wraps route content and shows AccessDenied if the current user
 * lacks all of the required permissions.
 * Should be used inside a <ProtectedRoute> (auth is already checked).
 *
 * IMPORTANT: only the auth context's active loading phase renders a spinner.
 * Once loading is false, a missing profile is terminal for this render path:
 * continuing to wait on `!profile` leaves the app stuck in a permanent loader
 * when the profile RPC/RLS path fails or returns no row.
 */
export function RoleRoute({ children, requiredPermissions }: RoleRouteProps) {
  const { canAny } = usePermissions()
  const { loading, profile } = useAuthContext()

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Spinner size="md" />
      </div>
    )
  }

  if (!profile || !canAny(requiredPermissions)) {
    return <AccessDenied />
  }

  return <>{children}</>
}
