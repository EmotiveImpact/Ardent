import * as React from 'react'
import { cn } from '@/lib/utils'

/** Outer card. Holds a header row and an inset body well. */
function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'panel-edge animate-rise flex min-w-0 flex-col rounded-xl border border-line bg-surface/90 p-1.5 shadow-[0_24px_48px_-24px_#000000cc] backdrop-blur-sm transition-colors hover:border-line-strong',
        className,
      )}
      {...props}
    />
  )
}

function PanelHeader({
  icon,
  title,
  actions,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex h-10 items-center gap-2.5 px-2.5', className)}>
      {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      <h2 className="truncate text-[13px] font-medium text-foreground">{title}</h2>
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </header>
  )
}

/** Recessed content well inside a panel. */
function Well({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-line bg-inset', className)} {...props} />
}

/** Label / value row used in detail lists. */
function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4 px-3 text-[13px]', className)}>
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2 text-right">{children}</div>
    </div>
  )
}

function SectionLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('px-1 pt-3 pb-2 text-[12px] uppercase tracking-[0.06em] text-muted', className)} {...props} />
}

export { Panel, PanelHeader, Well, Row, SectionLabel }
