import type { ReactNode } from 'react'
import { Button } from '@haumea/ui'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface StepShellProps {
  children: ReactNode
  onBack?: () => void
  onSkipStep?: () => void
  isSubmitting?: boolean
  submitLabel?: string
  /** Override the submit button (for the final step) */
  customSubmit?: ReactNode
  /** Form id so the button can sit inside StepShell while the form is in children */
  formId?: string
}

export function StepShell({
  children,
  onBack,
  onSkipStep,
  isSubmitting,
  submitLabel = 'Continue',
  customSubmit,
  formId,
}: StepShellProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-5">{children}</div>

      <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border-subtle pt-5">
        <div>
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={onBack}
              className="text-text-secondary"
            >
              <ArrowLeft size={14} />
              Back
            </Button>
          ) : (
            <span aria-hidden className="hidden sm:inline-block w-1" />
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          {onSkipStep && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={onSkipStep}
              isDisabled={isSubmitting}
              className="text-text-muted hover:text-text-secondary order-2 sm:order-1"
            >
              Skip this step
            </Button>
          )}

          {customSubmit ?? (
            <Button
              type="submit"
              form={formId}
              variant="primary"
              isDisabled={isSubmitting}
              className="order-1 sm:order-2"
            >
              {isSubmitting ? 'Saving…' : submitLabel}
              {!isSubmitting && <ArrowRight size={14} />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
