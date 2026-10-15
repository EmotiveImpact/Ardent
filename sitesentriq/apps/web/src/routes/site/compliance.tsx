// Wave 14 / Task 114 — Site portal: compliance status for one property.
import { Chip } from '@haumea/ui'
import { CheckCircle2, Clock, AlertTriangle, ShieldOff, HelpCircle } from 'lucide-react'
import { useTenantCompliance } from '@/lib/site-portal/hooks'
import { COMPLIANCE_TYPE_LABELS } from '@/lib/constants'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

const STATUS_META: Record<
  string,
  { label: string; color: 'success' | 'warning' | 'danger'; icon: React.ElementType; explainer: string }
> = {
  compliant: {
    label: 'Compliant',
    color: 'success',
    icon: CheckCircle2,
    explainer: 'This item is up to date and within its valid window.',
  },
  due_soon: {
    label: 'Due soon',
    color: 'warning',
    icon: Clock,
    explainer:
      'Becoming due in the next 30 days. Your FM team will schedule it shortly.',
  },
  overdue: {
    label: 'Overdue',
    color: 'danger',
    icon: AlertTriangle,
    explainer:
      'The window has passed. The FM team has been notified and should be in touch.',
  },
  non_compliant: {
    label: 'Non-compliant',
    color: 'danger',
    icon: ShieldOff,
    explainer:
      'Failed last inspection. A remedial visit should already be in progress.',
  },
}

export default function SiteCompliancePage() {
  const { data: items, isLoading } = useTenantCompliance()

  if (isLoading) {
    return <TableSkeleton rows={6} cols={4} />
  }

  const list = items ?? []
  const counts = {
    compliant: list.filter((i) => i.status === 'compliant').length,
    due_soon: list.filter((i) => i.status === 'due_soon').length,
    overdue: list.filter((i) => i.status === 'overdue').length,
    non_compliant: list.filter((i) => i.status === 'non_compliant').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Compliance" subtitle="Status of every regulatory check at your site." />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile label="Compliant" value={counts.compliant} cls="text-status-compliant" />
        <SummaryTile label="Due soon" value={counts.due_soon} cls="text-status-due-soon" />
        <SummaryTile label="Overdue" value={counts.overdue} cls="text-status-overdue" />
        <SummaryTile
          label="Non-compliant"
          value={counts.non_compliant}
          cls="text-status-non-compliant"
        />
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">
            All items ({list.length})
          </h2>
        </div>
        {list.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-text-muted">
            <CheckCircle2 size={32} strokeWidth={1.5} className="mb-2" />
            <p className="text-label">No compliance items configured for this site yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {list.map((item) => {
              const meta =
                STATUS_META[item.status] ?? {
                  label: item.status,
                  color: 'warning' as const,
                  icon: HelpCircle,
                  explainer: '',
                }
              const Icon = meta.icon
              const typeLabel =
                COMPLIANCE_TYPE_LABELS[item.compliance_type] ?? item.compliance_type
              return (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-label font-medium text-text-primary truncate">
                        {item.name}
                      </p>
                      <p className="text-micro text-text-muted mt-0.5">
                        {typeLabel} · {item.frequency}
                        {item.next_due
                          ? ` · next due ${new Date(item.next_due).toLocaleDateString()}`
                          : ''}
                      </p>
                      {meta.explainer && (
                        <p className="text-micro text-text-muted mt-1.5 italic flex items-start gap-1.5 max-w-prose">
                          <HelpCircle
                            size={11}
                            className="mt-0.5 shrink-0 text-text-muted/70"
                          />
                          <span>{meta.explainer}</span>
                        </p>
                      )}
                    </div>
                    <Chip variant="soft" color={meta.color} size="sm" className="whitespace-nowrap">
                      <Icon size={11} />
                      {meta.label}
                    </Chip>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function SummaryTile({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl px-4 py-3">
      <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
        {label}
      </p>
      <p className={`text-[22px] font-bold leading-tight mt-0.5 ${cls}`}>{value}</p>
    </div>
  )
}
