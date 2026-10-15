import { Button } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { Compass, Home, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

/**
 * Friendly 404 rendered by the global `path="*"` catch-all in App.tsx.
 * Previously any unmatched URL fell through to a blank Suspense screen
 * (no route matched, nothing rendered). This gives users a clear way out:
 * back to the previous page, or straight to the dashboard.
 */
export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface-page flex items-center justify-center px-4 py-12">
      <AppCard padding="lg" className="max-w-md w-full text-center">
        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center">
            <Compass className="text-brand-500" size={22} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[16px] font-semibold text-text-primary tracking-[-0.01em]">
              Page not found
            </h1>
            <p className="text-label text-text-secondary">
              The page you are looking for does not exist or may have moved.
            </p>
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button size="sm" variant="outline" onPress={() => navigate(-1)}>
              <ArrowLeft size={14} aria-hidden="true" />
              Go back
            </Button>
            <Button size="sm" variant="primary" onPress={() => navigate('/dashboard')}>
              <Home size={14} aria-hidden="true" />
              Go to dashboard
            </Button>
          </div>
        </div>
      </AppCard>
    </div>
  )
}
