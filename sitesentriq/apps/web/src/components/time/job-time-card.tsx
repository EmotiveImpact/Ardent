/**
 * Job Time card — renders on the job-detail page.
 *
 * Wave 12 / Task 107.
 */
import { useId, useMemo, useState } from 'react'
import { Button, Chip, Modal } from '@haumea/ui'
import { AppCard, FormSelect, LineItemInput } from '@haumea/ui'
import { ListSkeleton } from '@/components/shared/skeletons'
import { Clock, Plus, Pencil, Trash2, Play, Square } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  TIME_ENTRY_KIND_COLOR,
  TIME_ENTRY_KIND_LABELS,
  aggregate,
  formatDuration,
  formatHours,
  minutesByKind,
  useDeleteEntry,
  useEngineerRates,
  useJobTimeEntries,
  useRunningEntry,
  useStartTimer,
  useStopTimer,
  useUpsertManualEntry,
  toLocalYmd,
  type TimeEntry,
  type TimeEntryKind,
} from '@/lib/time-tracking'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

interface JobTimeCardProps {
  jobId: string
  organisationId: string
}

const KIND_OPTIONS: TimeEntryKind[] = ['travel', 'on_site', 'admin', 'break']

const BAR_COLOR: Record<TimeEntryKind, string> = {
  travel: 'bg-brand-500',
  on_site: 'bg-status-compliant',
  admin: 'bg-status-due-soon',
  break: 'bg-text-muted',
}

