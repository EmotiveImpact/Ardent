import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Tag, UserCog, Activity, Archive, Download, Trash2, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AlertDialog, Button } from '@haumea/ui'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { exportToCsv } from '@haumea/utils'
import { logTimelineEvent } from '@/lib/timeline'
import { createNotification } from '@/lib/notifications'
import { TIMELINE_EVENT_TYPES, NOTIFICATION_TYPES } from '@/lib/constants'

/**
 * Mirror the single-job completion side-effects (useUpdateJob.onSuccess) for the
 * bulk path: log a VISIT_COMPLETED timeline event, notify each job's creator,
 * and invoke the client completion email. Without this, bulk-completing jobs
 * silently skipped the audit trail and client comms. Best-effort — failures
 * here never block the status change. The email fn is idempotent + handles
 * "no recipient" itself.
 */
async function fireJobCompletionSideEffects(ids: string[]) {
  try {
    const { data: rows } = await supabase
      .from('jobs')
      .select('id, organisation_id, property_id, title, created_by')
      .in('id', ids)
    for (const row of rows ?? []) {
      const r = row as unknown as {
        id: string
        organisation_id?: string
        property_id?: string
        title?: string
        created_by?: string
      }
      if (r.organisation_id) {
        logTimelineEvent({
          orgId: r.organisation_id,
          propertyId: r.property_id,
          eventType: TIMELINE_EVENT_TYPES.VISIT_COMPLETED,
          description: `Job "${r.title || r.id}" marked as completed`,
        })
        if (r.created_by) {
          createNotification({
            userId: r.created_by,
            orgId: r.organisation_id,
            type: NOTIFICATION_TYPES.JOB_COMPLETED,
            title: 'Job completed',
            message: `Job "${r.title || r.id}" has been completed`,
          })
        }
      }
      void supabase.functions
        .invoke('job-completion-email', { body: { job_id: r.id } })
        .catch(() => {})
    }
  } catch (err) {
    console.warn('[bulk-action-bar] job completion side-effects skipped:', err)
  }
}

/** Threshold above which deletes require type-to-confirm rather than a simple dialog. */
const TYPE_TO_CONFIRM_THRESHOLD = 10

type ActionKey = 'assign' | 'status' | 'serviceGroup' | 'tag' | 'export' | 'archive' | 'delete'

interface BulkActionBarProps {
  /** Supabase table name to mutate */
  table: string
  /** Currently selected row IDs */
  selectedIds: string[]
  /** Full row data for selected items — used for CSV export */
  selectedRows?: Record<string, unknown>[]
  /** Mapping from row -> CSV row */
  toCsvRow?: (row: Record<string, unknown>) => Record<string, unknown>
  /** Filename prefix for CSV export */
  exportFilename?: string
  /** Which actions to show */
  actions?: ActionKey[]
  /** TanStack Query keys to invalidate after a successful mutation */
  invalidateKeys?: string[][]
  /** Status options for the "Change Status" dropdown */
  statusOptions?: { label: string; value: string }[]
  /** Options for the "Service Group" dropdown (jobs only) */
  serviceGroupOptions?: { label: string; value: string }[]
  /** Called when selection should be cleared (e.g. after action completes) */
  onClearSelection: () => void
}

const ACTION_ICONS: Record<ActionKey, LucideIcon> = {
  assign: UserCog,
  status: Activity,
  serviceGroup: Layers,
  tag: Tag,
  export: Download,
  archive: Archive,
  delete: Trash2,
}

const ACTION_LABELS: Record<ActionKey, string> = {
  assign: 'Assign',
  status: 'Change Status',
  serviceGroup: 'Service Group',
  tag: 'Add Tag',
  export: 'Export CSV',
  archive: 'Archive',
  delete: 'Delete',
}

interface UndoSnapshot {
  message: string
  // For each row: original values keyed by column
  records: { id: string; before: Record<string, unknown> }[]
  patch: Record<string, unknown>
}

