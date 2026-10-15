import { Chip } from '@haumea/ui'
import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, PhoneCall } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActions } from '@/hooks/use-actions'
import { usePortalProperty } from '@/components/layout/portal-layout'
import { formatDate } from '@haumea/utils'
import { TableSkeleton } from '@/components/shared/skeletons'
import type { ActionWithRelations, JobWithRelations } from '@haumea/types'
import { PageHeader } from '@haumea/ui'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  open: 'accent',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'default',
}

const PRIORITY_CHIP_COLOR: Record<string, ChipColor> = {
  low: 'default',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
}

export default function PortalActionsPage() {
  const { selectedPropertyId } = usePortalProperty()
  const [searchParams, setSearchParams] = useSearchParams()
  const newJobId = searchParams.get('new')

  const openFilters: { status?: string; property_id?: string } = { status: 'open' }
  if (selectedPropertyId) {
    openFilters.property_id = selectedPropertyId
  }
  const { data: openActions, isLoading: openLoading } = useActions(openFilters)

  const ipFilters: { status?: string; property_id?: string } = { status: 'in_progress' }
  if (selectedPropertyId) {
    ipFilters.property_id = selectedPropertyId
  }
  const { data: inProgressActions, isLoading: ipLoading } = useActions(ipFilters)

  // Open portal call-outs (jobs raised from the portal that are still pending triage)
  const { data: portalCallouts, isLoading: calloutsLoading } = useQuery({
    queryKey: ['portal-callouts', { selectedPropertyId }],
    queryFn: async () => {
      let q = supabase
        .from('jobs')
        .select('*, properties(name, address)')
        .eq('is_callout', true)
        .eq('created_via', 'portal')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
      if (selectedPropertyId) q = q.eq('property_id', selectedPropertyId)
      const { data, error } = await q
      if (error) throw error
      return data as JobWithRelations[]
    },
  })

  const isLoading = openLoading || ipLoading || calloutsLoading
  const allActions = [...(openActions ?? []), ...(inProgressActions ?? [])]

  // Auto-clear the highlight query param after a few seconds so the URL is clean
  useEffect(() => {
    if (!newJobId) return
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }, 6000)
    return () => clearTimeout(t)
  }, [newJobId, searchParams, setSearchParams])

  const calloutCount = useMemo(() => portalCallouts?.length ?? 0, [portalCallouts])

  if (isLoading) {
    return <TableSkeleton cols={4} rows={5} />
  }

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Open Actions" />
        <p className="text-label text-text-muted mt-0.5">
          Actions and defects requiring attention
          {selectedPropertyId ? ' for the selected property' : ' across all your sites'}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4">
          <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Open</p>
          <p className="text-headline font-bold text-brand-600 mt-1 leading-tight">
            {openActions?.length ?? 0}
          </p>
        </div>
        <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4">
          <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">In Progress</p>
          <p className="text-headline font-bold text-metric-amber mt-1 leading-tight">
            {inProgressActions?.length ?? 0}
          </p>
        </div>
        <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4">
          <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Open call-outs</p>
          <p className="text-headline font-bold text-status-overdue mt-1 leading-tight">{calloutCount}</p>
        </div>
      </div>

      {/* Open portal call-outs */}
      {portalCallouts && portalCallouts.length > 0 && (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
            <h2 className="text-body font-semibold text-text-primary flex items-center gap-2">
              <PhoneCall size={14} className="text-brand-500" />
              Your call-outs
            </h2>
            <span className="text-micro text-text-muted">Raised from the portal</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {portalCallouts.map((cb) => {
              const highlight = newJobId && newJobId === cb.id
              const priorityChipColor: ChipColor =
                cb.priority === 'urgent' || cb.priority === 'high'
                  ? 'danger'
                  : cb.priority === 'medium'
                    ? 'warning'
                    : 'default'
              return (
                <li
                  key={cb.id}
                  className={`px-5 py-3 flex items-center justify-between gap-3 ${
                    highlight ? 'bg-brand-500/5 ring-1 ring-brand-500/40' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-label font-medium text-text-primary truncate">
                      {cb.title}
                      {highlight && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-500 text-white align-middle">
                          NEW
                        </span>
                      )}
                    </p>
                    <p className="text-caption text-text-muted truncate">
                      {cb.properties?.name ?? '—'} · ref #{cb.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Chip variant="soft" color={priorityChipColor} size="sm" className="capitalize">
                      {cb.priority}
                    </Chip>
                    <Chip variant="soft" color="default" size="sm" className="capitalize">
                      {cb.status.replace(/_/g, ' ')}
                    </Chip>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {allActions.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <AlertTriangle size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label text-text-muted">No open actions</p>
            <p className="text-micro text-text-muted mt-1">
              All actions for your properties have been resolved
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <table aria-label="Actions" className="overflow-hidden">
              <thead><tr>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Priority</th>
                <th id="dueDate" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Due Date</th>
              </tr></thead>
              <tbody>
                {allActions.map((action: ActionWithRelations) => (
                  <tr key={action.id} id={action.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                    <td className="py-3 px-4">
                      <p className="text-label font-medium text-text-primary">{action.title}</p>
                      {action.description && (
                        <p className="text-caption text-text-muted mt-0.5 truncate max-w-[300px]">{action.description}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{action.properties?.name || '-'}</td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={STATUS_CHIP_COLOR[action.status] ?? 'default'} size="sm" className="capitalize">
                        {action.status.replace(/_/g, ' ')}
                      </Chip>
                    </td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={PRIORITY_CHIP_COLOR[action.priority] ?? 'default'} size="sm" className="capitalize">
                        {action.priority}
                      </Chip>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">
                      {action.due_date ? formatDate(action.due_date) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
