import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/*
 * One top bar for every page. A page says what the bar shows with <PageBar>:
 * its trail, its own actions, and whether New or Emergency callout make sense here.
 */

export interface Crumb {
  label: string
  to?: string
}

export interface BarState {
  crumbs?: Crumb[]
  /** New makes no sense on the new job page. */
  noNew?: boolean
  /** Nor Emergency callout on the callout page. */
  noCallout?: boolean
}

interface Shell {
  bar: BarState
  setBar(b: BarState): void
  slot: HTMLElement | null
  setSlot(el: HTMLElement | null): void
  wall: boolean
  setWall(on: boolean): void
}

const Ctx = createContext<Shell | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [bar, setBar] = useState<BarState>({})
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [wall, setWallState] = useState(false)

  const setWall = (on: boolean) => {
    setWallState(on)
    // Full screen as well where the browser allows it; wall mode still works without.
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }

  useEffect(() => {
    if (!wall) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setWallState(false)
    const onFull = () => !document.fullscreenElement && setWallState(false)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [wall])

  return <Ctx.Provider value={{ bar, setBar, slot, setSlot, wall, setWall }}>{children}</Ctx.Provider>
}

export function useShell() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useShell outside ShellProvider')
  return v
}

/** Put this page's trail and actions in the top bar. */
export function PageBar({ crumbs, actions, noNew, noCallout }: BarState & { actions?: ReactNode }) {
  const { setBar, slot } = useShell()
  const key = JSON.stringify([crumbs, noNew, noCallout])
  useEffect(() => {
    setBar({ crumbs, noNew, noCallout })
    return () => setBar({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return actions && slot ? createPortal(actions, slot) : null
}
