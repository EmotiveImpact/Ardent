import { AppCard, Heading } from '@haumea/ui'

import GpsCheckIn from '@/components/field/gps-check-in'
import OnSiteActivity from '@/components/field/on-site-activity'
import { JobTimeCard } from '@/components/time/job-time-card'

interface JobTimelineTabProps {
  jobId: string
  organisationId: string
  status: string
  isEngineer: boolean
  engineerId?: string
  property: {
    latitude?: number | null
    longitude?: number | null
    address?: string | null
  }
}

export function JobTimelineTab({
  jobId,
  organisationId,
  status,
  isEngineer,
  engineerId,
  property,
}: JobTimelineTabProps) {
  return (
    <div className="space-y-5">
      {isEngineer && status !== 'completed' && status !== 'cancelled' ? (
        <GpsCheckIn
          jobId={jobId}
          organisationId={organisationId}
          engineerId={engineerId}
          property={{
            latitude: property.latitude ?? null,
            longitude: property.longitude ?? null,
            address: property.address ?? null,
          }}
        />
      ) : null}

      <AppCard>
        <Heading level={2} scale="body" className="mb-4">
          On-site activity
        </Heading>
        <OnSiteActivity
          jobId={jobId}
          property={{
            latitude: property.latitude ?? null,
            longitude: property.longitude ?? null,
          }}
        />
      </AppCard>

      <JobTimeCard jobId={jobId} organisationId={organisationId} />
    </div>
  )
}
