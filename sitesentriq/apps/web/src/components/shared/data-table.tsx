import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { listRowMotion } from '@/lib/motion'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState, type RowSelectionState,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { Button } from '@haumea/ui'
import { TableCheckbox } from '@haumea/ui'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  pageSize?: number
  enableSelection?: boolean
  getRowId?: (row: T) => string
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  bulkActions?: React.ReactNode
  onBulkDelete?: (ids: string[]) => void
  /** Rendered in place of the table body when there are zero rows. */
  emptyState?: React.ReactNode
}

type RowSelectionUpdater = RowSelectionState | ((old: RowSelectionState) => RowSelectionState)

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  enableSelection = false,
  getRowId,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  bulkActions,
  onBulkDelete,
  emptyState,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({})
  const isSelectionControlled = controlledSelectedIds !== undefined
  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!isSelectionControlled) return internalRowSelection
    return Object.fromEntries(controlledSelectedIds.map((id) => [id, true]))
  }, [controlledSelectedIds, internalRowSelection, isSelectionControlled])

  const emitSelection = (next: RowSelectionState) => {
    onSelectionChange?.(Object.keys(next).filter((key) => next[key]))
  }

  const handleRowSelectionChange = (updater: RowSelectionUpdater) => {
    if (isSelectionControlled) {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      emitSelection(next)
    } else {
      setInternalRowSelection(updater)
    }
  }

  const clearSelection = () => {
    if (isSelectionControlled) {
      onSelectionChange?.([])
    } else {
      setInternalRowSelection({})
    }
  }

  // Build columns with optional checkbox column prepended
  const allColumns = useMemo(() => {
    if (!enableSelection) return columns

    const checkboxCol: ColumnDef<T, any> = {
      id: '_select',
      header: ({ table }) => (
        <TableCheckbox
          isSelected={table.getIsAllPageRowsSelected()}
          isIndeterminate={
            table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
          }
          onChange={(isSelected) => table.toggleAllPageRowsSelected(isSelected)}
          ariaLabel="Select all rows"
        />
      ),
      cell: ({ row }) => (
        <TableCheckbox
          isSelected={row.getIsSelected()}
          onChange={(isSelected) => row.toggleSelected(isSelected)}
          ariaLabel="Select row"
        />
      ),
      enableSorting: false,
      size: 40,
    }

    return [checkboxCol, ...columns]
  }, [columns, enableSelection])

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, pagination, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: handleRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: enableSelection,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  })

  // Build the set of currently visible row IDs so we can drop any
  // selection entries that no longer have a backing row (the row was
  // deleted by this user, by realtime invalidation from another tab,
  // or by a parent-level filter change). Without this, the floating
  // "N selected" pill keeps stale IDs forever and the count never goes
  // down — which is exactly the bug users reported.
  const liveIds = useMemo(() => {
    const set = new Set<string>()
    for (const row of data) {
      const id = getRowId ? getRowId(row) : (row as { id?: string }).id
      if (id) set.add(id)
    }
    return set
  }, [data, getRowId])

  // Reconcile selection whenever the data array changes. Functional
  // setState keeps this safe in concurrent rendering and avoids
  // depending on the prior selection in the deps array.
  useEffect(() => {
    if (isSelectionControlled) {
      const next = (controlledSelectedIds ?? []).filter((id) => liveIds.has(id))
      if (next.length !== (controlledSelectedIds ?? []).length) {
        onSelectionChange?.(next)
      }
      return
    }

    setInternalRowSelection((prev) => {
      let changed = false
      const next: RowSelectionState = {}
      for (const id of Object.keys(prev)) {
        if (liveIds.has(id)) next[id] = prev[id]
        else changed = true
      }
      return changed ? next : prev
    })
  }, [controlledSelectedIds, isSelectionControlled, liveIds, onSelectionChange])

  // Derive the selected-id list from the (now-pruned) selection state.
  const selectedRowIds = useMemo(() => {
    return Object.keys(rowSelection).filter((k) => rowSelection[k])
  }, [rowSelection])

  useEffect(() => {
    if (!isSelectionControlled) onSelectionChange?.(selectedRowIds)
  }, [isSelectionControlled, selectedRowIds, onSelectionChange])

  const selectedCount = selectedRowIds.length

  // Map TanStack sort state → ARIA-compliant aria-sort values for
  // assistive tech. VoiceOver / NVDA / JAWS read these to announce
  // "sorted ascending" / "sorted descending" / "not sorted".
  const ariaSortFor = (
    isSorted: false | 'asc' | 'desc',
  ): 'ascending' | 'descending' | 'none' => {
    if (isSorted === 'asc') return 'ascending'
    if (isSorted === 'desc') return 'descending'
    return 'none'
  }

  const visibleHeaders = table.getHeaderGroups()[0]?.headers ?? []
  const visibleRows = table.getRowModel().rows

  // Zero rows → render the supplied empty state (if any) instead of an
  // empty grid. Callers that don't pass one keep the previous behaviour
  // (an empty <tbody>, which is harmless).
  if (data.length === 0 && emptyState) {
    return <div>{emptyState}</div>
  }

  return (
    <div>
      <div className="overflow-x-auto">
        {/*
          Plain semantic HTML <table> — NOT HeroUI's react-aria Table. TanStack
          stays the source of truth for sort/pagination/selection; we only need a
          static grid for display. HeroUI v3's react-aria Table builds an internal
          collection that can deterministically throw "Found N cells and 0 columns"
          when fed dynamic columns + cache-warm data; a native table has no
          collection builder, so it can't. `aria-sort` on each <th> is what screen
          readers announce.
        */}
        <table className="w-full" aria-label="Data table">
          <thead>
            <tr className="border-b border-border-default">
              {visibleHeaders.map((header) => {
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={canSort ? ariaSortFor(sorted) : undefined}
                    className={`text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em] ${
                      header.id === '_select' ? 'w-10' : ''
                    }`}
                  >
                    {header.isPlaceholder ? null : header.id === '_select' ? (
                      flexRender(header.column.columnDef.header, header.getContext())
                    ) : (
                      <button
                        type="button"
                        className={`flex items-center gap-1 ${
                          canSort ? 'cursor-pointer hover:text-text-primary' : ''
                        }`}
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={
                          canSort
                            ? `Sort by ${typeof header.column.columnDef.header === 'string'
                                ? header.column.columnDef.header
                                : header.id}`
                            : undefined
                        }
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          sorted === 'asc' ? <ChevronUp size={12} /> :
                          sorted === 'desc' ? <ChevronDown size={12} /> :
                          <ChevronsUpDown size={12} className="text-text-muted opacity-50" />
                        )}
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
            {visibleRows.map((row, index) => (
              <motion.tr
                key={row.id}
                {...listRowMotion(index)}
                className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`py-3 px-4 ${cell.column.id === '_select' ? 'w-10' : ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
          <span className="text-caption text-text-muted">
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="p-1.5 rounded-md hover:bg-surface-page disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span className="text-caption text-text-secondary px-2">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="p-1.5 rounded-md hover:bg-surface-page disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Floating bulk action bar.
          Previously used `bg-foreground text-background` which inverted
          colours on every theme — looked like a black pill on a light
          page. Now uses the same surface tokens as cards/menus so it
          reads correctly on light, dark, midnight, glass, and luxe. */}
      {enableSelection && selectedCount > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="animate-rise fixed bottom-4 left-0 right-0 mx-auto w-fit z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border-strong bg-surface-elevated/95 backdrop-blur-md shadow-2xl text-text-primary max-w-[calc(100vw-2rem)] overflow-x-auto flex-nowrap [&>*]:shrink-0"
        >
          <span className="text-label font-medium pr-3 border-r border-border-default">
            {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
          </span>
          {bulkActions}
          {onBulkDelete && (
            <Button
              variant="danger"
              size="sm"
              onPress={() => onBulkDelete(selectedRowIds)}
            >
              <Trash2 size={13} />
              Delete Selected
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onPress={clearSelection}
            aria-label="Deselect all"
          >
            <X size={13} />
            Deselect All
          </Button>
        </div>
      )}
    </div>
  )
}
