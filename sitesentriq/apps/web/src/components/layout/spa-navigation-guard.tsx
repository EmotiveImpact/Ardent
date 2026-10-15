import { useEffect } from 'react'
import { useNavigate } from 'react-router'

const INTERNAL_ROUTE_PREFIXES = [
  '/',
  '/about',
  '/auth',
  '/contact',
  '/dashboard',
  '/features',
  '/forgot-password',
  '/invite',
  '/login',
  '/onboarding',
  '/portal',
  '/pricing',
  '/register',
  '/site',
]

function isInternalRoute(pathname: string): boolean {
  return INTERNAL_ROUTE_PREFIXES.some((prefix) => {
    if (prefix === '/') return pathname === '/'
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}

function shouldIgnoreClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented) return true
  if (event.button !== 0) return true
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true
  if (anchor.hasAttribute('download')) return true
  if (anchor.target && anchor.target !== '_self') return true
  return false
}

/**
 * Last-resort SPA guard for internal links. React Router's `<Link>` already
 * prevents document navigations, but invalid legacy patterns such as
 * `<Link><Button /></Link>` can still fall back to browser navigation in some
 * component/event paths. Capturing same-origin route clicks here keeps the
 * app shell mounted while only the routed outlet changes.
 */
export function SpaNavigationGuard() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (shouldIgnoreClick(event, anchor)) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (!isInternalRoute(url.pathname)) return

      const current = window.location
      if (
        url.pathname === current.pathname &&
        url.search === current.search &&
        url.hash &&
        url.hash !== current.hash
      ) {
        return
      }

      event.preventDefault()
      navigate(`${url.pathname}${url.search}${url.hash}`)
    }

    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [navigate])

  return null
}
