// Trust wave W1-T4 — mergeLayout is the zero-backfill story for dashboard
// prefs: no row = default, removed widgets vanish, new widgets appear.

import { describe, expect, it } from 'vitest'
import {
  WIDGET_REGISTRY,
  mergeLayout,
  moveWithinZone,
  zoneOrder,
  type DashboardLayoutEntry,
} from './dashboard-widgets'

const ALL_KEYS = WIDGET_REGISTRY.map((w) => w.key)

describe('mergeLayout', () => {
  it('returns the registry default (all visible, registry order) for no saved row', () => {
    expect(mergeLayout(null).map((e) => e.key)).toEqual(ALL_KEYS)
    expect(mergeLayout(undefined).every((e) => !e.hidden)).toBe(true)
    expect(mergeLayout([]).map((e) => e.key)).toEqual(ALL_KEYS)
  })

  it('preserves saved order + hidden flags', () => {
    const saved: DashboardLayoutEntry[] = [
      { key: 'trend_chart', hidden: false },
      { key: 'kpi_grid', hidden: true },
    ]
    const merged = mergeLayout(saved)
    expect(merged[0]).toEqual({ key: 'trend_chart', hidden: false })
    expect(merged[1]).toEqual({ key: 'kpi_grid', hidden: true })
  })

  it('drops unknown keys (widget removed from the registry)', () => {
    const merged = mergeLayout([{ key: 'retired_widget', hidden: false }])
    expect(merged.find((e) => e.key === 'retired_widget')).toBeUndefined()
    expect(merged.map((e) => e.key)).toEqual(ALL_KEYS)
  })

  it('appends missing registry keys VISIBLE (new widget ships → everyone sees it)', () => {
    const saved: DashboardLayoutEntry[] = [{ key: 'kpi_grid', hidden: true }]
    const merged = mergeLayout(saved)
    expect(merged).toHaveLength(ALL_KEYS.length)
    const appended = merged.slice(1)
    expect(appended.every((e) => !e.hidden)).toBe(true)
  })

  it('dedupes a corrupted double entry', () => {
    const merged = mergeLayout([
      { key: 'kpi_grid', hidden: true },
      { key: 'kpi_grid', hidden: false },
    ])
    expect(merged.filter((e) => e.key === 'kpi_grid')).toHaveLength(1)
    expect(merged.find((e) => e.key === 'kpi_grid')!.hidden).toBe(true)
  })
})

describe('zoneOrder', () => {
  it('returns only visible keys belonging to the zone, in layout order', () => {
    const layout = mergeLayout([
      { key: 'trend_chart', hidden: false },
      { key: 'compliance_overview', hidden: true },
      { key: 'kpi_grid', hidden: false },
    ])
    expect(zoneOrder(layout, 'main')).toEqual(['trend_chart', 'kpi_grid'])
  })

  it('an empty rail zone hides the rail', () => {
    const layout = mergeLayout([{ key: 'activity_rail', hidden: true }])
    expect(zoneOrder(layout, 'rail')).toEqual([])
  })
})

describe('moveWithinZone', () => {
  it('swaps with the nearest same-zone neighbour, skipping other zones', () => {
    // Order: jobs_activity(left), trend_chart(main), quote_widgets(left), ...
    const layout: DashboardLayoutEntry[] = mergeLayout([
      { key: 'jobs_activity', hidden: false },
      { key: 'trend_chart', hidden: false },
      { key: 'quote_widgets', hidden: false },
    ])
    const moved = moveWithinZone(layout, 0, 1) // move jobs_activity down within 'left'
    const leftKeys = zoneOrder(moved, 'left')
    expect(leftKeys[0]).toBe('quote_widgets')
    expect(leftKeys[1]).toBe('jobs_activity')
    // The main-zone widget between them is untouched in its own zone order.
    expect(zoneOrder(moved, 'main')[0]).toBe('trend_chart')
  })

  it('is a no-op at the zone edge', () => {
    const layout = mergeLayout(null)
    const firstMainIdx = layout.findIndex((e) => e.key === 'compliance_overview')
    expect(moveWithinZone(layout, firstMainIdx, -1)).toBe(layout)
  })
})
