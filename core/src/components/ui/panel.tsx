import * as React from 'react'
import { cn } from '@/lib/utils'

/** Outer card. Holds a header row and an inset body well. */
function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="panel"
      className={cn(
        'animate-rise flex min-w-0 flex-col rounded-xl bg-surface/90 p-1.5 shadow-[0_24px_48px_-24px_#000000cc] backdrop-blur-sm transition-colors',
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
    <header data-slot="panel-header" className={cn('flex h-10 items-center gap-2.5 px-2.5', className)}>
      {icon && <span data-slot="panel-icon" className="text-muted [&_svg]:size-4">{icon}</span>}
      <h2 className="caps truncate text-muted">{title}</h2>
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </header>
  )
}

/** Recessed content well inside a panel. */
function Well({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="well" className={cn('rounded-lg bg-inset', className)} {...props} />
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
  return <p className={cn('caps px-1 pt-4 pb-2.5 text-faint', className)} {...props} />
}

export { Panel, PanelHeader, PageHeader, Well, Row, SectionLabel }

/** Screen title in the Michroma voice, with a quiet line above and an optional chip or action. */
function PageHeader({ eyebrow, title, aside }: { eyebrow?: React.ReactNode; title: string; aside?: React.ReactNode }) {
  return (
    <div className="animate-rise flex flex-wrap items-end justify-between gap-3 pt-1 pb-1">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[13px] text-muted">{eyebrow}</p>}
        <h1 data-slot="page-title" className="display-title text-[26px] text-foreground sm:text-[34px]">{title}</h1>
      </div>
      {aside && <div className="flex items-center gap-2">{aside}</div>}
    </div>
  )
}
