// src/components/dev/dev-status-badge.tsx
//
// Tiny fixed-bottom-right deploy status pill, only rendered when
// `import.meta.env.DEV` is true and the user is authenticated.
// Wraps DeployStatusBanner with placement="dev" so the actual UI
// logic (failure vs in-progress vs hidden) lives in one place.

import { useAuth } from '@/hooks/use-auth'
import { DeployStatusBanner } from './deploy-status-banner'

export function DevStatusBadge() {
  const { user } = useAuth()
  if (!import.meta.env.DEV) return null
  if (!user) return null
  return <DeployStatusBanner placement="dev" />
}

export default DevStatusBadge
