import { useState } from 'react'
import { Popover } from 'radix-ui'
import { MonitorUp } from 'lucide-react'
import { toast } from 'sonner'
import { canListScreens, inFrame, listScreens, openWall, wallUrl, type WallScreen } from '@/lib/screens'
import { cn } from '@/lib/utils'

/*
 * The Send to screen button, the same in Ardent Core and Ardent HQ. Where the
 * browser can list screens it asks once, then offers each screen by name and
 * size; pick one and the wall opens there, filling it. Elsewhere the wall opens
 * in a new window to drag across.
 */

const FRAME_NOTE = 'Open Ardent in its own tab to send the map to another screen. This preview cannot open windows.'

function opened(result: 'opened' | 'blocked', placed?: WallScreen) {
  if (result === 'blocked') {
    toast.error(inFrame() ? FRAME_NOTE : 'The browser stopped the new window. Allow pop-ups for Ardent, then try again.')
    return
  }
  if (placed) toast(`Map sent to ${placed.label}`, { description: 'Tap Full screen on it to lose the window edges.' })
  else toast('Map opened in a new window', { description: 'Drag it to your other screen, then tap Full screen.' })
}

export function SendToScreen({ path = '/wall', variant = 'bar', className }: { path?: string; variant?: 'bar' | 'icon'; className?: string }) {
  const [screens, setScreens] = useState<WallScreen[]>()
  const [asking, setAsking] = useState(false)
  const url = () => wallUrl(path)

  const start = async () => {
    // Inside a preview frame the screen prompt can hang, and a second tap while the browser asks should still do something.
    if (!canListScreens() || inFrame() || asking) {
      setAsking(false)
      return opened(openWall(url()))
    }
    setAsking(true)
    const list = await listScreens()
    setAsking(false)
    // Refused, or blocked in a preview frame: a new window still works where windows are allowed.
    if (!list.ok) return opened(openWall(url()))
    setScreens(list.screens)
  }
  const pick = (s?: WallScreen) => {
    setScreens(undefined)
    opened(openWall(url(), s), s)
  }

  const label = asking ? 'Allow it in the browser' : 'Send to screen'
  const trigger =
    variant === 'icon' ? (
      <button type="button" aria-label="Send the map to another screen" title="Send to screen" onClick={() => void start()} className={cn('flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground', className)}>
        <MonitorUp className="size-4" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => void start()}
        className={cn('inline-flex h-[38px] shrink-0 items-center gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] text-foreground outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60', className)}
      >
        <MonitorUp className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    )

  return (
    <Popover.Root open={!!screens} onOpenChange={(o) => !o && setScreens(undefined)}>
      <Popover.Anchor asChild>{trigger}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content align="end" side={variant === 'icon' ? 'left' : 'bottom'} sideOffset={8} className="z-[80] w-[min(320px,calc(100vw-32px))] rounded-[14px] bg-surface p-1.5 shadow-[0_30px_80px_rgba(0,0,0,.65)] outline-none">
          <p className="caps px-3 pt-3 pb-2 text-muted">Send the map to</p>
          {screens?.map((s) => (
            <button key={s.id} type="button" onClick={() => pick(s)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-raised focus-visible:bg-raised">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px]">{s.label}</span>
                <span className="font-mono text-[11px] text-muted">
                  {s.width} × {s.height}
                  {s.current ? ' · this screen' : s.primary ? ' · main screen' : ''}
                </span>
              </span>
            </button>
          ))}
          {screens?.length === 1 && <p className="px-3 pt-1 pb-2 text-[12px] text-muted">Only this screen is connected. Plug in another and try again, or open it here.</p>}
          <button type="button" onClick={() => pick()} className="mt-1 flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-[13px] text-muted outline-none transition-colors hover:bg-raised hover:text-foreground focus-visible:bg-raised">
            New window, to drag across
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
