import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Chip } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader } from '@haumea/ui'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Zap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  List,
  LayoutGrid,
  CalendarRange,
} from 'lucide-react'
import { useProperties } from '@/hooks/use-properties'
import { useGeneratedSchedule, useGenerateJobsFromSchedule } from '@/hooks/use-schedule-generation'
import { monthFromISO } from '@/lib/schedule-utils'
import { VISIT_FREQUENCIES, COMPLIANCE_TYPE_LABELS } from '@/lib/constants'
import { formatDate, exportToCsv } from '@haumea/utils'
import { DashboardSkeleton } from '@/components/shared/skeleton'
import { DataTable } from '@/components/shared/data-table'
import type { ScheduledVisit } from '@haumea/types'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function SchedulePage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [propertyId, setPropertyId] = useState('')
  const [view, setView] = useState<'timeline' | 'list'>('timeline')

  const { data: properties } = useProperties()
  const { data: schedule, isLoading } = useGeneratedSchedule(
    propertyId || undefined,
    year,
  )
  const generateJobs = useGenerateJobsFromSchedule()

  // ── Stats ──
  const stats = useMemo(() => {
    const s = { total: 0, completed: 0, upcoming: 0, overdue: 0 }
    for (const v of schedule ?? []) {
      s.total++
      s[v.status]++
    }
    return s
  }, [schedule])

  // ── Timeline data: group visits by label, then bucket by month ──
  const timelineRows = useMemo(() => {
    const map = new Map<string, { label: string; months: Map<number, ScheduledVisit[]> }>()
    for (const v of schedule ?? []) {
      if (!map.has(v.label)) {
        map.set(v.label, { label: v.label, months: new Map() })
      }
      const row = map.get(v.label)!
      // v.date is a date-only 'YYYY-MM-DD' string — use monthFromISO (parses the
      // month directly) rather than new Date().getMonth(), which would roll a
      // first-of-month date back a month in timezones behind UTC.
      const month = monthFromISO(v.date)
      if (!row.months.has(month)) {
        row.months.set(month, [])
      }
      row.months.get(month)!.push(v)
    }
    return Array.from(map.values())
  }, [schedule])

  // ── List view columns ──
  const columns = useMemo<ColumnDef<ScheduledVisit, unknown>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ getValue }) => (
          <span className="text-label text-text-secondary">{formatDate(getValue() as string)}</span>
        ),
      },
      {
        accessorKey: 'label',
        header: 'Item Name',
        cell: ({ getValue }) => (
          <span className="text-label font-medium text-text-secondary">{getValue() as string}</span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const v = row.original
          const typeLabel = v.compliance_item_id ? 'Compliance' : 'Maintenance'
          return <span className="text-label text-text-secondary">{typeLabel}</span>
        },
      },
      {
        accessorKey: 'frequency',
        header: 'Frequency',
        cell: ({ getValue }) => {
          const f = getValue() as string
          const label = VISIT_FREQUENCIES[f]?.label ?? f
          return <span className="text-label text-text-secondary capitalize">{label}</span>
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as ScheduledVisit['status']
          const chipColors: Record<string, ChipColor> = {
            completed: 'success',
            upcoming: 'accent',
            overdue: 'danger',
          }
          const labels: Record<string, string> = {
            completed: 'Completed',
            upcoming: 'Upcoming',
            overdue: 'Overdue',
          }
          return (
            <Chip variant="soft" color={chipColors[status] ?? 'default'} size="sm">
              {labels[status] ?? status}
            </Chip>
          )
        },
      },
      {
        id: 'complianceType',
        header: 'Category',
        cell: ({ row }) => {
          const ct = row.original.compliance_type
          return (
            <span className="text-label text-text-secondary">
              {ct ? COMPLIANCE_TYPE_LABELS[ct] ?? ct : '-'}
            </span>
          )
        },
      },
    ],
    [],
  )

  // ── Handlers ──
  const handleGenerateJobs = () => {
    if (!schedule) return
    generateJobs.mutate(schedule)
  }

  const handleExport = () => {
    if (!schedule?.length) return
    exportToCsv(
      `visit-schedule-${year}.csv`,
      schedule.map((v) => ({
        Date: formatDate(v.date),
        'Item Name': v.label,
        Type: v.compliance_item_id ? 'Compliance' : 'Maintenance',
        Frequency: VISIT_FREQUENCIES[v.frequency]?.label ?? v.frequency,
        Status: v.status,
        Category: v.compliance_type ? COMPLIANCE_TYPE_LABELS[v.compliance_type] ?? v.compliance_type : '',
      })),
    )
  }

  if (isLoading) {
    return (
      <div>
        <DashboardSkeleton />
      </div>
    )
  }

  const statCards = [
    { label: 'Total Visits', count: stats.total, color: 'text-text-primary', icon: CalendarDays },
    { label: 'Completed', count: stats.completed, color: 'text-metric-green', icon: CheckCircle2 },
    { label: 'Upcoming', count: stats.upcoming, color: 'text-metric-teal', icon: Clock },
    { label: 'Overdue', count: stats.overdue, color: 'text-metric-rose', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageHeader title="Visit Schedule" subtitle="Auto-generated visit calendar based on compliance and maintenance frequencies" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-3 py-2 text-label font-medium transition-colors"
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={handleGenerateJobs}
            disabled={generateJobs.isPending || stats.upcoming === 0}
            className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-label font-medium inline-flex items-center gap-2 transition-colors"
          >
            <Zap className="w-4 h-4" />
            {generateJobs.isPending ? 'Generating...' : 'Generate Jobs'}
          </button>
        </div>
      </div>

      {/* ── Year selector + Property filter ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-surface-card border border-border-default rounded-lg">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-2 hover:bg-surface-page rounded-l-lg transition-colors"
            aria-label="Previous year"
          >
            <ChevronLeft size={16} className="text-text-muted" />
          </button>
          <span className="px-3 text-body font-semibold text-text-primary tabular-nums">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-2 hover:bg-surface-page rounded-r-lg transition-colors"
            aria-label="Next year"
          >
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="w-56">
          <FormSelect
            value={propertyId}
            onChange={setPropertyId}
            ariaLabel="Filter by property"
            placeholder="All Properties"
            clearable
            options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center bg-surface-card border border-border-default rounded-lg overflow-hidden">
          <button
            onClick={() => setView('timeline')}
            className={`p-2 transition-colors ${view === 'timeline' ? 'bg-foreground text-background' : 'text-text-muted hover:bg-surface-page'}`}
            aria-label="Timeline view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-2 transition-colors ${view === 'list' ? 'bg-foreground text-background' : 'text-text-muted hover:bg-surface-page'}`}
            aria-label="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <AppCard key={stat.label} padding="md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
                  {stat.label}
                </span>
                <Icon size={16} className="text-text-muted" />
              </div>
              <p className={`text-headline font-bold tracking-[-0.03em] leading-none ${stat.color}`}>
                {stat.count}
              </p>
            </AppCard>
          )
        })}
      </div>

      {/* ── Empty state ── */}
      {(!schedule || schedule.length === 0) && (
        <AppCard padding="md">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <CalendarRange size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No scheduled visits</h2>
            <p className="text-label text-text-muted text-center max-w-md">
              Create compliance items or maintenance plans with frequencies and due dates to auto-generate a visit schedule.
            </p>
          </div>
        </AppCard>
      )}

      {/* ── Timeline View ── */}
      {view === 'timeline' && schedule && schedule.length > 0 && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Month headers */}
              <div className="grid grid-cols-[220px_repeat(12,1fr)] border-b border-border-default">
                <div className="px-4 py-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                  Item
                </div>
                {MONTHS.map((m) => (
                  <div
                    key={m}
                    className="px-2 py-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em] text-center"
                  >
                    {m}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {timelineRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[220px_repeat(12,1fr)] border-b border-border-subtle hover:bg-surface-page transition-colors"
                >
                  <div className="px-4 py-3 text-label font-medium text-text-secondary truncate" title={row.label}>
                    {row.label}
                  </div>
                  {Array.from({ length: 12 }).map((_, monthIdx) => {
                    const visits = row.months.get(monthIdx)
                    return (
                      <div
                        key={monthIdx}
                        className="flex items-center justify-center py-3 gap-1"
                      >
                        {visits?.map((v, i) => (
                          <span
                            key={i}
                            title={`${formatDate(v.date)} — ${v.status}`}
                            className={`w-3 h-3 rounded-full flex-shrink-0 ${
                              v.status === 'completed'
                                ? 'bg-status-compliant'
                                : v.status === 'overdue'
                                  ? 'bg-status-overdue'
                                  : 'bg-metric-teal'
                            }`}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-5 px-4 py-3 border-t border-border-subtle">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-status-compliant" />
                  <span className="text-micro text-text-muted">Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-metric-teal" />
                  <span className="text-micro text-text-muted">Upcoming</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-status-overdue" />
                  <span className="text-micro text-text-muted">Overdue</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── List View ── */}
      {view === 'list' && schedule && schedule.length > 0 && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <DataTable data={schedule} columns={columns} pageSize={15} />
        </div>
      )}
    </div>
  )
}