function fmtTimeRange(started: string, ended: string | null) {
  const startD = new Date(started)
  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (!ended) return `${time(startD)} → running`
  const endD = new Date(ended)
  const sameDay = startD.toDateString() === endD.toDateString()
  return sameDay ? `${time(startD)} → ${time(endD)}` : `${time(startD)} → ${endD.toLocaleString()}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

export function JobTimeCard({ jobId, organisationId }: JobTimeCardProps) {
  const { profile } = useAuth()
  const isEngineer = profile?.role === 'engineer'
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'super_admin'

  const { data: entries, isLoading } = useJobTimeEntries(jobId)
  const { data: rates } = useEngineerRates()
  const { data: running } = useRunningEntry(profile?.id)
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const upsertEntry = useUpsertManualEntry()
  const deleteEntry = useDeleteEntry()

  const [startKind, setStartKind] = useState<TimeEntryKind>('on_site')
  const [showStartModal, setShowStartModal] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const breakdown = useMemo(
    () => aggregate(entries ?? [], { engineerDefaults: rates ?? {} }),
    [entries, rates],
  )
  const minsByKind = useMemo(() => minutesByKind(entries ?? []), [entries])

  const totalForBar = breakdown.total_minutes || 1
  const myRunningOnThisJob = running && running.job_id === jobId ? running : null

  const handleStartTimer = () => {
    if (!profile?.id) return
    startTimer.mutate(
      { jobId, engineerId: profile.id, organisationId, kind: startKind },
      { onSuccess: () => setShowStartModal(false) },
    )
  }

  const handleStopTimer = () => {
    if (!myRunningOnThisJob) return
    stopTimer.mutate(myRunningOnThisJob.id)
  }

  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="px-5 pt-5 pb-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-brand-500" />
          <h3 className="text-body font-semibold text-text-primary">Time</h3>
          {breakdown.running && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-micro font-medium bg-status-due-soon/10 text-status-due-soon border border-status-due-soon/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-due-soon opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-due-soon" />
              </span>
              Running · {TIME_ENTRY_KIND_LABELS[breakdown.running.kind]}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isEngineer && (
            myRunningOnThisJob ? (
              <Button variant="danger" size="sm" onPress={handleStopTimer} isDisabled={stopTimer.isPending}>
                <Square size={14} /> Stop timer
              </Button>
            ) : (
              <Button variant="primary" size="sm" onPress={() => setShowStartModal(true)} isDisabled={startTimer.isPending}>
                <Play size={14} /> Start timer
              </Button>
            )
          )}
          <Button variant="secondary" size="sm" onPress={() => { setEditEntry(null); setShowManualModal(true) }}>
            <Plus size={14} /> Add entry
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Travel" value={formatDuration(breakdown.travel_minutes)} color="text-brand-600" />
          <Stat label="On site" value={formatDuration(breakdown.on_site_minutes)} color="text-status-compliant" />
          <Stat label="Admin" value={formatDuration(breakdown.admin_minutes)} color="text-status-due-soon" />
          <Stat label={`Billable @ £${breakdown.billable_total.toFixed(2)}`} value={`${formatHours(breakdown.billable_minutes)} hrs`} color="text-brand-600" />
        </div>

        {breakdown.total_minutes > 0 && (
          <div>
            <div className="h-2.5 w-full rounded-full bg-surface-page overflow-hidden flex">
              {KIND_OPTIONS.map((k) => {
                const pct = (minsByKind[k] / totalForBar) * 100
                if (pct <= 0) return null
                return (
                  <div key={k} className={`${BAR_COLOR[k]} h-full`} style={{ width: `${pct}%` }}
                    title={`${TIME_ENTRY_KIND_LABELS[k]} — ${formatDuration(minsByKind[k])}`} />
                )
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {KIND_OPTIONS.filter((k) => minsByKind[k] > 0).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-micro text-text-muted">
                  <span className={`w-2 h-2 rounded-full ${BAR_COLOR[k]}`} />
                  {TIME_ENTRY_KIND_LABELS[k]} {formatDuration(minsByKind[k])}
                </span>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <ListSkeleton rows={3} withAvatar={false} framed={false} />
        ) : !entries || entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Clock size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label">No time logged yet</p>
            <p className="text-micro mt-1">Start a timer or add a manual entry to begin tracking.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Time entries" className="overflow-hidden">
                <thead><tr>
                  <th className="text-left py-2 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Kind</th>
                  <th className="text-left py-2 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">When</th>
                  <th className="text-right py-2 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Duration</th>
                  <th className="text-left py-2 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Billable</th>
                  <th className="text-left py-2 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Notes</th>
                  <th className="text-right py-2 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">{' '}</th>
                </tr></thead>
                <tbody>
                  {entries.map((entry) => {
                    const mins = entry.duration_minutes ?? 0
                    const canEdit = isAdmin || (isEngineer && entry.engineer_id === profile?.id)
                    return (
                      <tr key={entry.id} id={entry.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2">
                          <Chip variant="soft" size="sm" color={TIME_ENTRY_KIND_COLOR[entry.kind]}>
                            {TIME_ENTRY_KIND_LABELS[entry.kind]}
                          </Chip>
                        </td>
                        <td className="px-3 py-2 text-caption text-text-secondary">
                          <div>{fmtDate(entry.started_at)}</div>
                          <div className="text-micro text-text-muted">{fmtTimeRange(entry.started_at, entry.ended_at)}</div>
                        </td>
                        <td className="px-3 py-2 text-caption text-text-primary text-right font-medium">
                          {entry.ended_at ? formatDuration(mins) : <span className="text-status-due-soon">running</span>}
                        </td>
                        <td className="px-3 py-2 text-caption">
                          {entry.billable ? (
                            <span className="text-status-compliant font-medium">Yes</span>
                          ) : (
                            <span className="text-text-muted">No</span>
                          )}
                          {entry.billed_invoice_id && (
                            <span className="ml-1 text-[10px] text-text-muted">(invoiced)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-caption text-text-secondary truncate max-w-[200px]">
                          {entry.notes || <span className="text-text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canEdit && (
                            <div className="inline-flex gap-1">
                              <button
                                onClick={() => { setEditEntry(entry); setShowManualModal(true) }}
                                className="p-1 rounded hover:bg-surface-page text-text-muted hover:text-text-primary"
                                aria-label="Edit entry">
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => setDeleteId(entry.id)}
                                className="p-1 rounded hover:bg-status-overdue/10 text-text-muted hover:text-status-overdue"
                                aria-label="Delete entry">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          </div>
        )}
      </div>

      {showStartModal && (
        <Overlay onClose={() => setShowStartModal(false)} title="Start a timer">
          <div className="space-y-3">
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Kind</label>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  onClick={() => setStartKind(k)}
                  className={`px-3 py-2 rounded-lg border text-label font-medium transition-colors ${
                    startKind === k
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                      : 'border-border-default text-text-secondary hover:bg-surface-page'
                  }`}>
                  {TIME_ENTRY_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <p className="text-micro text-text-muted">
              {startKind === 'break' ? 'Breaks are unbillable.' : 'Default rate from your engineer profile will be used.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onPress={() => setShowStartModal(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onPress={handleStartTimer} isDisabled={startTimer.isPending}>
                <Play size={14} /> Start
              </Button>
            </div>
          </div>
        </Overlay>
      )}

      {showManualModal && (
        <ManualEntryModal
          jobId={jobId}
          organisationId={organisationId}
          engineerId={editEntry?.engineer_id ?? profile?.id ?? ''}
          editing={editEntry}
          onClose={() => { setShowManualModal(false); setEditEntry(null) }}
          onSave={(payload) => upsertEntry.mutate(payload, {
            onSuccess: () => { setShowManualModal(false); setEditEntry(null) },
          })}
          saving={upsertEntry.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete time entry"
        message="Are you sure? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteId) deleteEntry.mutate(deleteId, { onSuccess: () => setDeleteId(null) })
        }}
        onCancel={() => setDeleteId(null)}
      />
    </AppCard>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface-page rounded-lg p-3">
      <div className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">{label}</div>
      <div className={`text-[18px] font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  )
}

