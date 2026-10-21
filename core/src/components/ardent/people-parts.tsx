import type { ReactNode } from 'react'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/*
 * Small pieces shared by the Diary, Customers and Crew screens.
 * Same rules as parts.tsx: fills and hairlines, never borders.
 */

/** Initials in Michroma on a raised tile, as on the boards. */
export function Monogram({ children, size = 'md', tone, className }: { children: ReactNode; size?: 'md' | 'lg'; tone?: 'warn'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'op-title flex shrink-0 items-center justify-center bg-raised tracking-[.08em]',
        size === 'lg' ? 'size-[84px] rounded-[14px] text-[20px]' : 'size-9 rounded-[8px] text-[10px]',
        tone === 'warn' ? 'text-warn' : 'text-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A dialog laid out the operator way: a cap eyebrow, a title, one line, then the form, its fields sunk into the panel. */
export function FormDialog({ eyebrow, title, line, children, wide }: { eyebrow?: string; title: string; line: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <DialogContent className={cn('p-2', wide ? 'max-w-xl' : 'max-w-lg')}>
      <div className="px-4 pt-4 pb-4">
        {eyebrow && <p className="cap pb-2.5">{eyebrow}</p>}
        <DialogTitle className="op-title text-[17px] font-normal tracking-[.14em]">{title}</DialogTitle>
        <DialogDescription className="mt-2.5 text-[13px] text-muted">{line}</DialogDescription>
      </div>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-4">{children}</div>
    </DialogContent>
  )
}

