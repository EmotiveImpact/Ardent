import { Navigate } from 'react-router'
import { Spinner } from '@haumea/ui'
import { useAuth } from '@/hooks/use-auth'
import { WorkspaceSetupPending } from '@/components/auth/workspace-setup-pending'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, organisation, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Confirmed account but no organisation resolved — client-side org creation
  // failed or timed out during boot (see auth-context.tsx). Rendering children
  // here would let the page through only for every mutation to throw
  // "No organisation found". Show a recoverable setup screen instead.
  if (!organisation) {
    return <WorkspaceSetupPending />
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
