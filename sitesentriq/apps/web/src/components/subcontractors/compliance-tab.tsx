// Subcontractor Compliance tab (00116, trust wave W2-T5): insurance policies,
// accreditations, and RAMS with approval — the data the dispatch gate
// enforces. The status banner shows EXACTLY what the gate will say.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ShieldCheck, ShieldAlert, Trash2, Check, X, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard, Chip, Button, FormSelectController } from '@haumea/ui'
import { formatDate } from '@haumea/utils'
import { openSubcontractorFile } from '@/lib/subcontractor-files'
import { useAuth } from '@/hooks/use-auth'
import {
  useSubcontractorInsurance,
  useSubcontractorAccreditations,
  useSubcontractorRamsList,
  useSubcontractorComplianceStatus,
  useAddSubcontractorInsurance,
  useDeleteSubcontractorInsurance,
  useAddSubcontractorAccreditation,
  useDeleteSubcontractorAccreditation,
  useAddSubcontractorRams,
  useDecideSubcontractorRams,
  useDeleteSubcontractorRams,
} from '@/hooks/use-subcontractor-compliance'
import {
  POLICY_TYPE_LABEL,
  SCHEME_LABEL,
  describeFailure,
} from '@/lib/subcontractor-compliance'

const inputClass =
  'w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default'
const labelClass = 'block text-caption font-medium text-text-secondary mb-1'

const insuranceSchema = z.object({
  policy_type: z.string().min(1, 'Type is required'),
  insurer: z.string().optional(),
  policy_number: z.string().optional(),
  expiry_date: z.string().min(1, 'Expiry date is required'),
})
type InsuranceForm = z.infer<typeof insuranceSchema>

const accreditationSchema = z.object({
  scheme: z.string().min(1, 'Scheme is required'),
  reference: z.string().optional(),
  expiry_date: z.string().optional(),
})
type AccreditationForm = z.infer<typeof accreditationSchema>

const ramsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  valid_until: z.string().optional(),
})
type RamsForm = z.infer<typeof ramsSchema>

