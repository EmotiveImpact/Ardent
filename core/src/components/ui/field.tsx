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

/**
 * Every text box, number, date and dropdown in Core shares this one look: a dark well, 42px tall,
 * with room inside. Dropdown arrows and date icons are set in index.css so they sit in from the edge.
 */
export const fieldClass =
  'h-[42px] w-full min-w-0 rounded-[10px] bg-inset px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-faint hover:bg-[#0e0e0e] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50'

/** Dropdowns use the same well as text boxes. */
export const selectClass = cn(fieldClass, 'cursor-pointer')
