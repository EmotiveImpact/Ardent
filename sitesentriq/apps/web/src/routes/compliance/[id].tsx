import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Chip } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader, Heading, Text } from '@haumea/ui'
import { ArrowLeft, Pencil, Trash2, FileText, CalendarDays, Award, Download, Sparkles } from 'lucide-react'
import {
  useComplianceItem,
  useUpdateComplianceItem,
  useDeleteComplianceItem,
  useComplianceCertificates,
} from '@/hooks/use-compliance'
import { CertificatePreview } from '@/components/shared/certificate-preview'
import { useDocuments, useUploadDocument } from '@/hooks/use-documents'
import { useAuth } from '@/hooks/use-auth'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { COMPLIANCE_STATUSES, COMPLIANCE_TYPE_LABELS, FREQUENCIES } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { generateDatesForFrequency } from '@/lib/schedule-utils'
import { FileUpload } from '@/components/shared/file-upload'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import type { DocumentWithRelations } from '@haumea/types'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  compliant: 'success',
  due_soon: 'warning',
  overdue: 'danger',
  non_compliant: 'danger',
}

const STATUS_LABELS: Record<string, string> = {
  compliant: 'Compliant',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  non_compliant: 'Non-Compliant',
}

function DetailRow({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div>
      <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{label}</dt>
      <dd className="mt-1 text-label text-text-secondary">{value || '-'}</dd>
    </div>
  )
}

