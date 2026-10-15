/**
 * Resolve a URL on the dashboard app from a path on the marketing site.
 *
 * The marketing site (apps/marketing) and the dashboard app (apps/web) are two
 * separate Vercel deployments on two different origins. Every "Get Started",
 * "Sign In", and pricing CTA on the marketing site has to *cross-origin* into
 * the dashboard's /register or /login route — they cannot use a relative
 * `<Link to="/register">`, because the marketing site has no such route and
 * the SPA fallback just renders a blank screen (this was the v0.21.6 "new
 * users cannot sign up" bug).
 *
 * Resolution order:
 *   1. `VITE_DASHBOARD_URL` env var (set per Vercel environment — preview
 *      branches can point at their own dashboard preview)
 *   2. The current origin's `sitesentriq-web` sibling, when the page is
 *      served from `site-sentriq.vercel.app`
 *   3. Hard-coded production fallback
 *
 * Always returns a fully-qualified URL with no trailing slash before the path.
 */

const PROD_FALLBACK = 'https://sitesentriq-web.vercel.app'

function getDashboardOrigin(): string {
  const fromEnv =
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DASHBOARD_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return PROD_FALLBACK
}

export function appUrl(path: string = '/'): string {
  const origin = getDashboardOrigin()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${origin}${cleanPath}`
}
