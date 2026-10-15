import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Button, Card } from '@haumea/ui'

export const ONBOARDING_TOTAL_STEPS = 6

export interface StepDescriptor {
  number: number
  title: string
}

export const STEPS: StepDescriptor[] = [
  { number: 1, title: 'Welcome' },
  { number: 2, title: 'First client' },
  { number: 3, title: 'First property' },
  { number: 4, title: 'First asset' },
  { number: 5, title: 'Compliance item' },
  { number: 6, title: 'Schedule PPM' },
]

interface WizardLayoutProps {
  step: number
  /** Steps that have been skipped — rendered muted, never as "complete" */
  skippedSteps?: number[]
  title: string
  subtitle?: string
  /** Right-side preview content (illustrative) */
  preview: ReactNode
  /** Form / step content (left column) */
  children: ReactNode
  /** Footer "Skip onboarding entirely" action */
  onSkipAll: () => void
  isSkippingAll?: boolean
}

export function WizardLayout({
  step,
  skippedSteps = [],
  title,
  subtitle,
  preview,
  children,
  onSkipAll,
  isSkippingAll,
}: WizardLayoutProps) {
  return (
    <div
      className="min-h-screen relative bg-gradient-to-br from-surface-page via-surface-page to-surface-card"
      data-onboarding-wizard
    >
      {/* Soft brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse at 20% 0%, rgba(232,119,46,0.08) 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(140,60,200,0.05) 0%, transparent 55%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Step indicator */}
        <ProgressIndicator current={step} skipped={skippedSteps} />

        {/* Title block */}
        <div className="mt-8 sm:mt-10 mb-6">
          <p className="text-caption uppercase tracking-[0.18em] text-text-muted font-medium">
            Step {step} of {ONBOARDING_TOTAL_STEPS}
          </p>
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-text-primary tracking-[-0.02em] mt-1.5">
            {title}
          </h1>
          {subtitle && (
            <p className="text-body text-text-secondary mt-2 max-w-2xl">{subtitle}</p>
          )}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)] gap-6 lg:gap-10">
          <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-5 sm:!p-7 shadow-sm">
            {children}
          </Card>

          <aside className="lg:sticky lg:top-8 self-start">
            <div className="bg-surface-elevated border border-border-subtle rounded-xl p-5 sm:p-6">
              {preview}
            </div>
          </aside>
        </div>

        {/* Footer */}
        <div className="mt-8 sm:mt-10 flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onPress={onSkipAll}
            isDisabled={isSkippingAll}
            className="text-text-muted hover:text-text-secondary"
          >
            {isSkippingAll ? 'Skipping…' : 'Skip onboarding entirely'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProgressIndicator({
  current,
  skipped,
}: {
  current: number
  skipped: number[]
}) {
  return (
    <ol
      className="flex items-center gap-2 sm:gap-3"
      aria-label="Onboarding progress"
    >
      {STEPS.map((s, i) => {
        const isComplete = s.number < current && !skipped.includes(s.number)
        const isCurrent = s.number === current
        const isSkipped = skipped.includes(s.number)

        return (
          <li key={s.number} className="flex items-center gap-2 sm:gap-3 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'inline-flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full text-caption font-semibold transition-colors shrink-0',
                  isComplete
                    ? 'bg-brand-500 text-white'
                    : isCurrent
                      ? 'bg-brand-500 text-white ring-4 ring-brand-500/20 animate-status-pulse'
                      : isSkipped
                        ? 'bg-surface-card text-text-muted border border-dashed border-border-default'
                        : 'bg-surface-card text-text-muted border border-border-default',
                ].join(' ')}
              >
                {isComplete ? <Check size={14} strokeWidth={3} /> : s.number}
              </span>
              <span
                className={[
                  'hidden sm:inline text-caption font-medium tracking-tight truncate',
                  isCurrent
                    ? 'text-text-primary'
                    : isComplete
                      ? 'text-text-secondary'
                      : 'text-text-muted',
                ].join(' ')}
              >
                {s.title}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={[
                  'flex-1 h-px',
                  isComplete ? 'bg-brand-500/60' : 'bg-border-default',
                ].join(' ')}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
