/*
 * Send to screen: open the map-only wall in its own window, placed on another
 * screen. Chrome and Edge can list the screens (the Window Management API) once
 * the person allows it; elsewhere, or when they say no, the wall opens in a new
 * window for them to drag across. Nothing here throws: every way it can fail
 * comes back as a plain outcome for the button to say in words.
 */

/** One screen, as the button lists it. */
export interface WallScreen {
  id: string
  label: string
  /** The room a window can take: the screen less any taskbar or dock. */
  left: number
  top: number
  width: number
  height: number
  primary: boolean
  /** The screen this window is on now. */
  current: boolean
}

// The Window Management API is not in TypeScript's DOM types yet.
interface ScreenDetailed {
  label?: string
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
  width: number
  height: number
  isPrimary?: boolean
  isInternal?: boolean
}
interface ScreenDetails {
  screens: ScreenDetailed[]
  currentScreen: ScreenDetailed
}
type WithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> }

/** Inside someone else's page (the published preview): windows and screen lists are often blocked there. */
export function inFrame() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** This browser can list screens. */
export const canListScreens = () => typeof (window as WithScreens).getScreenDetails === 'function'

export type ScreenList = { ok: true; screens: WallScreen[] } | { ok: false; why: 'missing' | 'refused' }

/** Ask for the screens. The browser asks the person the first time. */
export async function listScreens(): Promise<ScreenList> {
  const get = (window as WithScreens).getScreenDetails
  if (typeof get !== 'function') return { ok: false, why: 'missing' }
  try {
    const details = await get.call(window)
    const screens = details.screens.map((s, i) => ({
      id: String(i),
      label: s.label?.trim() || (s.isInternal ? 'Built-in screen' : `Screen ${i + 1}`),
      left: s.availLeft,
      top: s.availTop,
      width: s.availWidth,
      height: s.availHeight,
      primary: !!s.isPrimary,
      current: s === details.currentScreen,
    }))
    return { ok: true, screens }
  } catch {
    return { ok: false, why: 'refused' }
  }
}

/** The wall's address: this same page, on the wall route. */
export function wallUrl(path = '/wall') {
  const u = new URL(window.location.href)
  u.hash = path
  return u.href
}

export const WALL_WINDOW = 'ardent-wall'

/**
 * Open the wall, on a screen when one is given. Comes back 'blocked' when the
 * browser stopped the window (a popup blocker, or a preview frame that allows none).
 */
export function openWall(url: string, screen?: WallScreen): 'opened' | 'blocked' {
  const size = screen ? `left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height}` : 'width=1280,height=800'
  let w: Window | null = null
  try {
    w = window.open(url, WALL_WINDOW, `popup,${size}`)
  } catch {
    w = null
  }
  if (!w) return 'blocked'
  // A wall window already open keeps its place, so move it across as well.
  if (screen) {
    try {
      w.moveTo(screen.left, screen.top)
      w.resizeTo(screen.width, screen.height)
    } catch {
      /* the browser decides; the window is open either way */
    }
  }
  try {
    w.focus()
  } catch {
    /* nothing to focus */
  }
  return 'opened'
}

/** Full screen for the wall, where the browser allows it. */
export async function goFullScreen() {
  try {
    await document.documentElement.requestFullscreen?.()
    return !!document.fullscreenElement
  } catch {
    return false
  }
}
