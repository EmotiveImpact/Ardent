import { Button } from '@haumea/ui'
import { AppCard, Heading, Text } from '@haumea/ui'
import { Award, FileText, PoundSterling } from 'lucide-react'

import { JOB_STATUSES } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { CertificatePreview } from '@/components/shared/certificate-preview'
import { PartsUsedPanel } from '@/components/stock/parts-used-panel'
import type { JobWithRelations, ServiceReport } from '@haumea/types'

interface JobWithCommercials extends JobWithRelations {
  labor_hours?: number | null
  labor_rate?: number | null
  parts_cost?: number | null
}

export function JobInvoiceTab({
  job,
  profileRole,
  laborHours,
  laborRate,
  partsCost,
  onLaborHoursChange,
  onLaborRateChange,
  onPartsCostChange,
  totalCost,
  onSaveCosts,
  showCertificate,
  onToggleCertificate,
}: {
  job: JobWithCommercials
  profileRole?: string
  laborHours: number
  laborRate: number
  partsCost: number
  onLaborHoursChange: (value: number) => void
  onLaborRateChange: (value: number) => void
  onPartsCostChange: (value: number) => void
  totalCost: number
  onSaveCosts: () => void
  showCertificate: boolean
  onToggleCertificate: () => void
}) {
  return (
    <div className="space-y-5">
      <AppCard>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Heading level={2} scale="body">
              Costs
            </Heading>
            <PoundSterling size={16} className="text-brand-500" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CostInput label="Labour Hours" value={laborHours} onChange={onLaborHoursChange} step="0.5" />
          <CostInput label="Labour Rate (£/hr)" value={laborRate} onChange={onLaborRateChange} step="0.01" />
          <CostInput label="Parts Cost (£)" value={partsCost} onChange={onPartsCostChange} step="0.01" />
          <div>
            <label className="mb-1.5 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Total Cost</label>
            <div className="rounded-lg border border-border-default bg-surface-page px-3 py-2 text-label font-semibold text-text-primary">
              £{totalCost.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="sm" onPress={onSaveCosts}>
            Save Costs
          </Button>
        </div>
      </AppCard>

      <AppCard>
        <Heading level={2} scale="body" className="mb-4">
          Linked invoice
        </Heading>
        <Text scale="caption" tone="muted">
          Invoice links and payment status will appear here once this job has been invoiced.
        </Text>
      </AppCard>

      <AppCard>
        <Heading level={2} scale="body" className="mb-4">
          Service Reports
        </Heading>
        {job.service_reports && job.service_reports.length > 0 ? (
          <ul className="space-y-1">
            {job.service_reports.map((report: ServiceReport, idx: number) => (
              <li
                key={report.id}
                className={`flex items-start justify-between py-3 ${
                  idx < (job.service_reports?.length ?? 0) - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <div>
                  <Text scale="caption" weight="medium">
                    Outcome: {report.outcome || 'N/A'}
                  </Text>
                  <Text scale="caption" tone="muted" className="mt-0.5">
                    {report.notes || 'No notes'}
                  </Text>
                </div>
                <span className="ml-4 shrink-0 text-micro text-text-muted">
                  {report.submitted_at ? formatDate(report.submitted_at) : '-'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <FileText size={28} strokeWidth={1.5} className="mb-2" />
            <Text scale="caption" tone="muted">
              No reports yet
            </Text>
          </div>
        )}
      </AppCard>

      {(job.status === JOB_STATUSES.IN_PROGRESS || job.status === JOB_STATUSES.COMPLETED) ? (
        <PartsUsedPanel jobId={job.id} readOnly={profileRole === 'client_admin' || profileRole === 'auditor'} />
      ) : null}

      {job.status === JOB_STATUSES.COMPLETED && (job.maintenance_plan_id || job.job_type === 'ppm' || job.job_type === 'service') ? (
        <AppCard>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-brand-500" />
              <Heading level={2} scale="body">
                Compliance certificate
              </Heading>
            </div>
            <Button variant="primary" size="sm" onPress={onToggleCertificate}>
              {showCertificate ? 'Hide preview' : 'Generate certificate'}
            </Button>
          </div>
          {showCertificate ? (
            <CertificatePreview jobId={job.id} />
          ) : (
            <Text scale="caption" tone="muted">
              Build a printable Gas Safety / EICR / FRA / generic inspection certificate from this completed job.
            </Text>
          )}
        </AppCard>
      ) : null}
    </div>
  )
}

function CostInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">{label}</label>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 text-label text-text-secondary transition-colors focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </div>
  )
}
