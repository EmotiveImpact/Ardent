import { cn } from '@/lib/utils'

export function ArdentMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex size-8 items-center justify-center rounded-lg bg-foreground', className)}>
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
        <path d="M16 6 6 25h4.6L16 14.4 21.4 25H26L16 6Z" fill="#0a0a0a" />
        <path d="M13 22.4h6L16 16.6z" fill="var(--ember)" />
      </svg>
      <span className="sr-only">Ardent Core</span>
    </span>
  )
}
