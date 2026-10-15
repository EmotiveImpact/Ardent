import type { ReactNode, HTMLAttributes } from 'react'

/**
 * Canonical card primitive for the dashboard.
 *
 * Locks in the visual contract that 200+ bespoke divs and 69 HeroUI
 * `<Card>` overrides used to repeat by hand:
 *   `rounded-xl border border-border-default` + a tone-based surface
 *   colour from the design-system tokens.
 *
 * Deliberately *not* built on HeroUI's `<Card>`. HeroUI v3 ships its
 * own gap/shadow/padding defaults that the existing call-sites had to
 * fight with `!gap-0 !rounded-xl !bg-surface-card !shadow-none …`
 * everywhere. A plain `<div>` lets us own the styling completely.
 *
 * Padding scale matches the rest of the app: `sm` = p-3, `md` = p-5
 * (default), `lg` = p-6, `none` = p-0 (escape-hatch when callers need
 * to manage padding via `header`/`footer` slots or custom layouts).
 */
export type AppCardPadding = 'sm' | 'md' | 'lg' | 'none'
export type AppCardTone = 'default' | 'elevated' | 'subtle'

export interface AppCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode
  /** p-3 / p-5 / p-6 / p-0. Default `'md'`. */
  padding?: AppCardPadding
  /** Surface colour. `default` = surface-card, `elevated` = surface-elevated, `subtle` = surface-page. Default `'default'`. */
  tone?: AppCardTone
  /** Adds hover shadow + cursor-pointer. Default `false`. */
  interactive?: boolean
  /** Optional header slot — rendered with `px-5 pt-4 pb-4` + `border-b border-border-default`. */
  header?: ReactNode
  /** Optional footer slot — rendered with `px-5 pt-4 pb-4` + `border-t border-border-default`. */
  footer?: ReactNode
  /** Escape-hatch for one-off layout tweaks. Appended after the built-in classes so it can override. */
  className?: string
}

const PADDING_CLASS: Record<AppCardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
}

const TONE_CLASS: Record<AppCardTone, string> = {
  default: 'bg-surface-card',
  elevated: 'bg-surface-elevated',
  subtle: 'bg-surface-page',
}

/** Slot wrapper padding — independent of the body padding scale so the
 *  divider lines up cleanly regardless of which `padding` the caller
 *  picked. Always `px-5 py-4` to match the existing `SectionHeader`
 *  convention used by the dashboard panels. */
const SLOT_CLASS = 'px-5 py-4'

export function AppCard({
  children,
  padding = 'md',
  tone = 'default',
  interactive = false,
  header,
  footer,
  className,
  ...rest
}: AppCardProps) {
  const bodyPadding = PADDING_CLASS[padding]

  const baseClasses = [
    'rounded-xl',
    'border',
    'border-border-default',
    TONE_CLASS[tone],
    interactive ? 'cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-border-strong active:translate-y-0 active:scale-[0.99]' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={baseClasses} {...rest}>
      {header ? (
        <div className={`${SLOT_CLASS} border-b border-border-default`}>{header}</div>
      ) : null}
      <div className={bodyPadding}>{children}</div>
      {footer ? (
        <div className={`${SLOT_CLASS} border-t border-border-default`}>{footer}</div>
      ) : null}
    </div>
  )
}
