import { useMemo, useState } from 'react'
import { Tabs } from '@haumea/ui'
import { DashboardSkeleton } from '@/components/shared/skeleton'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { useComplianceStats } from '@/hooks/use-compliance'
import { useJobs } from '@/hooks/use-jobs'
import { useInvoices } from '@/hooks/use-invoices'
import {
  useEngineerWorkload,
  useOverdueVisits,
  useDefectStats,
  useInvoiceAgeing,
  useRevenueByClient,
  useMonthlyRevenue,
  useQuotePipeline,
} from '@/hooks/use-analytics'
import { formatCurrency } from '@haumea/utils'
import type { JobWithRelations, InvoiceWithRelations } from '@haumea/types'
import { PageHeader, Heading, Text } from '@haumea/ui'
import {
  buildDateRangeOptions,
  bucketResolutionTimes,
  computeResolutionStats,
  filterByCreatedSince,
  filterInvoicesByIssueSince,
  formatDurationHours,
  type DateRangeKey,
} from '@/lib/analytics-utils'

const COMPLIANCE_COLORS = ['#059669', '#d97706', '#e11d48', '#f97316']
// Map status → colour by NAME (not by post-filter array index): when a leading
// status has a zero count it's filtered out, which used to shift every later
// slice one colour to the left (an Overdue slice rendered in the calm amber).
const COMPLIANCE_COLOR_BY_NAME: Record<string, string> = {
  Compliant: '#059669',
  'Due Soon': '#d97706',
  Overdue: '#e11d48',
  'Non-Compliant': '#f97316',
}
const JOB_STATUS_COLORS = ['#0891b2', '#d97706', '#059669', '#e11d48', '#6b7280']
// One colour per quote-pipeline stage. useQuotePipeline emits 6 stages
// (Draft, Sent, Approved, Converted, Rejected, Expired) — keep 6 distinct
// colours so the modulo wrap doesn't reuse Draft's/Sent's colour for the tail.
const FUNNEL_COLORS = ['#6b7280', '#0891b2', '#059669', '#7c3aed', '#e11d48', '#d97706']
const BAR_COLORS = ['#0891b2', '#7c3aed', '#059669', '#d97706', '#e11d48', '#f97316', '#6366f1']

const tooltipStyle = {
  backgroundColor: '#111326',
  border: 'none',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
}

const axisTickStyle = { fontSize: 11, fill: '#9ca3af' }

type Tab = 'overview' | 'operational' | 'commercial'

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'operational', label: 'Operational' },
  { key: 'commercial', label: 'Commercial' },
]

function computeJobStatusData(jobs: JobWithRelations[]) {
  const counts: Record<string, number> = {}
  for (const job of jobs) {
    const status = job.status || 'unknown'
    counts[status] = (counts[status] || 0) + 1
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
}

/* ── Stat Card ─────────────────────────────────────────────── */
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4">
      <Text scale="caption" tone="muted" weight="medium" className="uppercase tracking-[0.04em]">{label}</Text>
      <p className={`text-headline font-bold ${color} mt-1 leading-tight`}>{value}</p>
    </div>
  )
}

