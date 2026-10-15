// Trust wave W1-T3 — the chip is the list/detail surface for accounting sync
// state, including the new in-flight 'pushing' claim and the error tooltip.

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountingStatusChip } from './accounting-status-chip'

describe('AccountingStatusChip', () => {
  it('renders "Not synced" for none/undefined', () => {
    render(<AccountingStatusChip status={undefined} />)
    expect(screen.getByText('Not synced')).toBeInTheDocument()
  })

  it('renders the in-flight pushing state with the provider name', () => {
    render(<AccountingStatusChip status="pushing" provider="xero" />)
    expect(screen.getByText('Pushing to Xero…')).toBeInTheDocument()
  })

  it('renders pushed with the provider name', () => {
    render(<AccountingStatusChip status="pushed" provider="quickbooks" />)
    expect(screen.getByText('Pushed to QuickBooks')).toBeInTheDocument()
  })

  it('renders the error state with the failure reason as a tooltip', () => {
    render(<AccountingStatusChip status="error" errorMessage="Xero: 401 token expired" />)
    const label = screen.getByText('Sync error')
    expect(label).toBeInTheDocument()
    expect(label.closest('[title]')).toHaveAttribute('title', 'Xero: 401 token expired')
  })

  it('renders disconnected', () => {
    render(<AccountingStatusChip status="disconnected" />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })
})
