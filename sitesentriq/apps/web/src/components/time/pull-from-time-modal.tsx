/**
 * "Pull from time entries" modal — generates invoice line items from
 * unbilled, billable time-entries on a chosen job.
 *
 * Wave 12 / Task 107.
 *
 * Wave 17C — migrated from a bespoke `fixed inset-0` div to HeroUI v3
 * <Modal>. Focus trap + ESC + click-outside-to-close are now free.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Chip, Modal } from '@haumea/ui'
import { Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ListSkeleton } from '@/components/shared/skeletons'
import {
  TIME_ENTRY_KIND_COLOR,
  TIME_ENTRY_KIND_LABELS,
  formatHours,
  resolveRate,
  useEngineerRates,
  useMarkEntriesBilled,
  useUnbilledJobEntries,
  type TimeEntry,
  type TimeEntryKind,
} from '@/lib/time-tracking'

interface PullFromTimeModalProps {
  invoiceId: string
  clientId?: string | null
  onClose: () => void
  onLinesGenerated: (
    lines: { description: string; quantity: number; unit_price: number; total: number }[],
    entryIds: string[],
  ) => Promise<void> | void
}

interface KindGroup {
  kind: TimeEntryKind
  entries: TimeEntry[]
  totalMinutes: number
  totalAmount: number
  averageRate: number
  description: string
  excluded: boolean
}

function emptyGroup(kind: TimeEntryKind): KindGroup {
  return {
    kind,
    entries: [],
    totalMinutes: 0,
    totalAmount: 0,
    averageRate: 0,
    description: '',
    excluded: false,
  }
}

export function PullFromTimeModal({ invoiceId, clientId, onClose, onLinesGenerated }: PullFromTimeModalProps) {
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['time_entries', 'jobs-with-unbilled', clientId],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('id, title, client_id, time_entries:time_entries(id, billed_invoice_id, billable, ended_at)')
        .order('created_at', { ascending: false })
      if (clientId) query = query.eq('client_id', clientId)
      const { data, error } = await query
      if (error) throw error
      type Row = {
        id: string
        title: string
        client_id: string | null
        time_entries: { id: string; billed_invoice_id: string | null; billable: boolean; ended_at: string | null }[] | null
      }
      return ((data ?? []) as Row[])
        .map((row) => ({
          ...row,
          unbilled: (row.time_entries ?? []).filter(
            (t) => t.billable && !t.billed_invoice_id && t.ended_at,
          ).length,
        }))
        .filter((row) => row.unbilled > 0)
    },
  })

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const { data: entries, isLoading: entriesLoading } = useUnbilledJobEntries(selectedJobId ?? undefined)
  const { data: rates } = useEngineerRates()

  const groups = useMemo<KindGroup[]>(() => {
    if (!entries) return []
    const out: Record<TimeEntryKind, KindGroup> = {
      travel: emptyGroup('travel'),
      on_site: emptyGroup('on_site'),
      admin: emptyGroup('admin'),
      break: emptyGroup('break'),
    }
    for (const e of entries) {
      const mins = e.duration_minutes ?? 0
      const rate = resolveRate(e, rates ?? {})
      out[e.kind].entries.push(e)
      out[e.kind].totalMinutes += mins
      out[e.kind].totalAmount += (mins / 60) * rate
      out[e.kind].averageRate = rate
    }
    return (Object.values(out) as KindGroup[])
      .filter((g) => g.totalMinutes > 0)
      .map((g) => ({
        ...g,
        averageRate: g.entries.length ? g.totalAmount / Math.max(0.01, g.totalMinutes / 60) : 0,
        description: `Engineer time — ${TIME_ENTRY_KIND_LABELS[g.kind]}`,
        totalAmount: Math.round(g.totalAmount * 100) / 100,
      }))
  }, [entries, rates])

  const [edited, setEdited] = useState<KindGroup[]>([])
  useEffect(() => {
    setEdited(groups.map((g) => ({ ...g })))
  }, [groups])

  const markBilled = useMarkEntriesBilled()

  const handlePull = async () => {
    const include = edited.filter((g) => !g.excluded && g.totalMinutes > 0)
    if (include.length === 0) return
    const lines = include.map((g) => {
      // Compute the money from EXACT hours and round only the final total — and
      // round it the SAME way the modal displays it (lines ~210-212). Rounding
      // hours to 2dp first would bill a figure that differs from what the
      // operator approved (e.g. 50 min @ £30 → shown £25.00 but billed £24.90).
      const exactHours = g.totalMinutes / 60
      const unit = g.averageRate
      const total = Math.round(exactHours * unit * 100) / 100
      const hrs = Math.round(exactHours * 100) / 100
      return { description: g.description, quantity: hrs, unit_price: unit, total }
    })
    const entryIds = include.flatMap((g) => g.entries.map((e) => e.id))
    try {
      await onLinesGenerated(lines, entryIds)
    } catch {
      // onLinesGenerated surfaces its own error toast. Do NOT mark the entries
      // billed and do NOT close — otherwise they'd be flipped to billed against
      // an invoice that never received the lines, vanishing from the unbilled
      // pool with no UI to recover them. Leave the modal open so the user can retry.
      return
    }
    if (entryIds.length > 0) {
      markBilled.mutate({ entryIds, invoiceId })
    }
    onClose()
  }

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <Clock className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Pull from time entries</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
        {!selectedJobId ? (
          <>
            <p className="text-label text-text-secondary mb-3">
              Pick a job to pull billable time entries from. Only jobs with unbilled time are listed.
            </p>
            {jobsLoading ? (
              <ListSkeleton rows={3} withAvatar={false} framed={false} />
            ) : !jobs || jobs.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-label">
                No jobs with unbilled time entries{clientId ? ' for this client' : ''}.
              </div>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto divide-y divide-border-subtle border border-border-default rounded-lg">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button
                      onClick={() => setSelectedJobId(j.id)}
                      className="w-full text-left px-4 py-3 hover:bg-surface-page transition-colors flex items-center justify-between">
                      <div>
                        <div className="text-label font-medium text-text-primary">{j.title}</div>
                        <div className="text-micro text-text-muted">{j.unbilled} unbilled entr{j.unbilled === 1 ? 'y' : 'ies'}</div>
                      </div>
                      <span className="text-caption text-brand-600">Select →</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="text-label text-text-secondary mb-3">
              Proposed line items grouped by kind. Edit description / rate or exclude individual lines.
            </p>
            {entriesLoading ? (
              <ListSkeleton rows={3} withAvatar={false} framed={false} />
            ) : edited.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-label">
                No billable entries on this job.
              </div>
            ) : (
              <ul className="space-y-3 max-h-[400px] overflow-y-auto">
                {edited.map((g, i) => {
                  const hours = g.totalMinutes / 60
                  const unitDisplay = g.averageRate
                  const lineTotal = Math.round(hours * unitDisplay * 100) / 100
                  return (
                    <li key={g.kind}
                      className={`p-3 border rounded-lg ${
                        g.excluded ? 'border-border-default bg-surface-page opacity-60' : 'border-border-default bg-surface-card'
                      }`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={!g.excluded}
                          onChange={(e) => {
                            const copy = [...edited]
                            copy[i] = { ...copy[i], excluded: !e.target.checked }
                            setEdited(copy)
                          }}
                          className="accent-brand-500 mt-1 w-4 h-4"
                          aria-label="Include this line" />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Chip variant="soft" size="sm" color={TIME_ENTRY_KIND_COLOR[g.kind]}>
                              {TIME_ENTRY_KIND_LABELS[g.kind]}
                            </Chip>
                            <span className="text-micro text-text-muted">
                              {g.entries.length} entr{g.entries.length === 1 ? 'y' : 'ies'} · {formatHours(g.totalMinutes)} hrs
                            </span>
                          </div>
                          <input
                            type="text"
                            value={g.description}
                            onChange={(e) => {
                              const copy = [...edited]
                              copy[i] = { ...copy[i], description: e.target.value }
                              setEdited(copy)
                            }}
                            className="border border-border-default rounded-lg px-3 py-1.5 text-label w-full bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40" />
                          <div className="flex items-center gap-3 text-caption">
                            <span className="text-text-muted">Rate £/hr</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={Number.isFinite(g.averageRate) ? g.averageRate.toFixed(2) : '0'}
                              onChange={(e) => {
                                const copy = [...edited]
                                copy[i] = { ...copy[i], averageRate: parseFloat(e.target.value) || 0 }
                                setEdited(copy)
                              }}
                              className="border border-border-default rounded-lg px-2 py-1 text-caption w-24 bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20" />
                            <span className="ml-auto font-semibold text-text-primary">£{lineTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
          </Modal.Body>
          <Modal.Footer>
            {!selectedJobId ? (
              <Button variant="tertiary" onPress={onClose}>Cancel</Button>
            ) : (
              <>
                <Button variant="tertiary" onPress={() => setSelectedJobId(null)}>Back</Button>
                <Button
                  variant="primary"
                  onPress={handlePull}
                  isDisabled={edited.every((g) => g.excluded) || markBilled.isPending}
                >
                  Add lines to invoice
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export default PullFromTimeModal
