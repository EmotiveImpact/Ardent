// Wave 14 / Task 114 — Site portal: contacts list (read-only for site_lead).
import { Chip } from '@haumea/ui'
import { Users, Mail } from 'lucide-react'
import { useTenantContacts } from '@/lib/site-portal/hooks'
import { formatDate } from '@haumea/utils'
import { ListSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

const STATUS_CHIP_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  invited: 'warning',
  disabled: 'default',
}

export default function SiteContactsPage() {
  const { data: contacts, isLoading } = useTenantContacts()

  if (isLoading) {
    return <ListSkeleton rows={5} />
  }

  const list = contacts ?? []

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Site contacts" subtitle="People at this site with access to the portal. To invite or remove someone, contact your FM team." />
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">
            All contacts ({list.length})
          </h2>
        </div>
        {list.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-text-muted">
            <Users size={32} strokeWidth={1.5} className="mb-2" />
            <p className="text-label">No contacts yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {list.map((c) => (
              <li
                key={c.id}
                className="px-5 py-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-label font-medium text-text-primary">
                    {c.full_name}
                  </p>
                  <p className="text-micro text-text-muted mt-0.5 inline-flex items-center gap-1">
                    <Mail size={11} /> {c.email}
                  </p>
                  <p className="text-micro text-text-muted mt-0.5">
                    {c.role_at_site}
                    {c.accepted_at
                      ? ` · joined ${formatDate(c.accepted_at)}`
                      : ` · invited ${formatDate(c.invited_at)}`}
                  </p>
                </div>
                <Chip variant="soft" color={STATUS_CHIP_COLOR[c.status] ?? 'default'} size="sm">
                  {c.status}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
