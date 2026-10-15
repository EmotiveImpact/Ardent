import { Link } from 'react-router'
import { Skeleton } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  FilePlus2,
  Receipt,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@haumea/utils'
import { useDashboardKpis } from '@/hooks/use-dashboard-kpis'
import { KpiTile, type KpiAccent } from '@/components/shared/kpi-tile'

export function DashboardKpiGrid() {
  const { data, isLoading } = useDashboardKpis()

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[136px] rounded-xl" />
        ))}
      </div>
    )
  }

  type Tile = {
    label: string
    value: number
    displayValue?: string
    decimals?: number
    prefix?: string
    suffix?: string
    delta: number
    inverseDelta?: boolean
    sparkline: number[]
    accent: KpiAccent
    icon: typeof ShieldCheck
    to: string
  }

  const tiles: Tile[] = [
    { label: 'Compliant items', value: data.compliancePct, suffix: '%', delta: data.compliancePctDelta, sparkline: data.complianceSparkline, accent: 'green', icon: ShieldCheck, to: '/dashboard/compliance' },
    { label: 'Open Jobs', value: data.openJobs, delta: data.openJobsDelta, sparkline: data.openJobsSparkline, accent: 'brand', icon: Briefcase, to: '/dashboard/jobs' },
    { label: 'Overdue Items', value: data.overdueItems, delta: data.overdueItemsDelta, inverseDelta: true, sparkline: data.overdueItemsSparkline, accent: 'rose', icon: AlertTriangle, to: '/dashboard/compliance' },
    { label: 'Active Engineers', value: data.activeEngineers, delta: data.activeEngineersDelta, sparkline: data.activeEngineersSparkline, accent: 'teal', icon: Users, to: '/dashboard/engineers' },
    { label: 'Revenue MTD', value: data.revenueMtd, displayValue: formatCurrency(data.revenueMtd), delta: data.revenueMtdDelta, sparkline: data.revenueMtdSparkline, accent: 'violet', icon: Banknote, to: '/dashboard/invoices' },
    { label: 'Outstanding', value: data.outstandingInvoices, displayValue: formatCurrency(data.outstandingInvoices), delta: data.outstandingInvoicesDelta, inverseDelta: true, sparkline: data.outstandingInvoicesSparkline, accent: 'amber', icon: Receipt, to: '/dashboard/invoices' },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((t, i) => (
        <KpiTile key={t.label} {...t} delay={i * 0.05} />
      ))}
    </div>
  )
}

function useQuoteTypeWidgets() {
  return useQuery({
    queryKey: ['dashboard', 'quote-type-widgets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('quote_type, status, total')
        .in('status', ['draft', 'sent', 'approved'])
      if (error) throw error

      const rows = data ?? []
      const service = rows.filter((row) => row.quote_type === 'service_quote' || row.quote_type === 'service')
      const defect = rows.filter((row) => row.quote_type === 'defect_quote' || row.quote_type === 'reactive' || !row.quote_type)
      const sum = (items: typeof rows) => items.reduce((total, row) => total + (Number(row.total) || 0), 0)
      return {
        service: { count: service.length, total: sum(service) },
        defect: { count: defect.length, total: sum(defect) },
      }
    },
  })
}

export function DashboardQuoteTypeWidgets() {
  const { data, isLoading } = useQuoteTypeWidgets()
  const widgets = [
    {
      label: 'Service Quotes',
      subtitle: 'Planned works, servicing and routine contract uplift',
      count: data?.service.count ?? 0,
      total: data?.service.total ?? 0,
      href: '/dashboard/quotes',
      tint: 'text-brand-500 bg-brand-500/10',
    },
    {
      label: 'Defect Quotes',
      subtitle: 'Remedial works raised from failed visits and actions',
      count: data?.defect.count ?? 0,
      total: data?.defect.total ?? 0,
      href: '/dashboard/quotes',
      tint: 'text-status-due-soon bg-status-due-soon/10',
    },
  ]

  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {widgets.map((widget) => (
        <Link key={widget.label} to={widget.href} className="card-hover block">
          <AppCard padding="md" className="transition-colors hover:bg-surface-elevated">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption font-medium uppercase tracking-[0.08em] text-text-muted">{widget.label}</p>
                <p className="mt-1 text-label text-text-secondary">{widget.subtitle}</p>
              </div>
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${widget.tint}`}>
                <FilePlus2 size={16} />
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <span className="text-[26px] font-semibold tracking-[-0.03em] text-text-primary">
                {isLoading ? '-' : widget.count}
              </span>
              <span className="text-label font-medium text-text-secondary">{formatCurrency(widget.total)}</span>
            </div>
          </AppCard>
        </Link>
      ))}
    </section>
  )
}

function usePurchaseOrderWidgets() {
  return useQuery({
    queryKey: ['dashboard', 'purchase-order-widgets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('status, total')
        .in('status', ['draft', 'sent', 'approved'])
      if (error) {
        if (/schema cache|does not exist|purchase_orders/i.test(error.message)) {
          return { awaitingApproval: { count: 0, total: 0 }, approved: { count: 0, total: 0 } }
        }
        throw error
      }

      const rows = data ?? []
      const awaitingApproval = rows.filter((row) => row.status === 'draft' || row.status === 'sent')
      const approved = rows.filter((row) => row.status === 'approved')
      const sum = (items: typeof rows) => items.reduce((total, row) => total + (Number(row.total) || 0), 0)
      return {
        awaitingApproval: { count: awaitingApproval.length, total: sum(awaitingApproval) },
        approved: { count: approved.length, total: sum(approved) },
      }
    },
  })
}

export function DashboardPurchaseOrderWidgets() {
  const { data, isLoading } = usePurchaseOrderWidgets()
  const widgets = [
    {
      label: 'POs Awaiting Approval',
      subtitle: 'Draft and sent supplier orders',
      count: data?.awaitingApproval.count ?? 0,
      total: data?.awaitingApproval.total ?? 0,
      tint: 'text-status-due-soon bg-status-due-soon/10',
    },
    {
      label: 'Approved Supplier Spend',
      subtitle: 'Approved orders not yet received',
      count: data?.approved.count ?? 0,
      total: data?.approved.total ?? 0,
      tint: 'text-brand-500 bg-brand-500/10',
    },
  ]

  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {widgets.map((widget) => (
        <Link key={widget.label} to="/dashboard/purchase-orders" className="card-hover block">
          <AppCard padding="md" className="transition-colors hover:bg-surface-elevated">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption font-medium uppercase tracking-[0.08em] text-text-muted">{widget.label}</p>
                <p className="mt-1 text-label text-text-secondary">{widget.subtitle}</p>
              </div>
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${widget.tint}`}>
                <Receipt size={16} />
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <span className="text-[26px] font-semibold tracking-[-0.03em] text-text-primary">
                {isLoading ? '-' : widget.count}
              </span>
              <span className="text-label font-medium text-text-secondary">{formatCurrency(widget.total)}</span>
            </div>
          </AppCard>
        </Link>
      ))}
    </section>
  )
}
