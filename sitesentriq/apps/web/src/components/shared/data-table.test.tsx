import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'
import { renderWithProviders } from '@/test/test-utils'
import { DataTable } from './data-table'

/**
 * Regression guard for the HeroUI v3 table-selection checkbox.
 *
 * Two real production breakages this locks down:
 *  1. "A slot prop is required" — a HeroUI <Checkbox> with no slot inside a
 *     HeroUI <Table> THROWS during render (3.1.0). Rendering this table at all
 *     would crash, so the render assertions below catch it.
 *  2. Inert checkbox — a HeroUI <Checkbox slot="selection"> ignores the
 *     controlled props, so clicking does nothing. The click assertion catches it.
 *
 * The fix is a plain native <input type="checkbox"> (TableCheckbox), which is
 * version-independent. If anyone reintroduces a context-bound checkbox, this fails.
 */

interface Row {
  id: string
  name: string
}

const rows: Row[] = [
  { id: 'r1', name: 'Alpha' },
  { id: 'r2', name: 'Beta' },
]

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name', cell: ({ row }) => row.original.name },
]

describe('<DataTable /> selection', () => {
  it('renders selectable rows without throwing (no slot crash)', () => {
    const { container } = renderWithProviders(
      <DataTable data={rows} columns={columns} enableSelection getRowId={(r) => r.id} />,
    )
    // Header select-all + one per row = 3 checkboxes (Radix role="checkbox").
    const boxes = container.querySelectorAll('[role="checkbox"]')
    expect(boxes.length).toBe(3)
  })

  it('toggling a row checkbox drives selection (not inert)', () => {
    const onSelectionChange = vi.fn()
    const { container } = renderWithProviders(
      <DataTable
        data={rows}
        columns={columns}
        enableSelection
        getRowId={(r) => r.id}
        onSelectionChange={onSelectionChange}
      />,
    )
    const boxes = container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')
    // boxes[0] = select-all, boxes[1] = first row.
    fireEvent.click(boxes[1])
    expect(onSelectionChange).toHaveBeenCalled()
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0]
    expect(lastCall).toContain('r1')
  })
})
