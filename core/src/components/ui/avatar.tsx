import { cn } from '@/lib/utils'

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[10px] font-medium text-foreground',
        className,
      )}
    >
      {initials}
    </span>
  )
}

export { Avatar }
