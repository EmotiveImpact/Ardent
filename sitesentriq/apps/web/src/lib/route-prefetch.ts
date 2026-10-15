/**
 * Route prefetcher. Maps dashboard paths to a function that triggers
 * the lazy import for that route's chunk so the browser fetches it
 * eagerly on hover/focus. Idempotent — Vite/browsers will dedupe the
 * fetch via the import cache.
 *
 * Keep this list aligned with App.tsx.
 */

type PrefetchFn = () => Promise<unknown>

const prefetchMap: Record<string, PrefetchFn> = {
  '/dashboard': () => import('@/routes/dashboard/index'),

  '/dashboard/clients': () => import('@/routes/clients/index'),
  '/dashboard/clients/new': () => import('@/routes/clients/new'),

  '/dashboard/properties': () => import('@/routes/properties/index'),
  '/dashboard/properties/new': () => import('@/routes/properties/new'),

  '/dashboard/assets': () => import('@/routes/assets/index'),
  '/dashboard/assets/new': () => import('@/routes/assets/new'),

  '/dashboard/compliance': () => import('@/routes/compliance/index'),
  '/dashboard/compliance/new': () => import('@/routes/compliance/new'),

  '/dashboard/maintenance': () => import('@/routes/maintenance/index'),
  '/dashboard/maintenance/new': () => import('@/routes/maintenance/new'),

  '/dashboard/scheduler': () => import('@/routes/scheduler/index'),
  '/dashboard/schedule': () => import('@/routes/schedule/index'),
  '/dashboard/field': () => import('@/routes/field/index'),
  '/dashboard/engineer-tracker': () => import('@/routes/engineer-tracker/index'),

  '/dashboard/jobs': () => import('@/routes/jobs/index'),
  '/dashboard/jobs/new': () => import('@/routes/jobs/new'),

  '/dashboard/reports': () => import('@/routes/reports/index'),

  '/dashboard/documents': () => import('@/routes/documents/index'),
  '/dashboard/analytics': () => import('@/routes/analytics/index'),
  '/dashboard/insights': () => import('@/routes/insights/index'),

  '/dashboard/quotes': () => import('@/routes/quotes/index'),
  '/dashboard/quotes/new': () => import('@/routes/quotes/new'),

  '/dashboard/invoices': () => import('@/routes/invoices/index'),
  '/dashboard/invoices/new': () => import('@/routes/invoices/new'),

  '/dashboard/purchase-orders': () => import('@/routes/purchase-orders/index'),
  '/dashboard/purchase-orders/new': () => import('@/routes/purchase-orders/new'),

  '/dashboard/contracts': () => import('@/routes/contracts/index'),
  '/dashboard/contracts/new': () => import('@/routes/contracts/new'),

  '/dashboard/actions': () => import('@/routes/actions/index'),
  '/dashboard/actions/new': () => import('@/routes/actions/new'),

  '/dashboard/engineers': () => import('@/routes/engineers/index'),
  '/dashboard/engineers/new': () => import('@/routes/engineers/new'),

  '/dashboard/subcontractors': () => import('@/routes/subcontractors/index'),
  '/dashboard/subcontractors/new': () => import('@/routes/subcontractors/new'),

  '/dashboard/timesheet': () => import('@/routes/dashboard/timesheet/index'),
  '/dashboard/archives': () => import('@/routes/archives/index'),
  '/dashboard/integrations': () => import('@/routes/dashboard/integrations/index'),
  '/dashboard/audit': () => import('@/routes/dashboard/audit/index'),
  '/dashboard/auto-assign': () => import('@/routes/dashboard/auto-assign/index'),
  '/dashboard/import': () => import('@/routes/dashboard/import/index'),

  '/dashboard/stock': () => import('@/routes/dashboard/stock/index'),
  '/dashboard/stock/new': () => import('@/routes/dashboard/stock/new'),

  '/dashboard/knowledge-base': () => import('@/routes/knowledge-base/index'),
  '/dashboard/knowledge-base/new': () => import('@/routes/knowledge-base/new'),

  '/dashboard/settings': () => import('@/routes/settings/index'),
  '/dashboard/settings/profile': () => import('@/routes/settings/profile'),
  '/dashboard/settings/users': () => import('@/routes/settings/users'),
  '/dashboard/settings/roles': () => import('@/routes/settings/roles'),
  '/dashboard/settings/organisation': () => import('@/routes/settings/organisation'),
  '/dashboard/settings/billing': () => import('@/routes/settings/billing'),
  '/dashboard/settings/sla': () => import('@/routes/dashboard/settings/sla/index'),
  '/dashboard/settings/branding': () => import('@/routes/dashboard/settings/branding/index'),
  '/dashboard/settings/data': () => import('@/routes/dashboard/settings/data/index'),
  '/dashboard/settings/privacy': () => import('@/routes/dashboard/settings/privacy/index'),
}

const triggered = new Set<string>()

function resolvePrefetch(path: string): PrefetchFn | undefined {
  if (path.startsWith('/dashboard/jobs/') && path !== '/dashboard/jobs/new') {
    return () => import('@/routes/jobs/[id]')
  }
  if (path.startsWith('/dashboard/purchase-orders/') && path !== '/dashboard/purchase-orders/new') {
    return () => import('@/routes/purchase-orders/[id]')
  }
  return prefetchMap[path]
}

export function prefetchRoute(path: string) {
  if (triggered.has(path)) return
  const fn = resolvePrefetch(path)
  if (!fn) return
  triggered.add(path)
  // Best-effort. Swallow errors — failures here are harmless.
  fn().catch(() => {
    triggered.delete(path)
  })
}
