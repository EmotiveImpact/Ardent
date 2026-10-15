// Expiry radar banner (W2-T5): insurance/accreditations lapsed or expiring in
// the next 30 days, surfaced where dispatchers look — the subcontractors list.

import { Link } from 'react-router'
import { AppCard, Chip } from '@haumea/ui'
import { CalendarClock } from 'lucide-react'
import { formatDate } from '@haumea/utils'
import { useExpiringSubcontractorCompliance } from '@/hooks/use-subcontractor-compliance'

export function SubcontractorExpiryBanner() {
  const { data: items = [] } = useExpiringSubcontractorCompliance(30)
  if (items.length === 0) return null

  const todayKey = new Date().toLocaleDateString('en-CA')

  return (
    <AppCard padding="md">
      <h3 className="text-body font-semibold text-text-primary mb-2 inline-flex items-center gap-2">
        <CalendarClock size={15} className="text-status-due-soon" aria-hidden />
        Compliance expiring soon
      </h3>
      <ul className="divide-y divide-border-subtle">
        {items.slice(0, 6).map((item) => {
          const lapsed = item.expiry_date < todayKey
          return (
            <li
              key={`${item.subcontractor_id}-${item.kind}-${item.label}-${item.expiry_date}`}
              className="flex items-center gap-3 py-1.5"
            >
              <Link
                to={`/dashboard/subcontractors/${item.subcontractor_id}`}
                className="min-w-0 flex-1 truncate text-label text-text-secondary hover:text-text-primary"
              >
                {item.company_name}
                <span className="text-text-muted"> · {item.label} ({item.kind})</span>
              </Link>
              <Chip variant="soft" size="sm" color={lapsed ? 'danger' : 'warning'}>
                {lapsed ? `Lapsed ${formatDate(item.expiry_date)}` : `Expires ${formatDate(item.expiry_date)}`}
              </Chip>
            </li>
          )
        })}
      </ul>
      {items.length > 6 && (
        <p className="mt-2 text-caption text-text-muted">+{items.length - 6} more</p>
      )}
    </AppCard>
  )
}
