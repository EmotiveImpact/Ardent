import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** A labelled form control. */
export function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/** Native selects, styled to sit with Input. */
export const selectClass = 'h-9 w-full min-w-0 rounded-md bg-raised px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
