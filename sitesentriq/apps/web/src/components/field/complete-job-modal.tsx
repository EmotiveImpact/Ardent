/**
 * "Complete with signature" modal for the field engineer flow.
 *
 * Triggered from the sticky bottom stepper after the engineer marks
 * "Work complete". Captures:
 *   - Outcome (pass/fail/incomplete/n_a — already exists per Phase 5)
 *   - Notes
 *   - Customer signature (via FieldSignaturePad)
 *
 * Submits via the parent-supplied `onSubmit` handler which is wired to
 * `useCompleteJobWithSignature` in the host route.
 *
 * Wave 17C — migrated from a bespoke `fixed inset-0` div to HeroUI v3
 * <Modal>. Focus trap + ESC + click-outside-to-close are now free.
 */
import { useEffect, useState } from 'react'
import { Button, Chip, Modal } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import { Camera } from 'lucide-react'
import { JOB_OUTCOMES } from '@/lib/constants'
import FieldSignaturePad, { type CustomerSignaturePayload } from './signature-pad'

export interface CompleteJobSubmission {
  outcome: keyof typeof JOB_OUTCOMES
  notes: string
  signature: CustomerSignaturePayload
}

interface CompleteJobModalProps {
  open: boolean
  onClose: () => void
  jobTitle: string
  photoCount: number
  onSubmit: (data: CompleteJobSubmission) => Promise<void>
  isSubmitting?: boolean
}

const inputCls =
  'w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors'
const labelCls =
  'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

export function CompleteJobModal({
  open,
  onClose,
  jobTitle,
  photoCount,
  onSubmit,
  isSubmitting,
}: CompleteJobModalProps) {
  const [outcome, setOutcome] = useState<keyof typeof JOB_OUTCOMES>('pass')
  const [notes, setNotes] = useState('')

  // The modal stays mounted, so reset the form each time it opens — otherwise
  // the previous job's outcome + notes carry over into the next completion.
  useEffect(() => {
    if (open) {
      setOutcome('pass')
      setNotes('')
    }
  }, [open])

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Complete with signature</Modal.Heading>
            <p className="text-caption text-text-muted mt-0.5">{jobTitle}</p>
          </Modal.Header>
          <Modal.Body className="space-y-5">
            {/* Photos summary */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-page border border-border-subtle">
              <Camera size={14} className="text-text-muted" />
              <p className="text-label text-text-secondary">
                {photoCount === 0
                  ? 'No photos attached. You can still add them after completion.'
                  : `${photoCount} photo${photoCount === 1 ? '' : 's'} attached to this job.`}
              </p>
              {photoCount > 0 && (
                <Chip variant="soft" color="accent" size="sm">
                  {photoCount}
                </Chip>
              )}
            </div>

            {/* Outcome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Outcome</label>
                <FormSelect<keyof typeof JOB_OUTCOMES>
                  value={outcome}
                  onChange={setOutcome}
                  ariaLabel="Outcome"
                  options={Object.entries(JOB_OUTCOMES).map(([value, label]) => ({ value: value as keyof typeof JOB_OUTCOMES, label }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Summary of work, issues found, parts replaced…"
                className={inputCls}
              />
            </div>

            {/* Signature */}
            <FieldSignaturePad
              isSubmitting={isSubmitting}
              title="Customer signature"
              onSubmit={async (signature) => {
                await onSubmit({ outcome, notes, signature })
              }}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={onClose} isDisabled={!!isSubmitting}>
              Cancel
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export default CompleteJobModal
