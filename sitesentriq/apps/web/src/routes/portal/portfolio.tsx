import { lazy, Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { usePortalProperty } from '@/components/layout/portal-layout'
import { usePropertiesWithStatus } from '@/hooks/use-properties-with-status'
import { useAuth } from '@/hooks/use-auth'
import { SkeletonBox } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

const PortfolioMap = lazy(() =>
  import('@/components/shared/portfolio-map').then((m) => ({ default: m.PortfolioMap })),
)

export default function PortalPortfolioPage() {
  const { profile } = useAuth()
  const { selectedPropertyId } = usePortalProperty()
  // Scope to the client_admin's client (RLS 00096 backs this; NULL for staff).
  const { data, isLoading } = usePropertiesWithStatus({ clientId: profile?.client_id ?? undefined })

  const mapProperties = (data ?? [])
    .filter((p) => (selectedPropertyId ? p.id === selectedPropertyId : true))
    .map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      status: p.status,
      clientName: p.clients?.name ?? undefined,
      propertyType: p.site_type ?? undefined,
    }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/portal"
            className="inline-flex items-center gap-1.5 text-caption font-medium text-text-secondary hover:text-text-primary mb-1"
          >
            <ArrowLeft size={13} />
            Back to overview
          </Link>
          <PageHeader title="Portfolio Map" subtitle="All sites coloured by current compliance status" />
        </div>
      </div>

      {isLoading && (
        <SkeletonBox className="w-full rounded-lg" style={{ height: 'calc(100vh - 220px)' }} />
      )}

      {!isLoading && (
        <Suspense
          fallback={
            <SkeletonBox className="w-full rounded-lg" style={{ height: 'calc(100vh - 220px)' }} />
          }
        >
          <PortfolioMap properties={mapProperties} height="calc(100vh - 220px)" />
        </Suspense>
      )}
    </div>
  )
}
