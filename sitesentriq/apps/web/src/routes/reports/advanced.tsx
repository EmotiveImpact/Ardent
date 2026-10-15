import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { Button, Chip, Tabs } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader } from '@haumea/ui'
import { ChevronRight, Download, Users, Building2, ShieldCheck } from 'lucide-react'
import { DashboardSkeleton } from '@/components/shared/skeleton'
import { useEngineers } from '@/hooks/use-engineers'
import { useClients } from '@/hooks/use-clients'
import { useEngineerReport, useClientReport, useComplianceTypeReport } from '@/hooks/use-advanced-reports'
import { formatDate, exportToCsv } from '@haumea/utils'
import { COMPLIANCE_TYPES, COMPLIANCE_TYPE_LABELS, JOB_OUTCOMES } from '@/lib/constants'
import { toLocalYmd } from '@/lib/time-tracking/compute'

type Tab = 'engineer' | 'client' | 'compliance'

const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'engineer', label: 'Engineer Reports', icon: Users },
  { key: 'client', label: 'Client Reports', icon: Building2 },
  { key: 'compliance', label: 'Compliance Type', icon: ShieldCheck },
]

function getStartOfYear() {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
}

function getToday() {
  return toLocalYmd(new Date())
}

/* ── Stat Card ──────────────────────────────────────────────── */
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4">
      <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{label}</p>
      <p className={`text-headline font-bold ${color} mt-1 leading-tight`}>{value}</p>
    </div>
  )
}

/* ── Outcome Chip ───────────────────────────────────────────── */
function OutcomeChip({ outcome }: { outcome?: string | null }) {
  if (!outcome) return <span className="text-text-muted">-</span>
  const colorMap: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
    pass: 'success',
    fail: 'danger',
    incomplete: 'warning',
    n_a: 'default',
  }
  return (
    <Chip size="sm" variant="soft" color={colorMap[outcome] || 'default'}>
      {JOB_OUTCOMES[outcome] || outcome}
    </Chip>
  )
}

