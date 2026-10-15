/**
 * Engineer's own timesheet (week view).
 *
 * Wave 12 / Task 107.
 */
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ListSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'
import {
  TIME_ENTRY_KIND_COLOR,
  TIME_ENTRY_KIND_LABELS,
  addDaysIso,
  aggregate,
  entryMinutes,
  formatDuration,
  formatHours,
  groupByDay,
  groupByJob,
  toLocalYmd,
  useEngineerRates,
  useEngineerTimesheet,
  weekStartIso,
  type TimeEntry,
} from '@/lib/time-tracking'

interface RowedEntry extends TimeEntry {
  jobs?: { id: string; title: string } | null
}

function dayLabel(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function TimesheetPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()

  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'super_admin'
  const targetEngineerId = (isAdmin && searchParams.get('engineer')) || profile?.id

  const [weekStart, setWeekStart] = useState<string>(() => weekStartIso(new Date()))

  const { data: entries, isLoading } = useEngineerTimesheet(targetEngineerId ?? undefined, weekStart)
  const { data: rates } = useEngineerRates()

  const { data: viewingProfile } = useQuery({
    queryKey: ['profile', targetEngineerId],
    enabled: !!targetEngineerId && targetEngineerId !== profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', targetEngineerId!)
        .maybeSingle()
      return data as { id: string; full_name: string | null; email: string | null } | null
    },
  })

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  )

  const grouped = useMemo(() => groupByDay((entries ?? []) as TimeEntry[]), [entries])
  const breakdown = useMemo(
    () => aggregate((entries ?? []) as TimeEntry[], { engineerDefaults: rates ?? {} }),
    [entries, rates],
  )

  const dailyTotals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const d of days) {
      out[d] = (grouped[d] ?? []).reduce((sum, e) => sum + entryMinutes(e), 0)
    }
    return out
  }, [days, grouped])

  const drillJobId = searchParams.get('job')
  const drillEntries = useMemo(() => {
    if (!drillJobId || !entries) return null
    const groupedJ = groupByJob(entries as TimeEntry[])
    return groupedJ[drillJobId] ?? []
  }, [drillJobId, entries])

  const headerTitle = viewingProfile
    ? `${viewingProfile.full_name || viewingProfile.email || 'Engineer'} — Timesheet`
    : 'My timesheet'

  const weekLabel = useMemo(() => {
    const start = new Date(weekStart + 'T00:00:00')
    const end = new Date(addDaysIso(weekStart, 6) + 'T00:00:00')
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    return `${fmt(start)} → ${fmt(end)}`
  }, [weekStart])

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: headerTitle },
      ]} />

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <PageHeader title={headerTitle} />
          <p className="text-label text-text-muted">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onPress={() => setWeekStart((w) => addDaysIso(w, -7))}>
            <ChevronLeft size={14} /> Prev
          </Button>
          <Button variant="secondary" size="sm" onPress={() => setWeekStart(weekStartIso(new Date()))}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onPress={() => setWeekStart((w) => addDaysIso(w, 7))}>
            Next <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const mins = dailyTotals[d] ?? 0
          const isToday = d === toLocalYmd(new Date())
          return (
            <div key={d}
              className={`rounded-lg border p-3 ${
                isToday ? 'border-brand-500 bg-brand-500/5' : 'border-border-default bg-surface-card'
              }`}>
              <div className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                {dayLabel(d).split(' ')[0]}
              </div>
              <div className="text-caption text-text-secondary mt-0.5">
                {dayLabel(d).split(' ').slice(1).join(' ')}
              </div>
              <div className={`text-[16px] font-semibold mt-2 ${
                mins > 0 ? 'text-text-primary' : 'text-text-muted'
              }`}>
                {mins > 0 ? formatDuration(mins) : '—'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={formatDuration(breakdown.total_minutes)} />
        <Stat label="Billable" value={`${formatHours(breakdown.billable_minutes)} hrs`} />
        <Stat label="Travel" value={formatDuration(breakdown.travel_minutes)} />
        <Stat label={`Billable @ £${breakdown.billable_total.toFixed(2)}`}
          value={`${formatHours(breakdown.billable_minutes)} hrs`} highlight />
      </div>

      {drillJobId && drillEntries ? (
        <DrilldownPanel jobId={drillJobId} entries={drillEntries} />
      ) : (
        <WeekView days={days} grouped={grouped as Record<string, RowedEntry[]>} isLoading={isLoading} />
      )}
    </div>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-brand-500/5 border border-brand-500/30' : 'bg-surface-page'}`}>
      <div className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">{label}</div>
      <div className={`text-[18px] font-semibold mt-1 ${highlight ? 'text-brand-600' : 'text-text-primary'}`}>{value}</div>
    </div>
  )
}

