// Job subcontractor assignment panel (trust wave W2-T5). The jobs table has
// had subcontractor_id since 00003 but NO web surface ever set it — this is
// the first. The 00116 dispatch gate enforces compliance server-side; this
// panel surfaces the verdict inline (badge), and when the gate blocks, offers
// the org-admin override dialog (reason recorded on the job).

import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AppCard, Button, Chip, FormSelect, Modal } from '@haumea/ui'
import { Copy, HardHat, LinkIcon, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@haumea/utils'
import { useAuth } from '@/hooks/use-auth'
import { useUpdateJob } from '@/hooks/use-jobs'
import { useSubcontractors } from '@/hooks/use-subcontractors'
import { useSubcontractorComplianceStatus } from '@/hooks/use-subcontractor-compliance'
import {
  useSubcontractorJobTokens,
  useIssueSubcontractorJobToken,
  useRevokeSubcontractorJobToken,
  buildSubbiePublicUrl,
} from '@/hooks/use-subcontractor-job-token'
import { describeFailure } from '@/lib/subcontractor-compliance'
import type { Job, Subcontractor } from '@haumea/types'

const GATE_ERROR = 'subcontractor_not_compliant'

export function JobSubcontractorPanel({ job }: { job: Job }) {
  const { profile } = useAuth()
  const canOverride = ['org_admin', 'super_admin'].includes(profile?.role ?? '')
  const { data: subcontractors = [] } = useSubcontractors()
  const updateJob = useUpdateJob()
  const { data: workTokens = [] } = useSubcontractorJobTokens(job.id)
  const issueToken = useIssueSubcontractorJobToken()
  const revokeToken = useRevokeSubcontractorJobToken()

  const [selectedId, setSelectedId] = useState<string>(job.subcontractor_id ?? '')
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [blockedFailures, setBlockedFailures] = useState<string[]>([])

  // Live compliance verdict for whichever subbie is selected in the picker.
  const { data: status } = useSubcontractorComplianceStatus(selectedId || undefined)

  const assigned = useMemo(
    () => subcontractors.find((s: Subcontractor) => s.id === job.subcontractor_id),
    [subcontractors, job.subcontractor_id],
  )

  const parseGateFailures = (message: string): string[] => {
    const idx = message.indexOf(`${GATE_ERROR}:`)
    if (idx < 0) return []
    return message
      .slice(idx + GATE_ERROR.length + 1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const assign = (overrideText?: string) => {
    updateJob.mutate(
      {
        id: job.id,
        subcontractor_id: (selectedId || null) as never,
        ...(overrideText ? { subcontractor_override_reason: overrideText } : {}),
      },
      {
        onSuccess: () => {
          // useUpdateJob already toasts success generically — don't double up.
          setOverrideOpen(false)
          setOverrideReason('')
        },
        onError: (err: Error) => {
          const failures = parseGateFailures(err.message ?? '')
          if (failures.length > 0) {
            setBlockedFailures(failures)
            if (canOverride) {
              setOverrideOpen(true)
            } else {
              toast.error('Blocked: subcontractor is not compliant. An org admin can override.')
            }
          } else {
            toast.error(err.message || 'Failed to assign subcontractor')
          }
        },
      },
    )
  }

  return (
    <AppCard padding="md">
      <h3 className="text-body font-semibold text-text-primary mb-3 inline-flex items-center gap-2">
        <HardHat size={15} aria-hidden /> Subcontractor
      </h3>

      {assigned && (
        <p className="text-label text-text-secondary mb-2">
          Assigned:{' '}
          <Link
            to={`/dashboard/subcontractors/${assigned.id}`}
            className="text-brand-600 hover:underline"
          >
            {assigned.company_name}
          </Link>
          {job.subcontractor_override_reason ? (
            <span
              className="ml-2 text-caption text-status-due-soon"
              title={job.subcontractor_override_reason}
            >
              (compliance overridden)
            </span>
          ) : null}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56">
          <FormSelect
            value={selectedId}
            onChange={(v: string) => setSelectedId(v)}
            ariaLabel="Subcontractor"
            placeholder="Select subcontractor..."
            options={[
              { value: '', label: '— None —' },
              ...subcontractors.map((s: Subcontractor) => ({ value: s.id, label: s.company_name })),
            ]}
          />
        </div>
        {selectedId && status && (
          <Chip variant="soft" size="sm" color={status.compliant ? 'success' : 'danger'}>
            <span className="inline-flex items-center gap-1">
              {status.compliant ? (
                <ShieldCheck size={11} aria-hidden />
              ) : (
                <ShieldAlert size={11} aria-hidden />
              )}
              {status.compliant ? 'Compliant' : 'Not compliant'}
            </span>
          </Chip>
        )}
        <Button
          variant="primary"
          size="sm"
          isDisabled={updateJob.isPending || selectedId === (job.subcontractor_id ?? '')}
          onPress={() => assign()}
        >
          {updateJob.isPending ? 'Saving…' : selectedId ? 'Assign' : 'Remove'}
        </Button>
      </div>

      {selectedId && status && !status.compliant && (
        <ul className="mt-2 space-y-0.5">
          {status.failures.map((f) => (
            <li key={f} className="text-caption text-text-muted">
              • {describeFailure(f)}
            </li>
          ))}
        </ul>
      )}

      {/* W2-T7: per-use, no-login work links for the assigned subbie. */}
      {assigned && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
              Work links
            </p>
            <Button
              variant="outline"
              size="sm"
              isDisabled={issueToken.isPending}
              onPress={() =>
                issueToken.mutate(
                  {
                    jobId: job.id,
                    organisationId: job.organisation_id,
                    subcontractorId: assigned.id,
                  },
                  {
                    onSuccess: async (created) => {
                      try {
                        await navigator.clipboard.writeText(created.public_url)
                        toast.success('Work link copied to clipboard')
                      } catch {
                        toast.success('Work link created')
                      }
                    },
                  },
                )
              }
            >
              <LinkIcon size={14} /> {issueToken.isPending ? 'Creating…' : 'Generate work link'}
            </Button>
          </div>
          {workTokens.length > 0 && (
            <ul className="mt-2 space-y-1">
              {workTokens.slice(0, 5).map((wt) => (
                <li key={wt.id} className="flex items-center gap-2">
                  <Chip
                    variant="soft"
                    size="sm"
                    color={
                      wt.status === 'completed'
                        ? 'success'
                        : wt.status === 'revoked'
                          ? 'danger'
                          : wt.status === 'accepted'
                            ? 'warning'
                            : 'default'
                    }
                  >
                    {wt.status}
                  </Chip>
                  <span className="min-w-0 flex-1 truncate text-caption text-text-muted">
                    expires {formatDate(wt.expires_at)} · viewed {wt.view_count}×
                  </span>
                  {(wt.status === 'issued' || wt.status === 'accepted') && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Copy link"
                        onPress={async () => {
                          try {
                            await navigator.clipboard.writeText(buildSubbiePublicUrl(wt.token))
                            toast.success('Link copied')
                          } catch {
                            toast.error('Could not copy')
                          }
                        }}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Revoke link"
                        isDisabled={revokeToken.isPending}
                        onPress={() => revokeToken.mutate(wt.id)}
                      >
                        <X size={14} />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Org-admin override dialog — reason is recorded on the job (00116). */}
      <Modal.Backdrop isOpen={overrideOpen} onOpenChange={(next) => !next && setOverrideOpen(false)}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Override compliance block</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-label text-text-secondary mb-2">
                This subcontractor fails the compliance checks below. Overriding records your name
                and reason on the job.
              </p>
              <ul className="mb-3 space-y-0.5">
                {blockedFailures.map((f) => (
                  <li key={f} className="text-caption text-text-muted">
                    • {describeFailure(f)}
                  </li>
                ))}
              </ul>
              <label htmlFor="subbie-override-reason" className="block text-caption font-medium text-text-secondary mb-1">
                Reason <span className="text-status-overdue">*</span>
              </label>
              <textarea
                id="subbie-override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default"
                placeholder="e.g. Emergency call-out — insurance renewal certificate in hand, awaiting upload"
              />
            </Modal.Body>
            <Modal.Footer>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" size="sm" onPress={() => setOverrideOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!overrideReason.trim() || updateJob.isPending}
                  onPress={() => assign(overrideReason.trim())}
                >
                  Override & assign
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </AppCard>
  )
}
