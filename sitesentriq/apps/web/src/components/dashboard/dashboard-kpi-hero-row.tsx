import { useMemo } from 'react'
import { Link } from 'react-router'
import { Skeleton } from '@haumea/ui'
import { Heading, Text } from '@haumea/ui'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Briefcase,
  ChevronRight,
  Navigation,
  ShieldCheck,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { useEngineerTracker } from '@/hooks/use-engineer-tracker'

function getTimeOfDayGreeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

interface HeroCounters {
  todaysJobs: number
  complianceDue: number
  openActions: number
}

function useHeroCounters() {
  return useQuery<HeroCounters>({
    queryKey: ['dashboard', 'hero-counters'],
    queryFn: async () => {
      // jobs.scheduled_date is timestamptz, so an `.eq(day)` only matched rows
      // stored at exactly UTC midnight — i.e. almost nothing. Match the local
      // day as a [today, tomorrow) range, same as use-todays-visits.
      const now = new Date()
      const today = toLocalYmd(now)
      const tomorrowDate = new Date(now)
      tomorrowDate.setDate(tomorrowDate.getDate() + 1)
      const tomorrow = toLocalYmd(tomorrowDate)
      // allSettled — one failing head-count query shouldn't blank all four
      // hero tiles. Failed slice degrades to 0 with a console warn; the
      // others still show real numbers.
      const settled = await Promise.allSettled([
        supabase.from('jobs').select('id', { count: 'exact', head: true }).gte('scheduled_date', today).lt('scheduled_date', tomorrow),
        supabase.from('compliance_items').select('id', { count: 'exact', head: true }).in('status', ['due_soon', 'overdue']),
        supabase.from('actions').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      ])
      const safeCount = (idx: number, label: string): number => {
        const r = settled[idx]
        if (r.status !== 'fulfilled') {
          console.warn(`[hero-counters] ${label} rejected:`, r.reason)
          return 0
        }
        if (r.value.error) {
          console.warn(`[hero-counters] ${label} errored (continuing):`, r.value.error.message)
          return 0
        }
        return r.value.count ?? 0
      }
      return {
        todaysJobs: safeCount(0, "today's jobs"),
        complianceDue: safeCount(1, 'compliance due'),
        openActions: safeCount(2, 'open actions'),
      }
    },
  })
}

export function DashboardKpiHeroRow({
  greetingName,
  orgName,
}: {
  greetingName: string
  orgName: string
}) {
  const { data, isLoading } = useHeroCounters()
  const { data: trackerRows } = useEngineerTracker()
  const engineerStats = useMemo(() => {
    const rows = trackerRows ?? []
    return {
      travelling: rows.filter((r) => r.movementStatus === 'travelling').length,
      onSite: rows.filter((r) => r.movementStatus === 'on_site').length,
    }
  }, [trackerRows])
  const greeting = useMemo(() => getTimeOfDayGreeting(), [])

  const counters = [
    {
      label: 'jobs today',
      value: data?.todaysJobs ?? 0,
      to: '/dashboard/jobs',
      icon: Briefcase,
      dotColor: 'bg-status-compliant',
      iconBg: 'bg-status-compliant/10',
      iconText: 'text-status-compliant',
    },
    {
      label: 'compliance items due',
      value: data?.complianceDue ?? 0,
      to: '/dashboard/compliance',
      icon: ShieldCheck,
      dotColor: 'bg-status-due-soon',
      iconBg: 'bg-status-due-soon/10',
      iconText: 'text-status-due-soon',
    },
    {
      label: 'open actions',
      value: data?.openActions ?? 0,
      to: '/dashboard/actions',
      icon: AlertTriangle,
      dotColor: 'bg-status-overdue',
      iconBg: 'bg-status-overdue/10',
      iconText: 'text-status-overdue',
    },
    {
      label: `${engineerStats.travelling} en route, ${engineerStats.onSite} on site`,
      value: engineerStats.travelling + engineerStats.onSite,
      to: '/dashboard/engineer-tracker',
      icon: Navigation,
      dotColor: 'bg-metric-teal',
      iconBg: 'bg-metric-teal/10',
      iconText: 'text-metric-teal',
    },
  ]

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-gradient-to-br from-surface-card to-surface-elevated p-6 md:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(700px circle at 8% 0%, rgba(232,119,46,0.12), transparent 55%), radial-gradient(500px circle at 100% 100%, rgba(139,92,246,0.08), transparent 60%)',
        }}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Text as="p" scale="micro" weight="medium" className="uppercase tracking-[0.12em] text-brand-500">
            {orgName}
          </Text>
          <Heading level={1} scale="headline" className="mt-1">
            {greeting}, {greetingName}
          </Heading>
          <Text scale="caption" tone="subtle" className="mt-1">
            Here&apos;s how your operation is running today.
          </Text>
        </div>

        <div className="flex flex-wrap gap-2">
          {counters.map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="group flex items-center gap-2 rounded-xl border border-border-default bg-surface-elevated px-3 py-2 text-text-primary transition-colors hover:border-border-strong hover:bg-surface-card"
            >
              <span className={`grid h-7 w-7 place-items-center rounded-lg ${c.iconBg} ${c.iconText}`}>
                <c.icon size={14} strokeWidth={2.2} />
              </span>
              <span className="leading-none">
                <span className="flex items-center gap-1.5 text-[16px] font-semibold tracking-tight">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dotColor}`} aria-hidden />
                  {isLoading ? <Skeleton className="inline-block h-4 w-6 align-middle" /> : c.value}
                </span>
                <span className="mt-1 block text-micro text-text-muted">{c.label}</span>
              </span>
              <ChevronRight size={14} className="text-text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