/* ── Chart Card ────────────────────────────────────────────── */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl">
      <div className="px-5 pt-4 pb-0">
        <Heading level={3} scale="body">{title}</Heading>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-[280px] text-text-muted text-label">
      {text}
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ═════════════════════════════════════════════════════════════ */
function OverviewTab({ rangeStart }: { rangeStart: Date | null }) {
  const { data: complianceStats, isLoading: cl } = useComplianceStats()
  const { data: jobs, isLoading: jl } = useJobs()
  const { data: invoices, isLoading: il } = useInvoices()

  if (cl || jl || il) return <DashboardSkeleton />

  // Compliance is a current-state snapshot — date filtering doesn't
  // really apply, so we leave it unfiltered. Jobs + invoices are
  // event-streams and benefit directly.
  const filteredJobs = filterByCreatedSince(jobs, rangeStart)
  const filteredInvoices = filterInvoicesByIssueSince(invoices, rangeStart)

  const totalRevenue = filteredInvoices.reduce((sum: number, inv: InvoiceWithRelations) => {
    if (inv.status === 'paid') return sum + (inv.total || 0)
    return sum
  }, 0)

  const complianceTotal = complianceStats
    ? complianceStats.compliant + complianceStats.due_soon + complianceStats.overdue + complianceStats.non_compliant
    : 0

  const complianceData = complianceStats
    ? [
        { name: 'Compliant', value: complianceStats.compliant },
        { name: 'Due Soon', value: complianceStats.due_soon },
        { name: 'Overdue', value: complianceStats.overdue },
        { name: 'Non-Compliant', value: complianceStats.non_compliant },
      ].filter(d => d.value > 0)
    : []

  const jobStatusData = computeJobStatusData(filteredJobs)

  const stats = [
    { label: 'Jobs in range', value: filteredJobs.length, color: 'text-metric-teal' },
    { label: 'Invoices in range', value: filteredInvoices.length, color: 'text-metric-green' },
    { label: 'Revenue (paid)', value: formatCurrency(totalRevenue), color: 'text-metric-violet' },
    { label: 'Compliance Items', value: complianceTotal, color: 'text-metric-amber' },
  ]

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Compliance Overview">
          {complianceData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={complianceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    stroke="none"
                  >
                    {complianceData.map((d, i) => (
                      <Cell key={i} fill={COMPLIANCE_COLOR_BY_NAME[d.name] ?? COMPLIANCE_COLORS[i % COMPLIANCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-2">
                {complianceData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COMPLIANCE_COLOR_BY_NAME[d.name] ?? COMPLIANCE_COLORS[i] }} />
                    <Text scale="caption" as="span" tone="muted">{d.name}</Text>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState text="No compliance data available" />
          )}
        </ChartCard>

        <ChartCard title="Jobs by Status">
          {jobStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={jobStatusData}>
                <XAxis dataKey="name" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="Jobs" radius={[4, 4, 0, 0]}>
                  {jobStatusData.map((_, i) => (
                    <Cell key={i} fill={JOB_STATUS_COLORS[i % JOB_STATUS_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No job data available" />
          )}
        </ChartCard>
      </div>
    </>
  )
}

/* ═════════════════════════════════════════════════════════════
   OPERATIONAL TAB
   ═════════════════════════════════════════════════════════════ */
function OperationalTab({ rangeStart }: { rangeStart: Date | null }) {
  const { data: jobs, isLoading: jl } = useJobs()
  const { data: workload, isLoading: wl } = useEngineerWorkload()
  const { data: overdueCount, isLoading: ol } = useOverdueVisits()
  const { data: defects, isLoading: dl } = useDefectStats()

  if (jl || wl || ol || dl) return <DashboardSkeleton />

  const filteredJobs = filterByCreatedSince(jobs, rangeStart)
  const totalJobs = filteredJobs.length
  const completedJobs = filteredJobs.filter((j: JobWithRelations) => j.status === 'completed').length
  const completionRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0

  // Resolution-time stats (mean / median / p90 hours from raise → done)
  // — computed client-side over the filtered jobs so the cards always
  // match the date-range chip the user picked.
  const resolutionStats = computeResolutionStats(filteredJobs)
  const resolutionBuckets = bucketResolutionTimes(filteredJobs)
  const hasBucketData = resolutionBuckets.some((b) => b.count > 0)

  const defectData = defects
    ? [
        { name: 'Raised', value: defects.raised },
        { name: 'Resolved', value: defects.resolved },
      ]
    : []

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Job Completion Rate" value={`${completionRate}%`} color="text-metric-teal" />
        <StatCard label="Median time to fix" value={formatDurationHours(resolutionStats.medianHours)} color="text-metric-green" />
        <StatCard label="p90 time to fix" value={formatDurationHours(resolutionStats.p90Hours)} color="text-metric-amber" />
        <StatCard label="Overdue Visits" value={overdueCount ?? 0} color="text-metric-violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engineer Workload */}
        <ChartCard title="Engineer Workload">
          {(workload?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={workload} layout="vertical">
                <XAxis type="number" allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={axisTickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="jobs" name="Jobs" radius={[0, 4, 4, 0]} fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No engineer assignment data" />
          )}
        </ChartCard>

        {/* Defects Raised vs Resolved */}
        <ChartCard title="Defects Raised vs Resolved">
          {defectData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={defectData}>
                <XAxis dataKey="name" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  <Cell fill="#e11d48" />
                  <Cell fill="#059669" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No defect data available" />
          )}
        </ChartCard>

        {/* Resolution-time distribution — sprint 1.5 analytics depth.
            Histogram of how long jobs took from raise → completed,
            bucketed into 6 humane bands. The mean caption underneath
            gives the same information as a number. */}
        <ChartCard title={`Resolution time distribution (n=${resolutionStats.count})`}>
          {hasBucketData ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={resolutionBuckets}>
                  <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Jobs" radius={[4, 4, 0, 0]} fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
              <Text scale="caption" tone="muted" className="mt-2">
                Mean {formatDurationHours(resolutionStats.meanHours)} ·
                Median {formatDurationHours(resolutionStats.medianHours)} ·
                p90 {formatDurationHours(resolutionStats.p90Hours)}
              </Text>
            </>
          ) : (
            <EmptyState text="No completed jobs in this range" />
          )}
        </ChartCard>
      </div>
    </>
  )
}

/* ═════════════════════════════════════════════════════════════
   COMMERCIAL TAB
   ═════════════════════════════════════════════════════════════ */
// CommercialTab — date range isn't applied here (yet). The pipeline /
// ageing / monthly-revenue hooks are already month-bucketed server-side
// so client-side filtering would be misleading. Keeping the prop off
// the signature for now; revisit once those hooks accept a since arg.
function CommercialTab() {
  const { data: pipeline, isLoading: pl } = useQuotePipeline()
  const { data: ageing, isLoading: al } = useInvoiceAgeing()
  const { data: revenueByClient, isLoading: rl } = useRevenueByClient()
  const { data: monthlyRevenue, isLoading: ml } = useMonthlyRevenue()

  if (pl || al || rl || ml) return <DashboardSkeleton />

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Quotes" value={pipeline?.total ?? 0} color="text-metric-teal" />
        <StatCard label="Conversion Rate" value={`${pipeline?.conversionRate ?? 0}%`} color="text-metric-green" />
        {/* These are sourced from the invoice-AGEING buckets (useInvoiceAgeing),
            which only include PAST-DUE invoices — so label them "Overdue", not
            the broader "Unpaid/Outstanding" (which would also include sent-but-
            not-yet-due receivables the ageing data excludes). */}
        <StatCard
          label="Overdue Invoices"
          value={ageing?.reduce((s, b) => s + b.count, 0) ?? 0}
          color="text-metric-amber"
        />
        <StatCard
          label="Overdue Amount"
          value={formatCurrency(ageing?.reduce((s, b) => s + b.total, 0) ?? 0)}
          color="text-metric-violet"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quote Pipeline Funnel */}
        <ChartCard title="Quote Pipeline">
          {(pipeline?.stages.length ?? 0) > 0 && pipeline?.total ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={pipeline.stages}>
                <XAxis dataKey="stage" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTickStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name="Quotes" radius={[4, 4, 0, 0]}>
                  {pipeline.stages.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No quote data available" />
          )}
        </ChartCard>

        {/* Invoice Ageing */}
        <ChartCard title="Invoice Ageing">
          {(ageing?.length ?? 0) > 0 && ageing?.some(b => b.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ageing}>
                <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                  tick={axisTickStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="total" name="Amount" radius={[4, 4, 0, 0]} fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No unpaid invoices" />
          )}
        </ChartCard>

        {/* Revenue by Client */}
        <ChartCard title="Revenue by Client">
          {(revenueByClient?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueByClient?.slice(0, 8)} layout="vertical">
                <XAxis
                  type="number"
                  tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                  tick={axisTickStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={axisTickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                  {(revenueByClient?.slice(0, 8) ?? []).map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No revenue data available" />
          )}
        </ChartCard>

        {/* Monthly Revenue Trend */}
        <ChartCard title="Monthly Revenue Trend">
          {(monthlyRevenue?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyRevenue}>
                <XAxis dataKey="month" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                  tick={axisTickStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#0891b2"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0891b2', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#0891b2', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No revenue data available" />
          )}
        </ChartCard>
      </div>
    </>
  )
}

/* ═════════════════════════════════════════════════════════════
   MAIN PAGE
   ═════════════════════════════════════════════════════════════ */
export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  // Default 30d — it's the most-asked-about window in FM and small
  // enough that a brand-new org sees something rather than "all-time"
  // fighting with their not-yet-populated database.
  const [rangeKey, setRangeKey] = useState<DateRangeKey>('30d')
  const rangeOptions = useMemo(() => buildDateRangeOptions(), [])
  const rangeStart = rangeOptions.find((o) => o.key === rangeKey)?.startDate ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHeader title="Analytics" />

        {/* Date-range chips. Compliance / pipeline / ageing are
            current-state metrics so the chip applies primarily to
            event streams (jobs, invoices). */}
        <div
          role="radiogroup"
          aria-label="Date range"
          className="inline-flex items-center bg-surface-card border border-border-default rounded-lg p-0.5"
        >
          {rangeOptions.map((opt) => {
            const active = opt.key === rangeKey
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRangeKey(opt.key)}
                className={`px-3 py-1.5 text-caption font-medium rounded-md transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-text-secondary hover:bg-surface-page'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab bar */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as Tab)}
        aria-label="Analytics view"
        className="w-fit"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Analytics view">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.key} id={tab.key}>
                {tab.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab rangeStart={rangeStart} />}
      {activeTab === 'operational' && <OperationalTab rangeStart={rangeStart} />}
      {activeTab === 'commercial' && <CommercialTab />}
    </div>
  )
}
