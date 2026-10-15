// Dashboard widget registry + layout merge logic (trust wave W1-T4).
//
// The dashboard renders three fixed ZONES (the hero greeting row is pinned and
// not customisable):
//   main — full-width stack (compliance pair, KPI grid, trend chart)
//   left — the 2/3 column of the lower grid (feeds + widgets)
//   rail — the 1/3 right rail (recent activity)
// Users keep ONE ordered list of widgets (saved per-user in
// dashboard_widget_prefs.layout); each widget renders in its own zone in the
// user's order. Reordering across zones is intentionally not a thing — a
// full-width chart can't sit inside a column without layout chaos.

export type DashboardZone = 'main' | 'left' | 'rail'

export interface DashboardWidgetMeta {
  key: string
  label: string
  description: string
  zone: DashboardZone
}

export interface DashboardLayoutEntry {
  key: string
  hidden: boolean
}

/** Registry order = the default display order for new users. */
export const WIDGET_REGISTRY: DashboardWidgetMeta[] = [
  {
    key: 'compliance_overview',
    label: 'Compliance score & SoC pulse',
    description: 'The headline 0–100 compliance score with the Statement of Compliance pulse.',
    zone: 'main',
  },
  {
    key: 'kpi_grid',
    label: 'Operational KPIs',
    description: "Today's operation at a glance — jobs, visits, overdue counts.",
    zone: 'main',
  },
  {
    key: 'trend_chart',
    label: 'Trend chart',
    description: 'Jobs and compliance trends over time.',
    zone: 'main',
  },
  {
    key: 'jobs_activity',
    label: 'Jobs activity feed',
    description: 'Latest job movements across the organisation.',
    zone: 'left',
  },
  {
    key: 'quote_widgets',
    label: 'Quote widgets',
    description: 'Service-quote and defect-quote pipelines.',
    zone: 'left',
  },
  {
    key: 'po_widgets',
    label: 'Purchase order widgets',
    description: 'Open and recent purchase orders.',
    zone: 'left',
  },
  {
    key: 'compliance_feed',
    label: 'Compliance feed',
    description: 'Upcoming and overdue compliance items.',
    zone: 'left',
  },
  {
    key: 'insights',
    label: 'Insights panel',
    description: 'Automatic insights surfaced from your data.',
    zone: 'left',
  },
  {
    key: 'activity_rail',
    label: 'Recent activity rail',
    description: 'The right-hand recent activity column.',
    zone: 'rail',
  },
]

const REGISTRY_KEYS = new Set(WIDGET_REGISTRY.map((w) => w.key))

/**
 * Merge a saved layout against the registry:
 *  - saved entries whose key no longer exists are DROPPED (widget removed),
 *  - registry widgets missing from the saved layout are APPENDED visible in
 *    registry order (new widget shipped → everyone sees it, nobody migrates),
 *  - an empty/absent saved layout therefore yields the registry default.
 * Pure — unit-tested in dashboard-widgets.test.ts.
 */
export function mergeLayout(saved: DashboardLayoutEntry[] | null | undefined): DashboardLayoutEntry[] {
  const seen = new Set<string>()
  const merged: DashboardLayoutEntry[] = []
  for (const entry of saved ?? []) {
    if (!REGISTRY_KEYS.has(entry.key) || seen.has(entry.key)) continue
    seen.add(entry.key)
    merged.push({ key: entry.key, hidden: !!entry.hidden })
  }
  for (const meta of WIDGET_REGISTRY) {
    if (!seen.has(meta.key)) merged.push({ key: meta.key, hidden: false })
  }
  return merged
}

/** The visible, ordered keys for one zone — what the dashboard renders. */
export function zoneOrder(layout: DashboardLayoutEntry[], zone: DashboardZone): string[] {
  const zoneKeys = new Set(WIDGET_REGISTRY.filter((w) => w.zone === zone).map((w) => w.key))
  return layout.filter((e) => !e.hidden && zoneKeys.has(e.key)).map((e) => e.key)
}

/** Move the entry at `index` up/down WITHIN its zone (zone-relative order is
 *  what renders, so swapping with the next same-zone neighbour is the only
 *  move that means anything). Returns a new array; no-op at the edges. */
export function moveWithinZone(
  layout: DashboardLayoutEntry[],
  index: number,
  direction: -1 | 1,
): DashboardLayoutEntry[] {
  const entry = layout[index]
  if (!entry) return layout
  const meta = WIDGET_REGISTRY.find((w) => w.key === entry.key)
  if (!meta) return layout
  let j = index + direction
  while (j >= 0 && j < layout.length) {
    const other = WIDGET_REGISTRY.find((w) => w.key === layout[j].key)
    if (other && other.zone === meta.zone) break
    j += direction
  }
  if (j < 0 || j >= layout.length) return layout
  const next = [...layout]
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

export function widgetMeta(key: string): DashboardWidgetMeta | undefined {
  return WIDGET_REGISTRY.find((w) => w.key === key)
}
