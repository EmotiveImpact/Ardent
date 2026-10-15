import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/test-utils'
import {
  SkeletonStatCard,
  SkeletonTableRow,
  ListPageSkeleton,
  DashboardSkeleton,
} from './skeleton'

describe('<SkeletonStatCard />', () => {
  it('renders three pulse boxes (label, value, subtext)', () => {
    const { container } = renderWithProviders(<SkeletonStatCard />)
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3)
  })
})

describe('<SkeletonTableRow />', () => {
  it('defaults to 4 cells', () => {
    const { container } = renderWithProviders(
      <table><tbody><SkeletonTableRow /></tbody></table>,
    )
    expect(container.querySelectorAll('td')).toHaveLength(4)
  })

  it('honours the cols prop', () => {
    const { container } = renderWithProviders(
      <table><tbody><SkeletonTableRow cols={7} /></tbody></table>,
    )
    expect(container.querySelectorAll('td')).toHaveLength(7)
  })
})

describe('<ListPageSkeleton />', () => {
  it('renders the configured number of rows and cols', () => {
    const { container } = renderWithProviders(<ListPageSkeleton cols={3} rows={6} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(6)
    rows.forEach(row => {
      expect(row.querySelectorAll('td')).toHaveLength(3)
    })
  })
})

describe('<DashboardSkeleton />', () => {
  it('renders four stat cards', () => {
    const { container } = renderWithProviders(<DashboardSkeleton />)
    // Each stat card has exactly 3 pulse boxes; 4 cards = 12 pulses,
    // plus header + 2 chart placeholders. Just assert we have at least 14.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(14)
  })
})
