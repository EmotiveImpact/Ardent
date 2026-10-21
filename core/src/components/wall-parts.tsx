import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { goFullScreen } from '@/lib/screens'
import { cn } from '@/lib/utils'

/* The parts both walls share, Core's and HQ's: a big number, and one tap to fill the screen. */

export function useFullScreen() {
  const [full, setFull] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  return full
}

/** One tap to fill the screen; hidden once it does. */
export function FullScreenButton({ full }: { full: boolean }) {
  const [refused, setRefused] = useState(false)
  if (full) return null
  return (
    <button
      type="button"
      onClick={() => void goFullScreen().then((ok) => setRefused(!ok))}
      className="inline-flex h-11 items-center gap-2.5 rounded-[12px] bg-foreground px-4 text-[14px] font-medium text-background shadow-[0_10px_40px_rgba(0,0,0,.6)] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <Maximize2 className="size-4" />
      {refused ? 'Full screen is blocked here. Press F11' : 'Full screen'}
    </button>
  )
}

export function Big({ label, value, unit, tone }: { label: string; value: number; unit?: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <dt className="cap truncate text-[12px] lg:text-[13px]">{label}</dt>
      <dd className={cn('op-number text-[34px] whitespace-nowrap lg:text-[52px]', tone)}>
        {value}
        {unit && <span className="ml-2 font-mono text-[13px] text-muted lg:text-[16px]">{unit}</span>}
      </dd>
    </div>
  )
}