// Wave 17C — Overlay now wraps HeroUI <Modal>. Same prop shape so the
// two callsites in this file (Start a timer + Add/Edit time entry) keep
// working unchanged.
function Overlay({
  title,
  onClose,
  children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>{children}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

interface ManualPayload {
  id?: string
  jobId: string
  engineerId: string
  organisationId: string
  kind: TimeEntryKind
  startedAt: string
  endedAt: string
  ratePerHour?: number | null
  billable?: boolean
  notes?: string | null
}

function ManualEntryModal({
  jobId,
  organisationId,
  engineerId,
  editing,
  onClose,
  onSave,
  saving,
}: {
  jobId: string
  organisationId: string
  engineerId: string
  editing: TimeEntry | null
  onClose: () => void
  onSave: (payload: ManualPayload) => void
  saving: boolean
}) {
  const initialDate = editing
    ? toLocalYmd(new Date(editing.started_at))
    : toLocalYmd(new Date())
  const initialStart = editing
    ? new Date(editing.started_at).toTimeString().slice(0, 5)
    : '09:00'
  const initialEnd = editing && editing.ended_at
    ? new Date(editing.ended_at).toTimeString().slice(0, 5)
    : '10:00'

  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(initialEnd)
  const [kind, setKind] = useState<TimeEntryKind>(editing?.kind ?? 'on_site')
  const [billable, setBillable] = useState(editing?.billable ?? true)
  const [rate, setRate] = useState<string>(editing?.rate_per_hour != null ? String(editing.rate_per_hour) : '')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const formId = useId()
  const dateId = `${formId}-date`
  const startId = `${formId}-start`
  const endId = `${formId}-end`
  const kindId = `${formId}-kind`
  const rateId = `${formId}-rate`
  const billableId = `${formId}-billable`
  const notesId = `${formId}-notes`

  const handleSave = () => {
    const startedAt = new Date(`${date}T${startTime}:00`).toISOString()
    let endedAt = new Date(`${date}T${endTime}:00`).toISOString()
    if (new Date(endedAt) <= new Date(startedAt)) {
      const adjusted = new Date(`${date}T${endTime}:00`)
      adjusted.setDate(adjusted.getDate() + 1)
      endedAt = adjusted.toISOString()
    }
    onSave({
      id: editing?.id,
      jobId,
      engineerId,
      organisationId,
      kind,
      startedAt,
      endedAt,
      ratePerHour: rate ? Number(rate) : null,
      billable,
      notes: notes || null,
    })
  }

  return (
    <Overlay title={editing ? 'Edit time entry' : 'Add time entry'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label htmlFor={dateId} className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Date</label>
          <input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="border border-border-default rounded-lg px-3 py-2 text-label w-full bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={startId} className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Start</label>
            <input id={startId} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="border border-border-default rounded-lg px-3 py-2 text-label w-full bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40" />
          </div>
          <div>
            <label htmlFor={endId} className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">End</label>
            <input id={endId} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="border border-border-default rounded-lg px-3 py-2 text-label w-full bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40" />
          </div>
        </div>
        <div>
          <label htmlFor={kindId} className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Kind</label>
          <FormSelect<TimeEntryKind>
            value={kind}
            onChange={(next) => {
              setKind(next)
              if (next === 'break') setBillable(false)
            }}
            ariaLabel="Kind"
            options={KIND_OPTIONS.map((k) => ({ value: k, label: TIME_ENTRY_KIND_LABELS[k] }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={rateId} className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Rate (£/hr)</label>
            <LineItemInput
              id={rateId}
              ariaLabel="Rate (£/hr)"
              type="currency"
              min="0"
              step="0.01"
              placeholder="default"
              value={rate}
              onChange={setRate}
            />
          </div>
          <div className="flex items-end">
            <label htmlFor={billableId} className="inline-flex items-center gap-2 text-label text-text-secondary">
              <input id={billableId} type="checkbox" checked={billable} disabled={kind === 'break'}
                onChange={(e) => setBillable(e.target.checked)}
                className="accent-brand-500 w-4 h-4" />
              Billable
            </label>
          </div>
        </div>
        <div>
          <label htmlFor={notesId} className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Notes</label>
          <LineItemInput
            id={notesId}
            ariaLabel="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Optional context"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onPress={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onPress={handleSave} isDisabled={saving}>
            {editing ? 'Save changes' : 'Add entry'}
          </Button>
        </div>
      </div>
    </Overlay>
  )
}

export default JobTimeCard