function WeekView({
  days,
  grouped,
  isLoading,
}: {
  days: string[]
  grouped: Record<string, RowedEntry[]>
  isLoading: boolean
}) {
  if (isLoading) {
    return <ListSkeleton rows={5} />
  }

  const isEmpty = days.every((d) => (grouped[d] ?? []).length === 0)
  if (isEmpty) {
    return (
      <div className="bg-surface-card border border-border-default rounded-xl py-16 flex flex-col items-center justify-center text-text-muted">
        <Calendar size={32} strokeWidth={1.5} className="mb-3" />
        <p className="text-body font-medium text-text-primary">No time logged this week</p>
        <p className="text-caption mt-1">Open a job and start a timer to begin tracking.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
      {days.map((d) => {
        const items = grouped[d] ?? []
        if (items.length === 0) return null
        return (
          <div key={d} className="border-b border-border-subtle last:border-0">
            <div className="px-5 py-2 bg-surface-page">
              <h3 className="text-caption font-semibold text-text-primary uppercase tracking-[0.04em]">
                {dayLabel(d)}
              </h3>
            </div>
            <ul className="divide-y divide-border-subtle">
              {items.map((entry) => (
                <li key={entry.id} className="px-5 py-3 flex items-center gap-4">
                  <div
                    className={`flex-shrink-0 w-1 h-10 rounded-full ${
                      entry.kind === 'travel' ? 'bg-metric-teal' :
                      entry.kind === 'on_site' ? 'bg-status-compliant' :
                      entry.kind === 'admin' ? 'bg-status-due-soon' : 'bg-text-muted'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip variant="soft" size="sm" color={TIME_ENTRY_KIND_COLOR[entry.kind]}>
                        {TIME_ENTRY_KIND_LABELS[entry.kind]}
                      </Chip>
                      {entry.jobs ? (
                        <Link to={`/dashboard/jobs/${entry.job_id}`}
                          className="text-label font-medium text-text-primary hover:text-brand-600 truncate">
                          {entry.jobs.title}
                        </Link>
                      ) : (
                        <span className="text-label font-medium text-text-primary">Job</span>
                      )}
                      {!entry.billable && (
                        <span className="text-[10px] text-text-muted">unbillable</span>
                      )}
                    </div>
                    <div className="text-micro text-text-muted mt-0.5">
                      {shortTime(entry.started_at)} → {entry.ended_at ? shortTime(entry.ended_at) : 'running'}
                      {entry.notes && <span className="ml-2">— {entry.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-label font-semibold text-text-primary">
                      {entry.ended_at ? formatDuration(entry.duration_minutes ?? 0) : (
                        <span className="text-status-due-soon">running</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function DrilldownPanel({ jobId, entries }: { jobId: string; entries: TimeEntry[] }) {
  const total = entries.reduce((sum, e) => sum + entryMinutes(e), 0)
  return (
    <div className="bg-surface-card border border-border-default rounded-xl">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-border-subtle">
        <Clock size={14} className="text-brand-500" />
        <h3 className="text-body font-semibold text-text-primary">Job entries</h3>
        <Link to={`/dashboard/jobs/${jobId}`} className="ml-auto text-caption text-brand-600 hover:underline">
          Open job →
        </Link>
      </div>
      <div className="p-5 space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 p-3 bg-surface-page rounded-lg">
            <Chip variant="soft" size="sm" color={TIME_ENTRY_KIND_COLOR[e.kind]}>
              {TIME_ENTRY_KIND_LABELS[e.kind]}
            </Chip>
            <span className="text-caption text-text-secondary">{new Date(e.started_at).toLocaleString()}</span>
            <span className="text-caption text-text-muted">
              {e.ended_at ? formatDuration(e.duration_minutes ?? 0) : 'running'}
            </span>
            {e.notes && (<span className="text-caption text-text-muted truncate flex-1">— {e.notes}</span>)}
          </div>
        ))}
        <div className="pt-3 border-t border-border-subtle text-right text-label text-text-secondary">
          <span className="text-text-muted mr-2">Job total:</span>
          <span className="font-semibold text-text-primary">{formatDuration(total)}</span>
        </div>
      </div>
    </div>
  )
}