export function BulkActionBar({
  table,
  selectedIds,
  selectedRows,
  toCsvRow,
  exportFilename = 'export.csv',
  actions = ['status', 'tag', 'export', 'archive', 'delete'],
  invalidateKeys = [],
  statusOptions = [],
  serviceGroupOptions = [],
  onClearSelection,
}: BulkActionBarProps) {
  const [openMenu, setOpenMenu] = useState<ActionKey | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [typeToConfirmOpen, setTypeToConfirmOpen] = useState(false)
  const [typeToConfirmInput, setTypeToConfirmInput] = useState('')
  const [tagInput, setTagInput] = useState('')

  // Phrase the user must type to confirm a large bulk delete.
  const typeToConfirmPhrase = `delete ${selectedIds.length} items`
  const typeToConfirmMatches = typeToConfirmInput.trim() === typeToConfirmPhrase

  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    if (invalidateKeys.length > 0) {
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    } else {
      // Default: invalidate by table name
      queryClient.invalidateQueries({ queryKey: [table] })
    }
  }, [invalidateKeys, table, queryClient])

  // Revert takes the snapshot as an ARGUMENT rather than reading `pending` from
  // the closure. The Undo toast is registered in applyPatch BEFORE state updates,
  // so an onClick that read a `pending` state captured the stale (null) value and
  // silently no-op'd — Undo never worked. Passing records directly fixes it (the
  // 5s toast itself bounds the grace window, so no pending state is needed).
  const revert = useCallback(async (records: UndoSnapshot['records']) => {
    if (!records || records.length === 0) return
    try {
      await Promise.all(
        records.map((r) => supabase.from(table).update(r.before).eq('id', r.id))
      )
      toast.success('Action undone')
      await invalidate()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to undo')
    }
  }, [table, invalidate])

  const applyPatch = useCallback(
    async (patch: Record<string, unknown>, message: string) => {
      try {
        // Snapshot existing values for the changed columns so we can offer undo
        const cols = Object.keys(patch)
        const { data: before, error: selErr } = await supabase
          .from(table)
          .select(['id', ...cols].join(','))
          .in('id', selectedIds)
        if (selErr) throw selErr

        const { error } = await supabase.from(table).update(patch).in('id', selectedIds)
        if (error) throw error

        const records: UndoSnapshot['records'] = (before ?? []).map((row) => {
          const rec = row as unknown as Record<string, unknown>
          const beforeVals: Record<string, unknown> = {}
          for (const c of cols) beforeVals[c] = rec[c]
          return { id: rec.id as string, before: beforeVals }
        })

        toast.success(message, {
          duration: 5000,
          action: { label: 'Undo', onClick: () => revert(records) },
        })
        await invalidate()
        onClearSelection()
        return true
      } catch (err) {
        toast.error((err as Error).message || 'Failed to update')
        return false
      }
    },
    [table, selectedIds, invalidate, onClearSelection, revert]
  )

  const performStatusChange = useCallback(
    async (status: string) => {
      setOpenMenu(null)
      const patch: Record<string, unknown> = { status }
      // Jobs carry a derived completed_date that the single-job useUpdateJob hook
      // stamps on completion / clears on move-out. The bulk path bypasses that
      // hook, so mirror the invariant here — otherwise bulk-completed jobs keep a
      // NULL completed_date and break service-history order, MTTR and sparklines.
      if (table === 'jobs') {
        patch.completed_date = status === 'completed' ? new Date().toISOString() : null
      }
      // Capture ids before applyPatch clears the selection.
      const ids = [...selectedIds]
      const ok = await applyPatch(patch, `${ids.length} item${ids.length !== 1 ? 's' : ''} → ${status}`)
      if (ok && table === 'jobs' && status === 'completed') {
        await fireJobCompletionSideEffects(ids)
      }
    },
    [applyPatch, selectedIds, table]
  )

  const performServiceGroupChange = useCallback(
    async (group: string) => {
      setOpenMenu(null)
      await applyPatch(
        { service_group: group },
        `${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''} → ${group}`,
      )
    },
    [applyPatch, selectedIds.length],
  )

  const performAddTag = useCallback(async () => {
    const tag = tagInput.trim()
    if (!tag) return
    setOpenMenu(null)
    setTagInput('')
    // Try to read existing tags first; gracefully no-op if column missing
    try {
      const { data: rows, error } = await supabase
        .from(table)
        .select('id, tags')
        .in('id', selectedIds)
      if (error) {
        // Column might not exist — surface gracefully
        if (error.message.toLowerCase().includes('column') || error.message.toLowerCase().includes('tags')) {
          toast.error('Tags are not configured for this entity yet.')
          return
        }
        throw error
      }
      const updates = (rows ?? []).map((r) => {
        const existing: string[] = Array.isArray((r as { tags?: unknown }).tags)
          ? ((r as { tags?: string[] }).tags as string[])
          : []
        const next = Array.from(new Set([...existing, tag]))
        return { id: (r as { id: string }).id, tags: next }
      })

      // Apply per-row to preserve existing tags
      const before = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        before: { tags: ((r as { tags?: string[] }).tags ?? []) as string[] },
      }))

      await Promise.all(
        updates.map((u) => supabase.from(table).update({ tags: u.tags }).eq('id', u.id))
      )

      toast.success(`Tagged ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''} with "${tag}"`, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            await Promise.all(before.map((r) => supabase.from(table).update(r.before).eq('id', r.id)))
            toast.success('Tags removed')
            await invalidate()
          },
        },
      })
      await invalidate()
      onClearSelection()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to add tags')
    }
  }, [tagInput, table, selectedIds, invalidate, onClearSelection])

  const performArchive = useCallback(async () => {
    setConfirmArchive(false)
    await applyPatch(
      { archived_at: new Date().toISOString() },
      `Archived ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''}`
    )
  }, [applyPatch, selectedIds.length])

  const performDelete = useCallback(async () => {
    setConfirmDelete(false)
    setTypeToConfirmOpen(false)
    setTypeToConfirmInput('')
    try {
      // No undo for hard delete — just confirm + execute
      const { error } = await supabase.from(table).delete().in('id', selectedIds)
      if (error) throw error
      toast.success(`Deleted ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''}`)
      await invalidate()
      onClearSelection()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete')
    }
  }, [table, selectedIds, invalidate, onClearSelection])

  // Route delete-button clicks to either a simple confirm dialog (small batches)
  // or a type-to-confirm Modal (large batches). The undo grace window isn't a
  // safety net for hundreds of rows — if the user closes the tab they're gone.
  const requestDelete = useCallback(() => {
    if (selectedIds.length > TYPE_TO_CONFIRM_THRESHOLD) {
      setTypeToConfirmInput('')
      setTypeToConfirmOpen(true)
    } else {
      setConfirmDelete(true)
    }
  }, [selectedIds.length])

  const performExport = useCallback(() => {
    const rows = (selectedRows ?? []).filter((r) => selectedIds.includes((r as { id: string }).id))
    const mapped = toCsvRow ? rows.map(toCsvRow) : rows
    if (mapped.length === 0) {
      toast.error('No rows selected')
      return
    }
    exportToCsv(exportFilename, mapped as Record<string, unknown>[])
    toast.success(`Exported ${mapped.length} row${mapped.length !== 1 ? 's' : ''}`)
  }, [selectedIds, selectedRows, toCsvRow, exportFilename])

  if (selectedIds.length === 0) return null

  return (
    <>
      <div className="animate-rise fixed bottom-4 left-0 right-0 mx-auto w-fit z-40 bg-surface-elevated/95 backdrop-blur-md text-text-primary rounded-xl shadow-2xl border border-border-strong px-4 py-2.5 flex items-center gap-2 max-w-[calc(100vw-2rem)] overflow-x-auto flex-nowrap [&>*]:shrink-0">
        <span className="text-label font-medium pr-2 border-r border-border-default">
          {selectedIds.length} selected
        </span>

        {actions.map((key) => {
          const Icon = ACTION_ICONS[key]
          if (key === 'status') {
            return (
              <div key={key} className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
                >
                  <Icon size={13} /> {ACTION_LABELS[key]}
                </Button>
                {openMenu === 'status' && statusOptions.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 bg-surface-elevated border border-border-strong rounded-lg shadow-lg overflow-hidden min-w-[140px]">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => performStatusChange(opt.value)}
                        className="block w-full text-left px-3 py-1.5 text-caption text-text-secondary hover:bg-surface-card hover:text-text-primary transition-colors"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          if (key === 'serviceGroup') {
            return (
              <div key={key} className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setOpenMenu(openMenu === 'serviceGroup' ? null : 'serviceGroup')}
                >
                  <Icon size={13} /> {ACTION_LABELS[key]}
                </Button>
                {openMenu === 'serviceGroup' && serviceGroupOptions.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 bg-surface-elevated border border-border-strong rounded-lg shadow-lg overflow-y-auto max-h-72 min-w-[220px]">
                    {serviceGroupOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => performServiceGroupChange(opt.value)}
                        className="block w-full text-left px-3 py-1.5 text-caption text-text-secondary hover:bg-surface-card hover:text-text-primary transition-colors"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          if (key === 'tag') {
            return (
              <div key={key} className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setOpenMenu(openMenu === 'tag' ? null : 'tag')}
                >
                  <Icon size={13} /> {ACTION_LABELS[key]}
                </Button>
                {openMenu === 'tag' && (
                  <div className="absolute bottom-full mb-1 left-0 bg-surface-elevated border border-border-strong rounded-lg shadow-lg p-2 flex items-center gap-1.5 min-w-[200px]">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Tag name…"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') performAddTag()
                        if (e.key === 'Escape') setOpenMenu(null)
                      }}
                      className="flex-1 px-2 py-1 rounded text-caption bg-surface-card border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40"
                    />
                    <Button variant="primary" size="sm" onPress={performAddTag}>
                      Add
                    </Button>
                  </div>
                )}
              </div>
            )
          }
          if (key === 'export') {
            return (
              <Button key={key} variant="ghost" size="sm" onPress={performExport}>
                <Icon size={13} /> {ACTION_LABELS[key]}
              </Button>
            )
          }
          if (key === 'archive') {
            return (
              <Button key={key} variant="ghost" size="sm" onPress={() => setConfirmArchive(true)}>
                <Icon size={13} /> {ACTION_LABELS[key]}
              </Button>
            )
          }
          if (key === 'delete') {
            return (
              <span
                key={key}
                title="Permanent — type-to-confirm required for >10 items"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={requestDelete}
                >
                  <Trash2 size={13} className="text-metric-rose" />
                  <span className="text-metric-rose">{ACTION_LABELS[key]}</span>
                </Button>
              </span>
            )
          }
          if (key === 'assign') {
            // Bulk assign is not implemented yet — hide rather than show a
            // permanently disabled button. Re-add once the feature ships.
            return null
          }
          return null
        })}

        <Button variant="ghost" size="sm" onPress={onClearSelection}>
          <X size={13} />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
        title="Delete selected items?"
        message={`This will permanently delete ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />

      <ConfirmDialog
        open={confirmArchive}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={performArchive}
        title="Archive selected items?"
        message={`This will archive ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''}. You can restore them later from Archives.`}
        confirmLabel="Archive"
      />

      {/* Type-to-confirm Modal — required for destructive bulk deletes >10 rows.
          Cancel is always enabled. Confirm stays disabled until the input matches
          the literal phrase exactly. Built with the same plain-div backdrop
          pattern as ConfirmDialog/CsvImportModal so it works on every theme. */}
      <TypeToConfirmDialog
        open={typeToConfirmOpen}
        phrase={typeToConfirmPhrase}
        input={typeToConfirmInput}
        matches={typeToConfirmMatches}
        count={selectedIds.length}
        table={table}
        onChange={setTypeToConfirmInput}
        onCancel={() => {
          setTypeToConfirmOpen(false)
          setTypeToConfirmInput('')
        }}
        onConfirm={() => void performDelete()}
      />
    </>
  )
}

interface TypeToConfirmDialogProps {
  open: boolean
  phrase: string
  input: string
  matches: boolean
  count: number
  table: string
  onChange: (next: string) => void
  onCancel: () => void
  onConfirm: () => void
}

// Wave 17C — TypeToConfirmDialog now wraps HeroUI <AlertDialog>. The
// destructive bulk-delete UX (type-to-confirm phrase, Enter-to-submit)
// is preserved exactly.
function TypeToConfirmDialog({
  open,
  phrase,
  input,
  matches,
  count,
  table,
  onChange,
  onCancel,
  onConfirm,
}: TypeToConfirmDialogProps) {
  return (
    <AlertDialog.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      isDismissable
      isKeyboardDismissDisabled={false}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-md">
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger">
              <Trash2 className="size-5" />
            </AlertDialog.Icon>
            <AlertDialog.Heading>Delete {count} items?</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-label text-text-secondary">
              This will permanently delete{' '}
              <span className="font-semibold text-text-primary">{count}</span> rows from{' '}
              <span className="font-mono text-caption text-text-primary">{table}</span>. This action cannot be undone.
            </p>
            <p className="text-label text-text-secondary mt-4">
              Type{' '}
              <span className="font-mono text-caption px-1.5 py-0.5 rounded bg-surface-elevated border border-border-default text-text-primary">
                {phrase}
              </span>{' '}
              to confirm.
            </p>
            <input
              autoFocus
              type="text"
              value={input}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches) onConfirm()
              }}
              placeholder={phrase}
              aria-label="Type to confirm delete"
              className="mt-3 w-full px-3 py-2 rounded-lg text-label bg-surface-card border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-metric-rose focus:ring-2 focus:ring-metric-rose/20 transition-colors"
            />
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isDisabled={!matches}
              onPress={onConfirm}
            >
              Confirm Delete
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
