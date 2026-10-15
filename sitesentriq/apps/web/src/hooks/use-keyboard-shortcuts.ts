import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Map current top-level pathname → context-sensitive "new" route used by the `n` shortcut.
 *
 * Keep these in sync with `App.tsx` route definitions.
 */
const NEW_ROUTE_BY_PREFIX: Record<string, string> = {
  '/dashboard/jobs':            '/dashboard/jobs/new',
  '/dashboard/clients':         '/dashboard/clients/new',
  '/dashboard/properties':      '/dashboard/properties/new',
  '/dashboard/assets':          '/dashboard/assets/new',
  '/dashboard/compliance':      '/dashboard/compliance/new',
  '/dashboard/maintenance':     '/dashboard/maintenance/new',
  '/dashboard/quotes':          '/dashboard/quotes/new',
  '/dashboard/invoices':        '/dashboard/invoices/new',
  '/dashboard/actions':         '/dashboard/actions/new',
  '/dashboard/contracts':       '/dashboard/contracts/new',
  '/dashboard/engineers':       '/dashboard/engineers/new',
  '/dashboard/subcontractors':  '/dashboard/subcontractors/new',
  '/dashboard/knowledge-base':  '/dashboard/knowledge-base/new',
}

/** Default fallback when no specific section matches. */
const DEFAULT_NEW_ROUTE = '/dashboard/jobs/new'

/** Returns true when the keyboard event target is an editable input area. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  // Inside a HeroUI form / select that proxies key events
  if (target.getAttribute('role') === 'combobox') return true
  return false
}

/**
 * Resolve the route used when `n` is pressed based on the current pathname.
 */
function resolveNewRoute(pathname: string): string {
  // Find the longest matching prefix (handles e.g. /dashboard/jobs/abc).
  let best = DEFAULT_NEW_ROUTE
  let bestLen = -1
  for (const [prefix, route] of Object.entries(NEW_ROUTE_BY_PREFIX)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (prefix.length > bestLen) {
        best = route
        bestLen = prefix.length
      }
    }
  }
  return best
}

interface UseKeyboardShortcutsOptions {
  /** Open the keyboard help overlay. Triggered by `?`. */
  onOpenHelp: () => void
  /** Open the command palette. Triggered by `/`. (Cmd-K is owned by the palette itself.) */
  onOpenPalette: () => void
}

/**
 * Mount once at the top of an app shell (dashboard or portal layout).
 *
 * Implements:
 *   - `?`        → open keyboard help overlay
 *   - `/`        → focus search (open command palette)
 *   - `g d/j/c/p/i` → 2-key chord navigation (800ms timeout)
 *   - `n`        → context-sensitive "new" entity route
 *   - `r`        → re-fetch all TanStack Query caches on the current page
 *
 * Cmd-K is intentionally left to `CommandPalette` so the two surfaces don't fight.
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Refs keep us robust across renders without re-binding the listener.
  const optionsRef = useRef(options)
  const locationRef = useRef(location)
  const gPendingRef = useRef<number | null>(null)
  const gActiveRef = useRef(false)

  useEffect(() => {
    optionsRef.current = options
    locationRef.current = location
  }, [location, options])

  useEffect(() => {
    const clearG = () => {
      gActiveRef.current = false
      if (gPendingRef.current !== null) {
        window.clearTimeout(gPendingRef.current)
        gPendingRef.current = null
      }
    }

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input — don't hijack typed characters.
      if (isEditableTarget(e.target)) return
      // Ignore non-character/modified keys we don't own.
      if (e.altKey) return

      const key = e.key

      // `?` → help overlay (no modifier)
      if (key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        clearG()
        optionsRef.current.onOpenHelp()
        return
      }

      // Mid-chord: waiting for the second key after `g`.
      if (gActiveRef.current && !e.metaKey && !e.ctrlKey) {
        const k = key.toLowerCase()
        let target: string | null = null
        switch (k) {
          case 'd': target = '/dashboard';            break
          case 'j': target = '/dashboard/jobs';       break
          case 'c': target = '/dashboard/clients';    break
          case 'p': target = '/dashboard/properties'; break
          case 'i': target = '/dashboard/insights';   break
        }
        clearG()
        if (target) {
          e.preventDefault()
          navigate(target)
        }
        return
      }

      // Skip everything below if a modifier other than Shift is held — we don't
      // want to clash with browser/system chords like Cmd-R or Ctrl-N.
      if (e.metaKey || e.ctrlKey) return

      // Begin chord on `g`.
      if (key.toLowerCase() === 'g') {
        e.preventDefault()
        gActiveRef.current = true
        gPendingRef.current = window.setTimeout(clearG, 800)
        return
      }

      // `/` → focus search (open the palette which takes the input focus).
      if (key === '/') {
        e.preventDefault()
        optionsRef.current.onOpenPalette()
        return
      }

      // `n` → context-sensitive new
      if (key.toLowerCase() === 'n') {
        e.preventDefault()
        navigate(resolveNewRoute(locationRef.current.pathname))
        return
      }

      // `r` → refresh all queries on the current page (avoid hijacking Cmd-R).
      if (key.toLowerCase() === 'r') {
        e.preventDefault()
        queryClient.invalidateQueries()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      clearG()
    }
  }, [navigate, queryClient])
}