export default function ComplianceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, organisation } = useAuth()
  const { data: item, isLoading, error } = useComplianceItem(id!)
  const updateItem = useUpdateComplianceItem()
  const deleteItem = useDeleteComplianceItem()
  const uploadDoc = useUploadDocument()
  const { data: proofDocs } = useDocuments({ compliance_item_id: id })
  const { data: certificates } = useComplianceCertificates(id)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showCertificate, setShowCertificate] = useState(false)
  const freq = item?.frequency as string | undefined
  const currentYear = new Date().getFullYear()
  const seedDate = item?.last_completed || item?.next_due
  const generatedDates = useMemo(() => {
    if (!seedDate || !freq) return []
    return generateDatesForFrequency(seedDate, freq, currentYear)
  }, [seedDate, freq, currentYear])
  const datesByMonth = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const d of generatedDates) {
      // generatedDates are 'YYYY-MM-DD' strings built from LOCAL date parts
      // (schedule-utils toISODate). `new Date(d).getMonth()` would re-parse them
      // as UTC midnight and, in timezones behind UTC, roll back a day — putting
      // e.g. '2026-03-01' in the February column. Parse the month from the
      // string directly, matching how the date was encoded.
      const month = parseInt(d.slice(5, 7), 10) - 1
      if (!map.has(month)) map.set(month, [])
      map.get(month)!.push(d)
    }
    return map
  }, [generatedDates])

  const handleDelete = async () => {
    if (!item) return
    await deleteItem.mutateAsync(item.id)
    navigate('/dashboard/compliance')
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!item) return
    await updateItem.mutateAsync({ id: item.id, status: newStatus })
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/compliance" className="text-caption text-text-muted inline-flex items-center gap-1 hover:text-text-secondary transition-colors">
            <ArrowLeft size={14} />
            Back
          </Link>
          <PageHeader title="Compliance Item Not Found" />
        </div>
        <AppCard padding="md">
          <p className="text-status-overdue text-label">
            {error ? (error as Error).message : 'This compliance item could not be found.'}
          </p>
        </AppCard>
      </div>
    )
  }

  const properties = item.properties as { name: string; address: string } | null
  const assets = item.assets as { name: string } | null
  const status = item.status || 'compliant'

  // AI metadata stamped at creation time. We render a small chip
  // next to the title and a tooltip with the original reasoning.
  const metadata = ((item as Record<string, unknown>).metadata ?? null) as
    | { is_ai_suggested?: boolean; ai_confidence?: number; ai_reasoning?: string }
    | null
  const isAiSuggested = metadata?.is_ai_suggested === true
  const aiConfidencePct =
    typeof metadata?.ai_confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, metadata.ai_confidence)) * 100)
      : null
  const aiTooltip = metadata?.ai_reasoning
    ? `${metadata.ai_reasoning}${aiConfidencePct !== null ? ` (confidence ${aiConfidencePct}%)` : ''}`
    : 'This compliance item was suggested by AI'
  const freqLabel =
    Object.entries(FREQUENCIES).find(([, v]) => v === freq)?.[0]?.replace('_', ' ') || freq

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const today = toLocalYmd(new Date())

  function getVisitStatus(date: string): 'completed' | 'upcoming' | 'overdue' {
    // The schedule is seeded from item.last_completed, so any generated visit on
    // or before the last completion represents a DONE visit — mark it completed
    // (green), not overdue. Without this, every past date rendered as a red
    // "Overdue" chip even on a fully-compliant item, contradicting its status.
    // (A past date AFTER last_completed is a genuinely missed visit → overdue.)
    const lastCompleted = item?.last_completed
    if (lastCompleted && date <= lastCompleted) return 'completed'
    if (date < today) return 'overdue'
    return 'upcoming'
  }

  function visitStatusColor(s: 'completed' | 'upcoming' | 'overdue') {
    switch (s) {
      case 'completed': return 'bg-status-compliant'
      case 'upcoming': return 'bg-brand-500'
      case 'overdue': return 'bg-status-overdue'
    }
  }

  function visitStatusLabel(s: 'completed' | 'upcoming' | 'overdue') {
    switch (s) {
      case 'completed': return 'Completed'
      case 'upcoming': return 'Upcoming'
      case 'overdue': return 'Overdue'
    }
  }

  function visitChipColor(s: 'completed' | 'upcoming' | 'overdue'): 'success' | 'accent' | 'danger' {
    switch (s) {
      case 'completed': return 'success'
      case 'upcoming': return 'accent'
      case 'overdue': return 'danger'
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Compliance', path: '/dashboard/compliance' },
        { label: item.name },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <PageHeader title={item.name} />
            <Chip variant="soft" color={STATUS_CHIP_COLOR[status] ?? 'default'} size="sm">
              {STATUS_LABELS[status] || status}
            </Chip>
            {isAiSuggested && (
              <span title={aiTooltip} className="inline-flex">
                <Chip variant="soft" color="accent" size="sm">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles size={11} />
                    AI assisted
                  </span>
                </Chip>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button disabled className="inline-flex items-center gap-2 border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors disabled:opacity-50">
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <button
            disabled={deleteItem.isPending}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 border border-status-overdue/40 text-status-overdue hover:bg-status-overdue/10 rounded-lg px-4 py-2 text-label font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <ConfirmDialog
            open={confirmOpen}
            title="Delete Compliance Item"
            message={`Delete compliance item "${item.name}"? This cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Details */}
        <AppCard padding="md">
          <h2 className="text-label font-semibold text-text-primary mb-4">Compliance Details</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow label="Type" value={COMPLIANCE_TYPE_LABELS[item.compliance_type] || item.compliance_type} />
            <DetailRow label="Frequency" value={freqLabel?.toLowerCase()} />
            <DetailRow label="Property" value={properties?.name} />
            <DetailRow label="Asset" value={assets?.name} />
            <DetailRow
              label="Last Completed"
              value={item.last_completed ? formatDate(item.last_completed) : undefined}
            />
            <DetailRow
              label="Next Due"
              value={item.next_due ? formatDate(item.next_due) : undefined}
            />
          </dl>
        </AppCard>

        {/* Update Status */}
        <AppCard padding="md">
          <h2 className="text-label font-semibold text-text-primary mb-4">Update Status</h2>
          <div className="space-y-3">
            <FormSelect
              value={status}
              onChange={handleStatusChange}
              disabled={updateItem.isPending}
              ariaLabel="Status"
              options={Object.entries(COMPLIANCE_STATUSES).map(([, value]) => ({ value, label: STATUS_LABELS[value] || value }))}
            />
            {updateItem.isPending && (
              <Text scale="caption" tone="muted">Updating...</Text>
            )}
            {updateItem.isSuccess && (
              <p className="text-caption text-metric-green">Status updated successfully.</p>
            )}
          </div>
        </AppCard>

        {/* Notes */}
        <AppCard padding="md">
          <h2 className="text-label font-semibold text-text-primary mb-4">Notes</h2>
          <p className="text-label text-text-secondary whitespace-pre-wrap">
            {(item as Record<string, unknown>).notes as string || 'No notes for this compliance item.'}
          </p>
        </AppCard>

        {/* Upload Proof */}
        <AppCard padding="md">
          <h2 className="text-label font-semibold text-text-primary mb-4">Proof / Certificates</h2>

          {/* Existing proof documents */}
          {proofDocs && proofDocs.length > 0 && (
            <div className="space-y-2 mb-4">
              {proofDocs.map((doc: DocumentWithRelations) => (
                <div key={doc.id} className="flex items-center gap-3 bg-surface-page rounded-lg px-3 py-2">
                  <FileText size={16} strokeWidth={1.5} className="text-navy-950 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-label font-medium text-text-primary truncate">{doc.name}</p>
                    <Text scale="micro" tone="muted">
                      {doc.uploaded_at ? formatDate(doc.uploaded_at) : ''}
                      {doc.version > 1 ? ` - v${doc.version}` : ''}
                    </Text>
                  </div>
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-caption font-medium text-navy-950 hover:underline shrink-0"
                    >
                      Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <FileUpload
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
            onChange={setProofFile}
            value={proofFile}
            description="Upload proof of compliance such as certificates, inspection reports, or photos."
          />

          {proofFile && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={async () => {
                  if (!proofFile || !organisation?.id || !item) return
                  await uploadDoc.mutateAsync({
                    name: proofFile.name,
                    file: proofFile,
                    organisation_id: organisation.id,
                    property_id: item.property_id,
                    asset_id: item.asset_id || undefined,
                    compliance_item_id: item.id,
                    document_type: 'Certificate',
                    uploaded_by: user?.id,
                  })
                  setProofFile(null)
                }}
                disabled={uploadDoc.isPending}
                className="inline-flex items-center bg-foreground text-background hover:bg-foreground/90 rounded-lg px-4 py-2 text-label font-medium disabled:opacity-50"
              >
                {uploadDoc.isPending ? 'Uploading...' : 'Upload Proof'}
              </button>
            </div>
          )}
        </AppCard>
      </div>

      {/* Certificates (Builder 8B / Wave 8) */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-brand-500" />
            <Heading level={2} scale="body">Certificates</Heading>
            {certificates && certificates.length > 0 ? (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-micro font-medium bg-accent-soft text-accent-soft-foreground">
                {certificates.length}
              </span>
            ) : null}
          </div>
          <button
            onClick={() => setShowCertificate((s) => !s)}
            className="inline-flex items-center gap-1.5 bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3 py-1.5 text-caption font-medium transition-colors"
          >
            <Sparkles size={12} />
            {showCertificate ? 'Hide preview' : 'Generate certificate'}
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {certificates && certificates.length > 0 ? (
            <ul className="space-y-2">
              {certificates.map((cert) => (
                <li
                  key={cert.id}
                  className="flex items-center gap-3 bg-surface-page rounded-lg px-3 py-2"
                >
                  <Award size={16} strokeWidth={1.5} className="text-brand-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-label font-medium text-text-primary truncate">
                      {cert.certificate_number}
                    </p>
                    <Text scale="micro" tone="muted">
                      {cert.test_date ? formatDate(cert.test_date) : 'Recently generated'}
                      {cert.next_due ? ` · next due ${formatDate(cert.next_due)}` : ''}
                    </Text>
                  </div>
                  {cert.signed_url ? (
                    <a
                      href={cert.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-caption font-medium text-brand-500 hover:text-brand-600 shrink-0"
                    >
                      <Download size={12} />
                      Download
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Text scale="caption" tone="muted">
              No certificates generated yet. Click “Generate certificate” to build a printable record from this compliance item.
            </Text>
          )}
          {showCertificate ? (
            <div className="pt-3 border-t border-border-subtle">
              <CertificatePreview complianceItemId={id} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Scheduled Visits */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-brand-500" />
            <Heading level={2} scale="body">Scheduled Visits — {currentYear}</Heading>
          </div>
          <p className="text-caption text-text-muted mt-0.5">
            Auto-generated from <span className="capitalize">{freqLabel}</span> frequency
          </p>
        </div>
        <div className="px-5 py-4">
          {!seedDate ? (
            <p className="text-label text-text-muted">
              Set a last completed date to generate the visit schedule.
            </p>
          ) : generatedDates.length === 0 ? (
            <p className="text-label text-text-muted">
              No visits generated for {currentYear} with the current frequency.
            </p>
          ) : (
            <>
              {/* 12-month grid */}
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                {MONTH_LABELS.map((label, idx) => {
                  const monthDates = datesByMonth.get(idx) || []
                  return (
                    <div key={idx} className="text-center py-2">
                      <Text scale="micro" tone="muted" weight="medium" className="mb-2">{label}</Text>
                      <div className="flex flex-wrap items-center justify-center gap-1 min-h-[16px]">
                        {monthDates.length === 0 ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-surface-page" />
                        ) : (
                          monthDates.map((d) => {
                            const s = getVisitStatus(d)
                            return (
                              <span
                                key={d}
                                title={`${d} — ${visitStatusLabel(s)}`}
                                className={`w-2.5 h-2.5 rounded-full ${visitStatusColor(s)}`}
                              />
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Date list */}
              <div className="mt-4 space-y-0">
                {generatedDates.map((date) => {
                  const s = getVisitStatus(date)
                  return (
                    <div
                      key={date}
                      className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0"
                    >
                      <span className="text-label text-text-secondary">{formatDate(date)}</span>
                      <Chip size="sm" variant="soft" color={visitChipColor(s)}>
                        {visitStatusLabel(s)}
                      </Chip>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
