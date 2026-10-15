import { Check } from 'lucide-react'

interface StepIndicatorProps {
  steps: { key: string; label: string }[]
  currentIndex: number
  /** Optional: which steps are reachable (back navigation). Default = all <= currentIndex. */
  reachable?: (index: number) => boolean
  onStepClick?: (index: number) => void
}

export function StepIndicator({
  steps,
  currentIndex,
  reachable,
  onStepClick,
}: StepIndicatorProps) {
  const canReach = reachable ?? ((i: number) => i < currentIndex)
  return (
    <ol className="flex items-center gap-2" aria-label="Import progress">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex
        const isComplete = i < currentIndex
        const reachableNow = canReach(i)
        return (
          <li key={step.key} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!reachableNow && !isCurrent}
              onClick={() => onStepClick?.(i)}
              className={[
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-caption font-medium transition-colors',
                isCurrent
                  ? 'bg-brand-500 text-white'
                  : isComplete
                  ? 'bg-status-compliant/10 text-status-compliant hover:bg-status-compliant/15'
                  : 'bg-surface-elevated text-text-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  isCurrent
                    ? 'bg-white/20 text-white'
                    : isComplete
                    ? 'bg-status-compliant text-white'
                    : 'bg-surface-card text-text-muted',
                ].join(' ')}
              >
                {isComplete ? <Check size={12} /> : i + 1}
              </span>
              <span>{step.label}</span>
            </button>
            {i < steps.length - 1 && <span className="text-text-muted">/</span>}
          </li>
        )
      })}
    </ol>
  )
}