export function SubcontractorComplianceTab({
  subcontractorId,
  organisationId,
}: {
  subcontractorId: string
  organisationId: string
}) {
  const { profile } = useAuth()
  const canDecideRams = ['org_admin', 'super_admin'].includes(profile?.role ?? '')

  const { data: status, isLoading: statusLoading } = useSubcontractorComplianceStatus(subcontractorId)
  const { data: insurance = [] } = useSubcontractorInsurance(subcontractorId)
  const { data: accreditations = [] } = useSubcontractorAccreditations(subcontractorId)
  const { data: rams = [] } = useSubcontractorRamsList(subcontractorId)

  const addInsurance = useAddSubcontractorInsurance()
  const deleteInsurance = useDeleteSubcontractorInsurance()
  const addAccreditation = useAddSubcontractorAccreditation()
  const deleteAccreditation = useDeleteSubcontractorAccreditation()
  const addRams = useAddSubcontractorRams()
  const decideRams = useDecideSubcontractorRams()
  const deleteRams = useDeleteSubcontractorRams()

  const [showInsuranceForm, setShowInsuranceForm] = useState(false)
  const [showAccreditationForm, setShowAccreditationForm] = useState(false)
  const [showRamsForm, setShowRamsForm] = useState(false)

  const insuranceForm = useForm<InsuranceForm>({ resolver: zodResolver(insuranceSchema) })
  const accreditationForm = useForm<AccreditationForm>({ resolver: zodResolver(accreditationSchema) })
  const ramsForm = useForm<RamsForm>({ resolver: zodResolver(ramsSchema) })

  const todayKey = new Date().toLocaleDateString('en-CA')
  const isLapsed = (d: string | null | undefined) => !!d && d < todayKey

  return (
    <div className="space-y-5">
      {/* Status banner — mirrors the dispatch gate verdict */}
      {statusLoading && !status && (
        <AppCard padding="md">
          <div className="h-6 w-64 animate-pulse rounded bg-surface-page" />
        </AppCard>
      )}
      {status && (
        <AppCard padding="md">
          <div className="flex items-start gap-3">
            {status.compliant ? (
              <ShieldCheck size={20} className="text-status-compliant mt-0.5" aria-hidden />
            ) : (
              <ShieldAlert size={20} className="text-status-overdue mt-0.5" aria-hidden />
            )}
            <div>
              <p className="text-label font-semibold text-text-primary">
                {status.compliant
                  ? 'Compliant — can be assigned to jobs'
                  : 'Not compliant — job assignment is blocked'}
              </p>
              {!status.compliant && (
                <ul className="mt-1 space-y-0.5">
                  {status.failures.map((f) => (
                    <li key={f} className="text-caption text-text-secondary">
                      • {describeFailure(f)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </AppCard>
      )}

      {/* Insurance */}
      <AppCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-body font-semibold text-text-primary">Insurance policies</h3>
          <Button variant="outline" size="sm" onPress={() => setShowInsuranceForm((v) => !v)}>
            <Plus size={14} /> Add policy
          </Button>
        </div>
        {showInsuranceForm && (
          <form
            onSubmit={insuranceForm.handleSubmit((values) => {
              addInsurance.mutate(
                {
                  organisation_id: organisationId,
                  subcontractor_id: subcontractorId,
                  policy_type: values.policy_type as never,
                  insurer: values.insurer || null,
                  policy_number: values.policy_number || null,
                  expiry_date: values.expiry_date,
                },
                {
                  onSuccess: () => {
                    insuranceForm.reset()
                    setShowInsuranceForm(false)
                  },
                },
              )
            })}
            className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4"
          >
            <div>
              <label className={labelClass}>
                Type <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={insuranceForm.control}
                name="policy_type"
                ariaLabel="Policy type"
                placeholder="Select type..."
                options={Object.entries(POLICY_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
              {insuranceForm.formState.errors.policy_type && (
                <p className="mt-1 text-micro text-status-overdue">
                  {insuranceForm.formState.errors.policy_type.message}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Insurer</label>
              <input {...insuranceForm.register('insurer')} type="text" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Policy number</label>
              <input {...insuranceForm.register('policy_number')} type="text" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                Expiry <span className="text-status-overdue">*</span>
              </label>
              <input {...insuranceForm.register('expiry_date')} type="date" className={inputClass} />
              {insuranceForm.formState.errors.expiry_date && (
                <p className="mt-1 text-micro text-status-overdue">
                  {insuranceForm.formState.errors.expiry_date.message}
                </p>
              )}
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" variant="primary" size="sm" isDisabled={addInsurance.isPending}>
                {addInsurance.isPending ? 'Saving…' : 'Save policy'}
              </Button>
            </div>
          </form>
        )}
        {insurance.length === 0 ? (
          <p className="text-caption text-text-muted">No insurance policies recorded.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {insurance.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-text-primary">
                    {POLICY_TYPE_LABEL[p.policy_type] ?? p.policy_type}
                    {p.insurer ? <span className="text-text-muted"> · {p.insurer}</span> : null}
                  </p>
                  <p className="text-caption text-text-muted">
                    {p.policy_number ? `#${p.policy_number} · ` : ''}expires {formatDate(p.expiry_date)}
                  </p>
                </div>
                <Chip variant="soft" size="sm" color={isLapsed(p.expiry_date) ? 'danger' : 'success'}>
                  {isLapsed(p.expiry_date) ? 'Lapsed' : 'Current'}
                </Chip>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete policy"
                  onPress={() => deleteInsurance.mutate(p.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {/* Accreditations */}
      <AppCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-body font-semibold text-text-primary">Accreditations</h3>
          <Button variant="outline" size="sm" onPress={() => setShowAccreditationForm((v) => !v)}>
            <Plus size={14} /> Add accreditation
          </Button>
        </div>
        {showAccreditationForm && (
          <form
            onSubmit={accreditationForm.handleSubmit((values) => {
              addAccreditation.mutate(
                {
                  organisation_id: organisationId,
                  subcontractor_id: subcontractorId,
                  scheme: values.scheme as never,
                  reference: values.reference || null,
                  expiry_date: values.expiry_date || null,
                },
                {
                  onSuccess: () => {
                    accreditationForm.reset()
                    setShowAccreditationForm(false)
                  },
                },
              )
            })}
            className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <div>
              <label className={labelClass}>
                Scheme <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={accreditationForm.control}
                name="scheme"
                ariaLabel="Scheme"
                placeholder="Select scheme..."
                options={Object.entries(SCHEME_LABEL).map(([value, label]) => ({ value, label }))}
              />
              {accreditationForm.formState.errors.scheme && (
                <p className="mt-1 text-micro text-status-overdue">
                  {accreditationForm.formState.errors.scheme.message}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Reference</label>
              <input {...accreditationForm.register('reference')} type="text" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Expiry (optional)</label>
              <input {...accreditationForm.register('expiry_date')} type="date" className={inputClass} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" variant="primary" size="sm" isDisabled={addAccreditation.isPending}>
                {addAccreditation.isPending ? 'Saving…' : 'Save accreditation'}
              </Button>
            </div>
          </form>
        )}
        {accreditations.length === 0 ? (
          <p className="text-caption text-text-muted">No accreditations recorded.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {accreditations.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-text-primary">{SCHEME_LABEL[a.scheme] ?? a.scheme}</p>
                  <p className="text-caption text-text-muted">
                    {a.reference ? `${a.reference} · ` : ''}
                    {a.expiry_date ? `expires ${formatDate(a.expiry_date)}` : 'no expiry'}
                  </p>
                </div>
                <Chip variant="soft" size="sm" color={isLapsed(a.expiry_date) ? 'danger' : 'success'}>
                  {isLapsed(a.expiry_date) ? 'Lapsed' : 'Current'}
                </Chip>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete accreditation"
                  onPress={() => deleteAccreditation.mutate(a.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {/* RAMS */}
      <AppCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-body font-semibold text-text-primary">RAMS</h3>
          <Button variant="outline" size="sm" onPress={() => setShowRamsForm((v) => !v)}>
            <Plus size={14} /> Add RAMS
          </Button>
        </div>
        {showRamsForm && (
          <form
            onSubmit={ramsForm.handleSubmit((values) => {
              addRams.mutate(
                {
                  organisation_id: organisationId,
                  subcontractor_id: subcontractorId,
                  title: values.title,
                  valid_until: values.valid_until || null,
                },
                {
                  onSuccess: () => {
                    ramsForm.reset()
                    setShowRamsForm(false)
                  },
                },
              )
            })}
            className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Title <span className="text-status-overdue">*</span>
              </label>
              <input
                {...ramsForm.register('title')}
                type="text"
                className={inputClass}
                placeholder="e.g. Working at height — method statement"
              />
              {ramsForm.formState.errors.title && (
                <p className="mt-1 text-micro text-status-overdue">
                  {ramsForm.formState.errors.title.message}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Valid until (optional)</label>
              <input {...ramsForm.register('valid_until')} type="date" className={inputClass} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" variant="primary" size="sm" isDisabled={addRams.isPending}>
                {addRams.isPending ? 'Saving…' : 'Save RAMS'}
              </Button>
            </div>
          </form>
        )}
        {rams.length === 0 ? (
          <p className="text-caption text-text-muted">
            No RAMS on file. Upload the document itself under Documents, then record it here for
            approval.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rams.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-text-primary">{r.title}</p>
                  <p className="text-caption text-text-muted">
                    {r.valid_until ? `valid until ${formatDate(r.valid_until)}` : 'no end date'}
                    {r.approved_at ? ` · decided ${formatDate(r.approved_at)}` : ''}
                  </p>
                </div>
                <Chip
                  variant="soft"
                  size="sm"
                  color={
                    r.approval_status === 'approved'
                      ? isLapsed(r.valid_until)
                        ? 'danger'
                        : 'success'
                      : r.approval_status === 'rejected'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {r.approval_status === 'approved' && isLapsed(r.valid_until)
                    ? 'Expired'
                    : r.approval_status}
                </Chip>
                {r.subcontractor_documents?.file_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="View RAMS file"
                    onPress={async () => {
                      const ok = await openSubcontractorFile(r.subcontractor_documents?.file_url)
                      if (!ok) toast.error('Could not open this file')
                    }}
                  >
                    <FileText size={14} />
                  </Button>
                )}
                {canDecideRams && r.approval_status === 'pending' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Approve RAMS"
                      isDisabled={decideRams.isPending}
                      onPress={() => decideRams.mutate({ id: r.id, decision: 'approved' })}
                    >
                      <Check size={14} className="text-status-compliant" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Reject RAMS"
                      isDisabled={decideRams.isPending}
                      onPress={() => decideRams.mutate({ id: r.id, decision: 'rejected' })}
                    >
                      <X size={14} className="text-status-overdue" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete RAMS"
                  onPress={() => deleteRams.mutate(r.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  )
}