/* ── Status Chip ────────────────────────────────────────────── */
function StatusChip({ status }: { status: string }) {
  const colorMap: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
    compliant: 'success',
    overdue: 'danger',
    due_soon: 'warning',
    non_compliant: 'danger',
  }
  const labelMap: Record<string, string> = {
    compliant: 'Compliant',
    overdue: 'Overdue',
    due_soon: 'Due Soon',
    non_compliant: 'Non-Compliant',
  }
  return (
    <Chip size="sm" variant="soft" color={colorMap[status] || 'default'}>
      {labelMap[status] || status}
    </Chip>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ENGINEER TAB
   ═══════════════════════════════════════════════════════════════ */
function EngineerTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: engineers, isLoading: el } = useEngineers()
  const [engineerId, setEngineerId] = useState('')

  const { data: report, isLoading: rl } = useEngineerReport({
    engineer_id: engineerId,
    date_from: dateFrom,
    date_to: dateTo,
  })

  if (el) return <DashboardSkeleton />

  const handleExport = () => {
    if (!report?.jobs.length) return
    const rows = report.jobs.map((j: Record<string, unknown>) => ({
      Date: j.scheduled_date ? formatDate(j.scheduled_date as string) : '-',
      Title: j.title as string,
      Property: (j.properties as Record<string, unknown>)?.name || '-',
      Outcome: JOB_OUTCOMES[(j.outcome as string) || ''] || j.outcome || '-',
      'Reactive': j.is_callout ? 'Yes' : 'No',
    }))
    exportToCsv('engineer-report.csv', rows)
  }

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
            Engineer
          </label>
          <FormSelect
            value={engineerId}
            onChange={setEngineerId}
            ariaLabel="Engineer"
            placeholder="Select an engineer..."
            clearable
            options={(engineers || []).map((eng) => ({ value: eng.id, label: eng.name }))}
          />
        </div>
      </div>

      {!engineerId ? (
        <AppCard padding="none" className="p-12 text-center">
          <Users size={40} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
          <p className="text-body text-text-muted">Select an engineer to view their report</p>
        </AppCard>
      ) : rl ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Visits" value={report?.totalVisits ?? 0} color="text-metric-teal" />
            <StatCard label="Pass Rate" value={`${report?.passRate ?? 0}%`} color="text-metric-green" />
            <StatCard label="Fail Rate" value={`${report?.failRate ?? 0}%`} color="text-metric-amber" />
            <StatCard label="Reactive" value={report?.calloutCount ?? 0} color="text-metric-violet" />
          </div>

          {/* Table + Export */}
          <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <h3 className="text-body font-semibold text-text-primary">Job History</h3>
              <Button size="sm" variant="ghost" onPress={handleExport}>
                <Download size={14} className="mr-1" /> Export CSV
              </Button>
            </div>
            {!report?.jobs.length ? (
              <div className="py-12 text-center text-label text-text-muted">No jobs found for this engineer in the selected period</div>
            ) : (
              <div className="overflow-x-auto">
                <table aria-label="Engineer job history" className="w-full text-label">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Job Title</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Outcome</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Reactive</th>
                    </tr></thead>
                    <tbody>
                      {report.jobs.map((job: Record<string, unknown>) => (
                        <tr key={job.id as string} id={job.id as string} className="border-b border-border-subtle hover:bg-surface-page">
                          <td className="px-4 py-3 text-text-secondary">{job.scheduled_date ? formatDate(job.scheduled_date as string) : '-'}</td>
                          <td className="px-4 py-3 font-medium text-text-primary">{job.title as string}</td>
                          <td className="px-4 py-3 text-text-secondary">{(job.properties as Record<string, unknown>)?.name as string || '-'}</td>
                          <td className="px-4 py-3"><OutcomeChip outcome={job.outcome as string} /></td>
                          <td className="px-4 py-3">
                            {job.is_callout ? (
                              <Chip size="sm" variant="soft" color="warning">Reactive</Chip>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CLIENT TAB
   ═══════════════════════════════════════════════════════════════ */
function ClientTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: clients, isLoading: cl } = useClients()
  const [clientId, setClientId] = useState('')

  const { data: report, isLoading: rl } = useClientReport({
    client_id: clientId,
    date_from: dateFrom,
    date_to: dateTo,
  })

  if (cl) return <DashboardSkeleton />

  const handleExport = () => {
    if (!report?.jobs.length) return
    const rows = report.jobs.map((j: Record<string, unknown>) => ({
      Date: j.scheduled_date ? formatDate(j.scheduled_date as string) : '-',
      Title: j.title as string,
      Property: (j.properties as Record<string, unknown>)?.name || '-',
      Outcome: JOB_OUTCOMES[(j.outcome as string) || ''] || j.outcome || '-',
      Engineer: (j.engineer_name as string) || '-',
      Type: j.is_callout ? 'Reactive' : 'Scheduled',
    }))
    exportToCsv('client-report.csv', rows)
  }

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
            Client
          </label>
          <FormSelect
            value={clientId}
            onChange={setClientId}
            ariaLabel="Client"
            placeholder="Select a client..."
            clearable
            options={(clients || []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>

      {!clientId ? (
        <AppCard padding="none" className="p-12 text-center">
          <Building2 size={40} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
          <p className="text-body text-text-muted">Select a client to view their report</p>
        </AppCard>
      ) : rl ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Visits" value={report?.totalVisits ?? 0} color="text-metric-teal" />
            <StatCard label="Compliance Rate" value={`${report?.complianceRate ?? 0}%`} color="text-metric-green" />
            <StatCard label="Reactive" value={report?.calloutCount ?? 0} color="text-metric-amber" />
            <StatCard label="Fails" value={report?.failCount ?? 0} color="text-metric-violet" />
          </div>

          {/* Table + Export */}
          <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <h3 className="text-body font-semibold text-text-primary">Visit History</h3>
              <Button size="sm" variant="ghost" onPress={handleExport}>
                <Download size={14} className="mr-1" /> Export CSV
              </Button>
            </div>
            {!report?.jobs.length ? (
              <div className="py-12 text-center text-label text-text-muted">No jobs found for this client in the selected period</div>
            ) : (
              <div className="overflow-x-auto">
                <table aria-label="Client visit history" className="w-full text-label">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Job Title</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Outcome</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Type</th>
                    </tr></thead>
                    <tbody>
                      {report.jobs.map((job: Record<string, unknown>) => (
                        <tr key={job.id as string} id={job.id as string} className="border-b border-border-subtle hover:bg-surface-page">
                          <td className="px-4 py-3 text-text-secondary">{job.scheduled_date ? formatDate(job.scheduled_date as string) : '-'}</td>
                          <td className="px-4 py-3 font-medium text-text-primary">{job.title as string}</td>
                          <td className="px-4 py-3 text-text-secondary">{(job.properties as Record<string, unknown>)?.name as string || '-'}</td>
                          <td className="px-4 py-3"><OutcomeChip outcome={job.outcome as string} /></td>
                          <td className="px-4 py-3 text-text-secondary">{job.engineer_name as string || '-'}</td>
                          <td className="px-4 py-3">
                            {job.is_callout ? (
                              <Chip size="sm" variant="soft" color="warning">Reactive</Chip>
                            ) : (
                              <Chip size="sm" variant="soft" color="accent">Scheduled</Chip>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   COMPLIANCE TYPE TAB
   ═══════════════════════════════════════════════════════════════ */
function ComplianceTypeTab() {
  const [complianceType, setComplianceType] = useState('')

  const { data: report, isLoading: rl } = useComplianceTypeReport({
    compliance_type: complianceType,
  })

  const complianceOptions = useMemo(
    () => Object.entries(COMPLIANCE_TYPES).map(([, value]) => ({
      key: value,
      label: COMPLIANCE_TYPE_LABELS[value] || value,
    })),
    [],
  )

  const handleExport = () => {
    if (!report?.items.length) return
    const rows = report.items.map((item: Record<string, unknown>) => ({
      Name: item.name as string,
      Property: (item.properties as Record<string, unknown>)?.name || '-',
      'Last Completed': item.last_completed ? formatDate(item.last_completed as string) : '-',
      'Next Due': item.next_due ? formatDate(item.next_due as string) : '-',
      Status: item.status as string,
      Frequency: item.frequency as string,
    }))
    exportToCsv('compliance-type-report.csv', rows)
  }

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
            Compliance Type
          </label>
          <FormSelect
            value={complianceType}
            onChange={setComplianceType}
            ariaLabel="Compliance Type"
            placeholder="Select a compliance type..."
            clearable
            options={complianceOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
          />
        </div>
      </div>

      {!complianceType ? (
        <AppCard padding="none" className="p-12 text-center">
          <ShieldCheck size={40} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
          <p className="text-body text-text-muted">Select a compliance type to view the report</p>
        </AppCard>
      ) : rl ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Items" value={report?.totalItems ?? 0} color="text-metric-teal" />
            <StatCard label="Pass Rate" value={`${report?.passRate ?? 0}%`} color="text-metric-green" />
            <StatCard label="Overdue Count" value={report?.overdueCount ?? 0} color="text-metric-amber" />
            <StatCard label="Avg Frequency (months)" value={report?.avgFrequency ?? 0} color="text-metric-violet" />
          </div>

          {/* Table + Export */}
          <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <h3 className="text-body font-semibold text-text-primary">Compliance Items</h3>
              <Button size="sm" variant="ghost" onPress={handleExport}>
                <Download size={14} className="mr-1" /> Export CSV
              </Button>
            </div>
            {!report?.items.length ? (
              <div className="py-12 text-center text-label text-text-muted">No compliance items found for this type</div>
            ) : (
              <div className="overflow-x-auto">
                <table aria-label="Compliance items" className="w-full text-label">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Last Visit</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Next Due</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Frequency</th>
                    </tr></thead>
                    <tbody>
                      {report.items.map((item: Record<string, unknown>) => (
                        <tr key={item.id as string} id={item.id as string} className="border-b border-border-subtle hover:bg-surface-page">
                          <td className="px-4 py-3 font-medium text-text-primary">{item.name as string}</td>
                          <td className="px-4 py-3 text-text-secondary">{(item.properties as Record<string, unknown>)?.name as string || '-'}</td>
                          <td className="px-4 py-3 text-text-secondary">{item.last_completed ? formatDate(item.last_completed as string) : '-'}</td>
                          <td className="px-4 py-3 text-text-secondary">{item.next_due ? formatDate(item.next_due as string) : '-'}</td>
                          <td className="px-4 py-3"><StatusChip status={item.status as string} /></td>
                          <td className="px-4 py-3 text-text-secondary capitalize">{(item.frequency as string)?.replace('_', ' ') || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function AdvancedReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('engineer')
  const [dateFrom, setDateFrom] = useState(getStartOfYear)
  const [dateTo, setDateTo] = useState(getToday)

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-caption text-text-muted">
        <Link to="/" className="hover:text-text-secondary">Dashboard</Link>
        <ChevronRight size={12} />
        <Link to="/dashboard/reports" className="hover:text-text-secondary">Reports</Link>
        <ChevronRight size={12} />
        <span className="text-text-secondary font-medium">Advanced Reports</span>
      </nav>

      {/* Header */}
      <div>
        <PageHeader title="Advanced Reports" subtitle="Detailed performance and compliance analytics" />
      </div>

      {/* Shared date controls — only the Engineer/Client tabs honour them; the
          Compliance Type report isn't date-filtered, so hide them there rather
          than show controls that silently do nothing. */}
      {activeTab !== 'compliance' && (
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">From</label>
            <input
              type="date"
              className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-label text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">To</label>
            <input
              type="date"
              className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-label text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Tab bar */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as Tab)}
        aria-label="Advanced reports view"
        className="w-fit"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Advanced reports view">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.key} id={tab.key}>
                <span className="inline-flex items-center gap-1.5">
                  <tab.icon size={14} />
                  {tab.label}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {/* Tab content */}
      {activeTab === 'engineer' && <EngineerTab dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'client' && <ClientTab dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'compliance' && <ComplianceTypeTab />}
    </div>
  )
}
