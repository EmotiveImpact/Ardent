import { cn } from '@/lib/utils'

/** The Ardent A on a dark tile. Quiet on purpose: the screen's one ember thing belongs to the work. */
export function ArdentMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex size-9 items-center justify-center rounded-[10px] bg-surface', className)}>
      <svg viewBox="0 0 32 32" className="size-[18px]" aria-hidden>
        <path d="M16 6 6 25h4.6L16 14.4 21.4 25H26L16 6Z" fill="var(--fg)" />
      </svg>
      <span className="sr-only">Ardent Core</span>
    </span>
  )
}
