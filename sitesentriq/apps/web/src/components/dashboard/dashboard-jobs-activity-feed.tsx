import { Link, useNavigate } from 'react-router'
import { Avatar, Chip, Skeleton } from '@haumea/ui'
import { Activity, ArrowRight, CalendarClock, CheckCircle2, Clock } from 'lucide-react'

import { formatRelativeTime } from '@haumea/utils'
import { useTimelineEvents } from '@/hooks/use-timeline'
import { useTodaysVisits } from '@/hooks/use-todays-visits'
import { SectionHeader } from '@/components/shared/section-header'
import { TimelineEventList } from '@/components/shared/timeline'
import { DashboardEmptyState } from './dashboard-empty-state'
import type { TodaysVisit } from '@/hooks/use-todays-visits'

export function DashboardJobsActivityFeed() {
  const { data, isLoading } = useTodaysVisits()
  const navigate = useNavigate()

  return (
    <section className="rounded-xl border border-border-default bg-surface-card">
      <div className="px-5 pt-5">
        <SectionHeader
          icon={<CalendarClock size={16} />}
          title="Today on Site"
          subtitle={
            data && data.length > 0
              ? `${data.length} scheduled visit${data.length === 1 ? '' : 's'}`
              : 'No visits scheduled'
          }
          action={
            <Link
              to="/dashboard/scheduler"
              className="flex items-center gap-1 text-caption font-medium text-text-accent transition-opacity hover:opacity-80"
            >
              Schedule <ArrowRight size={12} />
            </Link>
          }
        />
      </div>
      <div className="p-5 pt-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <DashboardEmptyState
            icon={<CheckCircle2 size={28} className="text-status-compliant" />}
            title="No site visits today"
            subtitle="Take a breath - your team is on top of it."
          />
        ) : (
          <ul className="space-y-1">
            {data.map((visit) => (
              <li key={visit.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/jobs/${visit.id}`)}
                  className="card-hover -mx-1 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-elevated"
                >
                  <EngineerAvatars engineers={visit.engineers} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label font-medium text-text-primary">{visit.title}</p>
                    <p className="truncate text-micro text-text-muted">
                      {visit.property?.name ?? 'No property'} - {formatTimeWindow(visit.time_start, visit.time_end)}
                    </p>
                  </div>
                  <StatusPill status={visit.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function EngineerAvatars({ engineers }: { engineers: TodaysVisit['engineers'] }) {
  if (!engineers.length) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-elevated text-text-muted">
        <Clock size={14} />
      </span>
    )
  }
  const display = engineers.slice(0, 2)
  return (
    <div className="flex shrink-0 -space-x-2">
      {display.map((e) => {
        const initial = (e.name || '?').charAt(0).toUpperCase()
        return (
          <Avatar key={e.id} size="sm" className="h-9 w-9 bg-brand-500/15 text-brand-500 ring-2 ring-surface-card">
            <Avatar.Fallback>{initial}</Avatar.Fallback>
          </Avatar>
        )
      })}
      {engineers.length > display.length ? (
        <Avatar size="sm" className="h-9 w-9 bg-surface-elevated text-micro text-text-secondary ring-2 ring-surface-card">
          <Avatar.Fallback>+{engineers.length - display.length}</Avatar.Fallback>
        </Avatar>
      ) : null}
    </div>
  )
}

function formatTimeWindow(start: string | null, end: string | null): string {
  if (!start && !end) return 'No time set'
  const fmt = (t: string | null) => (t ? t.slice(0, 5) : '-')
  if (start && end) return `${fmt(start)} - ${fmt(end)}`
  return fmt(start) || fmt(end)
}

function StatusPill({ status }: { status: string }) {
  type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'
  const map: Record<string, { color: ChipColor; label: string }> = {
    scheduled: { color: 'default', label: 'Scheduled' },
    in_progress: { color: 'accent', label: 'In progress' },
    completed: { color: 'success', label: 'Completed' },
    due: { color: 'warning', label: 'Due' },
    failed_access: { color: 'danger', label: 'No access' },
    incomplete: { color: 'warning', label: 'Incomplete' },
    revisit: { color: 'warning', label: 'Revisit' },
    cancelled: { color: 'default', label: 'Cancelled' },
  }
  const cfg = map[status] ?? { color: 'default' as ChipColor, label: status }
  return (
    <span className="shrink-0">
      <Chip variant="soft" color={cfg.color} size="sm">
        {cfg.label}
      </Chip>
    </span>
  )
}

export function DashboardRecentActivityRail() {
  const { data, isLoading } = useTimelineEvents()
  const events = (data ?? []).slice(0, 10)

  return (
    <section className="h-full rounded-xl border border-border-default bg-surface-card">
      <div className="px-5 pt-5">
        <SectionHeader
          icon={<Activity size={16} />}
          title="Recent Activity"
          subtitle={
            isLoading
              ? 'Loading...'
              : events.length
                ? `Last ${events.length} event${events.length === 1 ? '' : 's'}`
                : 'No activity yet'
          }
        />
      </div>
      <div className="p-5 pt-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <DashboardEmptyState
            icon={<Clock size={28} className="text-text-muted" />}
            title="No activity yet"
            subtitle="Updates from across the platform will appear here."
          />
        ) : (
          <TimelineEventList events={events} limit={10} />
        )}
        {events.length > 0 ? (
          <div className="mt-3 border-t border-border-subtle pt-3">
            <p className="text-micro text-text-muted">Updated {formatRelativeTime(events[0].created_at)}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
