// Permit-to-work panel (00121, W3-T10). The DB gate is the enforcement —
// a job flagged requires_permit cannot enter in_progress without an
// issued/active permit; this panel is where the flag is set and permits
// move through requested → issued → active → closed.

import { useState } from 'react'
import { AppCard, Button, Chip, FormSelect, Modal, Switch } from '@haumea/ui'
import { ClipboardCheck, FileBadge } from 'lucide-react'
import { formatDate } from '@haumea/utils'
import { useAuth } from '@/hooks/use-auth'
import { useUpdateJob } from '@/hooks/use-jobs'
import { useJobPermits, useRequestPermit, useUpdatePermit } from '@/hooks/use-permits'
import { useSubcontractorRamsList } from '@/hooks/use-subcontractor-compliance'
import { PERMIT_TYPE_LABELS, type Job, type Permit, type PermitType } from '@haumea/types'

const STATUS_COLOR: Record<Permit['status'], 'default' | 'success' | 'warning' | 'danger'> = {
  requested: 'default',
  issued: 'warning',
  active: 'success',
  closed: 'default',
  cancelled: 'danger',
  rejected: 'danger',
}

const inputClass =
  'w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default'

export function JobPermitsPanel({ job }: { job: Job }) {
  const { profile } = useAuth()
  // Issuing (and flipping the flag) is an office act: admin/scheduler.
  const canIssue = ['org_admin', 'super_admin', 'scheduler'].includes(profile?.role ?? '')

  const { data: permits = [] } = useJobPermits(job.id)
  const requestPermit = useRequestPermit()
  const updatePermit = useUpdatePermit()
  const updateJob = useUpdateJob()
  const { data: ramsList = [] } = useSubcontractorRamsList(job.subcontractor_id ?? undefined)
  const approvedRams = ramsList.filter((r) => r.approval_status === 'approved')

  const [requestOpen, setRequestOpen] = useState(false)
  const [permitType, setPermitType] = useState<PermitType | ''>('')
  const [ramsId, setRamsId] = useState('')

  const [issueTarget, setIssueTarget] = useState<Permit | null>(null)
  const [conditions, setConditions] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')

  const toggleFlag = (next: boolean) => {
    // useUpdateJob toasts success/error generically (incl. the permit-clear
    // gate message), so no local toast here — avoids a double toast.
    updateJob.mutate({ id: job.id, requires_permit: next })
  }

  return (
    <AppCard padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-text-primary inline-flex items-center gap-2">
          <FileBadge size={15} aria-hidden /> Permit to work
        </h3>
        {canIssue && (
          <label className="inline-flex items-center gap-2 text-caption text-text-secondary">
            Requires permit
            <Switch
              isSelected={!!job.requires_permit}
              onChange={() => toggleFlag(!job.requires_permit)}
              size="sm"
              aria-label="Requires permit to work"
            />
          </label>
        )}
      </div>

      {job.requires_permit ? (
        <p className="mb-3 text-caption text-text-muted">
          This job cannot be started until a permit is issued — enforced at the database, not just
          the screen.
        </p>
      ) : (
        <p className="mb-3 text-caption text-text-muted">
          Not flagged as permit-to-work.{canIssue ? ' Toggle above to require a permit before work starts.' : ''}
        </p>
      )}

      {(job.requires_permit || permits.length > 0) && (
        <>
          {permits.length === 0 ? (
            <p className="text-caption text-text-muted">No permits yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {permits.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-label text-text-primary">
                      {PERMIT_TYPE_LABELS[p.permit_type] ?? p.permit_type}
                    </p>
                    <p className="text-caption text-text-muted">
                      {p.valid_from || p.valid_to
                        ? `valid ${p.valid_from ? formatDate(p.valid_from) : '…'} → ${p.valid_to ? formatDate(p.valid_to) : '…'}`
                        : `requested ${formatDate(p.created_at)}`}
                      {p.conditions ? ` · ${p.conditions.slice(0, 60)}${p.conditions.length > 60 ? '…' : ''}` : ''}
                    </p>
                  </div>
                  <Chip variant="soft" size="sm" color={STATUS_COLOR[p.status]}>
                    {p.status}
                  </Chip>
                  {canIssue && p.status === 'requested' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        setIssueTarget(p)
                        setConditions(p.conditions ?? '')
                        setValidFrom('')
                        setValidTo('')
                      }}
                    >
                      Issue
                    </Button>
                  )}
                  {(p.status === 'issued' || p.status === 'active') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      isDisabled={updatePermit.isPending}
                      onPress={() =>
                        updatePermit.mutate({ id: p.id, jobId: job.id, patch: { status: 'closed' } })
                      }
                    >
                      Close
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <Button variant="outline" size="sm" onPress={() => setRequestOpen(true)}>
              <ClipboardCheck size={14} /> Request permit
            </Button>
          </div>
        </>
      )}

      {/* Request modal */}
      <Modal.Backdrop isOpen={requestOpen} onOpenChange={(n) => !n && setRequestOpen(false)}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Request permit</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-caption font-medium text-text-secondary">
                    Permit type <span className="text-status-overdue">*</span>
                  </label>
                  <FormSelect
                    value={permitType}
                    onChange={(v: string) => setPermitType(v as PermitType)}
                    ariaLabel="Permit type"
                    placeholder="Select type..."
                    options={Object.entries(PERMIT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </div>
                {approvedRams.length > 0 && (
                  <div>
                    <label className="mb-1 block text-caption font-medium text-text-secondary">
                      Link approved RAMS (optional)
                    </label>
                    <FormSelect
                      value={ramsId}
                      onChange={setRamsId}
                      ariaLabel="RAMS"
                      placeholder="None"
                      options={[
                        { value: '', label: '— None —' },
                        ...approvedRams.map((r) => ({ value: r.id, label: r.title })),
                      ]}
                    />
                  </div>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" size="sm" onPress={() => setRequestOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!permitType || requestPermit.isPending}
                  onPress={() =>
                    requestPermit.mutate(
                      {
                        jobId: job.id,
                        propertyId: job.property_id,
                        permitType: permitType as PermitType,
                        ramsId: ramsId || null,
                      },
                      {
                        onSuccess: () => {
                          setRequestOpen(false)
                          setPermitType('')
                          setRamsId('')
                        },
                      },
                    )
                  }
                >
                  {requestPermit.isPending ? 'Requesting…' : 'Request'}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Issue modal */}
      <Modal.Backdrop isOpen={!!issueTarget} onOpenChange={(n) => !n && setIssueTarget(null)}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                Issue {issueTarget ? PERMIT_TYPE_LABELS[issueTarget.permit_type] : 'permit'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-3">
                <div>
                  <label htmlFor="permit-conditions" className="mb-1 block text-caption font-medium text-text-secondary">
                    Conditions
                  </label>
                  <textarea
                    id="permit-conditions"
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    rows={3}
                    className={inputClass}
                    placeholder="e.g. Fire watch maintained for 60 minutes after hot works cease"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-caption font-medium text-text-secondary">
                      Valid from
                    </label>
                    <input
                      type="datetime-local"
                      value={validFrom}
                      onChange={(e) => setValidFrom(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-caption font-medium text-text-secondary">
                      Valid to
                    </label>
                    <input
                      type="datetime-local"
                      value={validTo}
                      onChange={(e) => setValidTo(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" size="sm" onPress={() => setIssueTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={updatePermit.isPending}
                  onPress={() =>
                    updatePermit.mutate(
                      {
                        id: issueTarget!.id,
                        jobId: job.id,
                        patch: {
                          status: 'issued',
                          conditions: conditions.trim() || null,
                          valid_from: validFrom ? new Date(validFrom).toISOString() : null,
                          valid_to: validTo ? new Date(validTo).toISOString() : null,
                        },
                      },
                      { onSuccess: () => setIssueTarget(null) },
                    )
                  }
                >
                  {updatePermit.isPending ? 'Issuing…' : 'Issue permit'}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </AppCard>
  )
}
