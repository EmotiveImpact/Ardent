import { useNavigate } from 'react-router'
import { Chip, Skeleton } from '@haumea/ui'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

import { useNeedsAttention } from '@/hooks/use-needs-attention'
import { SectionHeader } from '@/components/shared/section-header'
import { DashboardEmptyState } from './dashboard-empty-state'
import type { AttentionItem } from '@/hooks/use-needs-attention'

const ATTENTION_ICONS: Record<AttentionItem['kind'], typeof FileWarning> = {
  compliance: ShieldCheck,
  action: AlertTriangle,
  invoice: Wallet,
  contract: CalendarClock,
}

const ATTENTION_TINT: Record<AttentionItem['kind'], string> = {
  compliance: 'text-status-overdue bg-status-overdue/10',
  action: 'text-status-due-soon bg-status-due-soon/10',
  invoice: 'text-brand-500 bg-brand-500/10',
  contract: 'text-metric-violet bg-metric-violet/10',
}

export function DashboardComplianceFeed() {
  const { data, isLoading } = useNeedsAttention(5)
  const navigate = useNavigate()

  return (
    <section className="rounded-xl border border-border-default bg-surface-card">
      <div className="px-5 pt-5">
        <SectionHeader
          icon={<AlertTriangle size={16} />}
          title="Needs Attention"
          subtitle="The most urgent items across compliance, actions and invoices"
        />
      </div>
      <div className="p-5 pt-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <DashboardEmptyState
            icon={<CheckCircle2 size={28} className="text-status-compliant" />}
            title="Nothing flagged"
            subtitle="Your compliance, actions and invoices are all in good shape."
          />
        ) : (
          <ul className="space-y-1">
            {data.map((item) => {
              const Icon = ATTENTION_ICONS[item.kind]
              const tint = ATTENTION_TINT[item.kind]
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    className="card-hover -mx-1 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-elevated"
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tint}`}>
                      <Icon size={15} strokeWidth={2.1} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label font-medium text-text-primary">{item.title}</p>
                      <p className="truncate text-micro text-text-muted">{item.subtitle}</p>
                    </div>
                    {item.ageLabel ? (
                      <Chip size="sm" className="border-0 bg-status-overdue/10 text-[10px] text-status-overdue">
                        {item.ageLabel}
                      </Chip>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
