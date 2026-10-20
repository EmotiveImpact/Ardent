import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'bg-raised text-muted',
        ok: 'bg-ok/10 text-ok',
        warn: 'bg-warn/10 text-warn',
        danger: 'bg-danger/10 text-danger',
        info: 'bg-info/10 text-info',
        ember: 'bg-ember/10 text-ember',
        violet: 'bg-violet/10 text-violet',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { dot?: boolean }

function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** Monospace value chip, as used for settings values in the reference. */
function Chip({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-[5px] bg-raised px-2 font-mono text-[11px] text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Badge, Chip, badgeVariants }
