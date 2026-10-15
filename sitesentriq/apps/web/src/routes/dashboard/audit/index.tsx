import { useEffect, useMemo, useState } from 'react'
import { Button, Chip, Input, Label, Modal, Spinner, TextField } from '@haumea/ui'
import { AppCard, FormSelect, Text } from '@haumea/ui'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Download,
  Radio,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ListSkeleton } from '@/components/shared/skeletons'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { useOrganisation } from '@/hooks/use-organisation'
import { supabase } from '@/lib/supabase'
import { formatRelativeTime } from '@haumea/utils'
import {
  EXPORT_CAP,
  useAuditActionCategories,
  useAuditActors,
  useAuditEntityTypes,
  useAuditLog,
} from '@/lib/audit/queries'
import {
  addSavedFilter,
  loadSavedFilters,
  quickFilterPresets,
  removeSavedFilter,
} from '@/lib/audit/saved-filters'
import type {
  AuditFilters,
  AuditLogRow,
  AuditSeverity,
  SavedAuditFilter,
} from '@/lib/audit/types'

// ── Date range presets ────────────────────────────────────────
const DATE_PRESETS = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
] as const
type DatePresetId = (typeof DATE_PRESETS)[number]['id']

function applyDatePreset(id: DatePresetId): { fromDate?: string; toDate?: string } {
  const now = new Date()
  if (id === 'all') return {}
  if (id === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { fromDate: start.toISOString() }
  }
  const days = id === 'last7' ? 7 : id === 'last30' ? 30 : 90
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return { fromDate: from.toISOString() }
}

// ── Severity styling ─────────────────────────────────────────
function severityChipColor(s: AuditSeverity): 'default' | 'warning' | 'danger' {
  if (s === 'critical') return 'danger'
  if (s === 'warning') return 'warning'
  return 'default'
}

// ── Multi-select chip cluster ────────────────────────────────
interface ChipMultiSelectProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}

function ChipMultiSelect({ label, options, selected, onChange }: ChipMultiSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-micro font-medium uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <Text scale="micro" as="span" tone="muted">No options</Text>
        ) : (
          options.map((opt) => {
            const active = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (active) onChange(selected.filter((v) => v !== opt.value))
                  else onChange([...selected, opt.value])
                }}
                className={
                  'px-2 py-1 rounded-md text-micro font-medium border transition-colors ' +
                  (active
                    ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                    : 'bg-surface-elevated border-border-default text-text-secondary hover:text-text-primary')
                }
              >
                {opt.label}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Action chip — color by severity + verb prefix ────────────
function ActionChip({ action, severity }: { action: string; severity: AuditSeverity }) {
  return (
    <Chip variant="soft" size="sm" color={severityChipColor(severity)}>
      <span className="font-mono text-micro">{action}</span>
    </Chip>
  )
}

// ── Single audit row (with metadata expand) ──────────────────
function AuditRow({ row }: { row: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false)
  const hasMeta = row.metadata && Object.keys(row.metadata).length > 0
  const created = new Date(row.created_at)

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => hasMeta && setExpanded((v) => !v)}
        className={
          'w-full grid grid-cols-12 gap-3 px-4 py-3 text-left transition-colors ' +
          (hasMeta ? 'hover:bg-surface-elevated/50 cursor-pointer' : 'cursor-default')
        }
      >
        {/* Actor */}
        <div className="col-span-3 flex items-center gap-2 min-w-0">
          {hasMeta ? (
            expanded ? (
              <ChevronDown size={14} className="text-text-muted flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
            )
          ) : (
            <span className="w-[14px] flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-label font-medium text-text-primary truncate">
              {row.actor_email || 'system'}
            </div>
            {row.entity_type && (
              <div className="text-micro text-text-muted truncate">
                {row.entity_type}
                {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="col-span-2 flex items-center min-w-0">
          <ActionChip action={row.action} severity={row.severity} />
        </div>

        {/* Summary */}
        <div className="col-span-5 flex items-center min-w-0">
          <span className="text-label text-text-secondary truncate">{row.summary}</span>
        </div>

        {/* Time */}
        <div className="col-span-2 flex items-center justify-end min-w-0">
          <span
            className="text-caption text-text-muted"
            title={created.toLocaleString()}
          >
            {formatRelativeTime(row.created_at)}
          </span>
        </div>
      </button>

      {expanded && hasMeta && (
        <div className="px-4 pb-3 pl-9">
          <div className="bg-surface-page border border-border-subtle rounded-md max-h-[280px] overflow-auto">
            <pre className="p-3 text-micro font-mono text-text-secondary whitespace-pre-wrap break-all">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          </div>
          <div className="mt-2 flex items-center gap-3 text-micro text-text-muted">
            <span>source: {row.source}</span>
            {row.ip_address && <span>ip: {row.ip_address}</span>}
            {row.user_agent && (
              <span className="truncate" title={row.user_agent}>
                ua: {row.user_agent.slice(0, 40)}
                {row.user_agent.length > 40 ? '…' : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Saved filter chip strip ──────────────────────────────────
function SavedFilters({
  saved,
  onApply,
  onDelete,
}: {
  saved: SavedAuditFilter[]
  onApply: (filters: AuditFilters) => void
  onDelete: (id: string) => void
}) {
  if (saved.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {saved.map((f) => (
        <div
          key={f.id}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-micro font-medium bg-brand-500/10 border border-brand-500/30 text-text-accent"
        >
          <button type="button" onClick={() => onApply(f.filters)}>
            {f.label}
          </button>
          <button
            type="button"
            onClick={() => onDelete(f.id)}
            className="text-text-muted hover:text-status-overdue"
            aria-label={`Delete saved filter ${f.label}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function AuditLogPage() {
  const { profile } = useAuth()
  const { can } = usePermissions()
  const { organisation } = useOrganisation()
  const canExport = can('audit:export')

  const [datePreset, setDatePreset] = useState<DatePresetId>('last30')
  const [filters, setFilters] = useState<AuditFilters>(() => ({
    ...applyDatePreset('last30'),
  }))
  const [searchInput, setSearchInput] = useState('')
  const [liveMode, setLiveMode] = useState(false)
  const [liveRows, setLiveRows] = useState<AuditLogRow[]>([])
  const [savedFilters, setSavedFilters] = useState<SavedAuditFilter[]>([])
  const [exporting, setExporting] = useState(false)
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [savePromptName, setSavePromptName] = useState('')

  // Hydrate saved filters per-user
  useEffect(() => {
    if (profile?.id) setSavedFilters(loadSavedFilters(profile.id))
  }, [profile?.id])

  // Debounce search input → filters.search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined }))
    }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data: actors } = useAuditActors()
  const { data: actionCategories } = useAuditActionCategories()
  const { data: entityTypes } = useAuditEntityTypes()

  const auditQuery = useAuditLog(filters)
  const allRows = useMemo<AuditLogRow[]>(() => {
    const fetched = auditQuery.data?.pages.flatMap((p) => p.rows) ?? []
    // Live rows are the freshest — prepend & dedupe by id.
    if (liveRows.length === 0) return fetched
    const seen = new Set<string>()
    const merged: AuditLogRow[] = []
    for (const row of [...liveRows, ...fetched]) {
      if (!seen.has(row.id)) {
        seen.add(row.id)
        merged.push(row)
      }
    }
    return merged
  }, [auditQuery.data, liveRows])
  const total = auditQuery.data?.pages[0]?.total ?? null

  // Live tail subscriptions on system_audit_events + timeline_events
  useEffect(() => {
    if (!liveMode || !organisation?.id) return
    const orgFilter = `organisation_id=eq.${organisation.id}`
    const channel = supabase
      .channel(`audit-live:${organisation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_audit_events',
          filter: orgFilter,
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>
          const row: AuditLogRow = {
            id: String(r.id),
            organisation_id: r.organisation_id as string,
            actor_user_id: (r.actor_user_id as string) ?? null,
            actor_email: (r.actor_email as string) ?? null,
            action: r.action as string,
            entity_type: (r.entity_type as string) ?? null,
            entity_id: (r.entity_id as string) ?? null,
            summary: r.summary as string,
            metadata: (r.metadata as Record<string, unknown>) ?? null,
            ip_address: (r.ip_address as string) ?? null,
            user_agent: (r.user_agent as string) ?? null,
            severity: (r.severity as AuditSeverity) ?? 'info',
            source: 'system_audit_events',
            created_at: r.created_at as string,
          }
          setLiveRows((prev) => [row, ...prev].slice(0, 100))
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'timeline_events',
          filter: orgFilter,
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>
          const row: AuditLogRow = {
            id: String(r.id),
            organisation_id: r.organisation_id as string,
            actor_user_id: (r.user_id as string) ?? null,
            actor_email: null,
            action: r.event_type as string,
            entity_type: r.job_id ? 'job' : r.property_id ? 'property' : r.client_id ? 'client' : 'timeline',
            entity_id:
              (r.job_id as string) ||
              (r.property_id as string) ||
              (r.client_id as string) ||
              null,
            summary: r.description as string,
            metadata: (r.metadata as Record<string, unknown>) ?? null,
            ip_address: null,
            user_agent: null,
            severity: 'info',
            source: 'timeline_events',
            created_at: r.created_at as string,
          }
          setLiveRows((prev) => [row, ...prev].slice(0, 100))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [liveMode, organisation?.id])

  // ── Filter change helpers ──────────────────────────────────
  function update(patch: Partial<AuditFilters>) {
    setFilters((f) => ({ ...f, ...patch }))
  }
  function changeDatePreset(id: DatePresetId) {
    setDatePreset(id)
    update(applyDatePreset(id))
  }
  function applyQuickPreset(id: string) {
    const preset = quickFilterPresets(profile?.id).find((p) => p.id === id)
    if (preset) {
      setSearchInput(preset.filters.search ?? '')
      setFilters({ ...applyDatePreset(datePreset), ...preset.filters })
    }
  }
  function applySaved(f: AuditFilters) {
    setSearchInput(f.search ?? '')
    setFilters({ ...applyDatePreset(datePreset), ...f })
  }
  function saveCurrent() {
    if (!profile?.id) return
    setSavePromptName('')
    setSavePromptOpen(true)
  }
  function commitSaveCurrent() {
    if (!profile?.id) return
    const trimmed = savePromptName.trim()
    if (!trimmed) {
      toast.error('Enter a name for this filter')
      return
    }
    const entry = addSavedFilter(profile.id, trimmed, filters)
    setSavedFilters((s) => [...s, entry])
    toast.success('Filter saved')
    setSavePromptOpen(false)
    setSavePromptName('')
  }
  function deleteSaved(id: string) {
    if (!profile?.id) return
    removeSavedFilter(profile.id, id)
    setSavedFilters((s) => s.filter((f) => f.id !== id))
  }

  async function handleExport() {
    if (!canExport) return
    if (!total) {
      toast.error('Nothing to export')
      return
    }
    if (total > EXPORT_CAP) {
      toast.warning(
        `Export capped at ${EXPORT_CAP.toLocaleString()} rows (${total.toLocaleString()} match). Tighten the filter or contact support for an async export.`,
      )
    }
    setExporting(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-export`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ filters }),
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const dl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dl
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(dl)
      toast.success('Export ready')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const presets = quickFilterPresets(profile?.id)

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: 'Settings', path: '/dashboard/settings' }, { label: 'Audit log' }]} />
      <SectionHeader
        variant="page"
        icon={<Activity size={18} />}
        title="Audit log"
        subtitle="Org-wide trail of every change, sign-in, and admin action."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={liveMode ? 'primary' : 'outline'}
              onPress={() => setLiveMode((v) => !v)}
            >
              <Radio size={14} />
              {liveMode ? 'Live' : 'Paused'}
            </Button>
            {canExport && (
              <Button
                size="sm"
                variant="outline"
                onPress={handleExport}
                isDisabled={exporting}
              >
                {exporting ? <Spinner size="sm" /> : <Download size={14} />}
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {/* Quick filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyQuickPreset(p.id)}
            className="px-2.5 py-1 rounded-md text-caption font-medium bg-surface-elevated border border-border-default text-text-secondary hover:text-text-primary transition-colors"
          >
            {p.label}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-border-default" />
        <SavedFilters saved={savedFilters} onApply={applySaved} onDelete={deleteSaved} />
        <Button size="sm" variant="ghost" onPress={saveCurrent}>
          <Save size={12} />
          Save current
        </Button>
      </div>

      {/* Filter panel */}
      <AppCard padding="sm" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search */}
          <div className="md:col-span-5">
            <label className="text-micro font-medium uppercase tracking-wider text-text-muted">
              Search
            </label>
            <div className="mt-1 relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search summary, action, actor email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-surface-elevated border border-border-default rounded-lg pl-8 pr-2.5 py-1.5 text-label text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40"
              />
            </div>
          </div>

          {/* Date preset */}
          <div className="md:col-span-3">
            <label className="text-micro font-medium uppercase tracking-wider text-text-muted">
              Date range
            </label>
            <div className="mt-1">
              <FormSelect<DatePresetId>
                value={datePreset}
                onChange={changeDatePreset}
                ariaLabel="Date range"
                options={DATE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              />
            </div>
          </div>

          {/* Custom from/to */}
          <div className="md:col-span-2">
            <label className="text-micro font-medium uppercase tracking-wider text-text-muted">
              From
            </label>
            <input
              type="date"
              value={filters.fromDate?.slice(0, 10) ?? ''}
              onChange={(e) =>
                update({ fromDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
              className="mt-1 w-full bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-label text-text-primary focus:outline-none focus:border-accent/40"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-micro font-medium uppercase tracking-wider text-text-muted">
              To
            </label>
            <input
              type="date"
              value={filters.toDate?.slice(0, 10) ?? ''}
              onChange={(e) =>
                update({ toDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
              className="mt-1 w-full bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-label text-text-primary focus:outline-none focus:border-accent/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ChipMultiSelect
            label="Actor"
            options={(actors ?? []).map((a) => ({
              value: a.id,
              label: a.full_name || a.email,
            }))}
            selected={filters.actorIds ?? []}
            onChange={(next) => update({ actorIds: next.length ? next : undefined })}
          />
          <ChipMultiSelect
            label="Action category"
            options={(actionCategories ?? []).map((p) => ({ value: p, label: p }))}
            selected={filters.actionPrefixes ?? []}
            onChange={(next) => update({ actionPrefixes: next.length ? next : undefined })}
          />
          <ChipMultiSelect
            label="Entity type"
            options={(entityTypes ?? []).map((t) => ({ value: t, label: t }))}
            selected={filters.entityTypes ?? []}
            onChange={(next) => update({ entityTypes: next.length ? next : undefined })}
          />
          <ChipMultiSelect
            label="Severity"
            options={[
              { value: 'info', label: 'Info' },
              { value: 'warning', label: 'Warning' },
              { value: 'critical', label: 'Critical' },
            ]}
            selected={filters.severities ?? []}
            onChange={(next) =>
              update({ severities: next.length ? (next as AuditSeverity[]) : undefined })
            }
          />
        </div>

        {/* Active filter summary + clear */}
        <div className="flex items-center justify-between border-t border-border-subtle pt-3">
          <div className="text-caption text-text-muted">
            {total !== null ? `${total.toLocaleString()} events` : `${allRows.length} loaded`}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              setFilters({ ...applyDatePreset(datePreset) })
              setSearchInput('')
            }}
          >
            <Trash2 size={12} />
            Clear filters
          </Button>
        </div>
      </AppCard>

      {/* Results table */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {/* Sticky header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b border-border-default bg-surface-elevated text-micro font-medium uppercase tracking-wider text-text-muted">
          <div className="col-span-3">Actor</div>
          <div className="col-span-2">Action</div>
          <div className="col-span-5">Summary</div>
          <div className="col-span-2 text-right">When</div>
        </div>

        {auditQuery.isLoading ? (
          <ListSkeleton rows={8} withAvatar={false} framed={false} />
        ) : auditQuery.isError ? (
          <EmptyState
            icon={Activity}
            title="Failed to load audit log"
            description={auditQuery.error?.message || 'Try refreshing the page.'}
          />
        ) : allRows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No matching events"
            description="Try widening the date range or clearing filters."
          />
        ) : (
          <>
            <div className="max-h-[640px] overflow-auto">
              {allRows.map((row) => (
                <AuditRow key={`${row.source}:${row.id}`} row={row} />
              ))}
            </div>
            {auditQuery.hasNextPage && (
              <div className="p-3 border-t border-border-subtle flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => auditQuery.fetchNextPage()}
                  isDisabled={auditQuery.isFetchingNextPage}
                >
                  {auditQuery.isFetchingNextPage ? <Spinner size="sm" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal.Backdrop
        isOpen={savePromptOpen}
        onOpenChange={(next) => {
          if (!next) {
            setSavePromptOpen(false)
            setSavePromptName('')
          }
        }}
      >
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Save filter set</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField>
                <Label>Name</Label>
                <Input
                  value={savePromptName}
                  onChange={(e) => setSavePromptName(e.target.value)}
                  placeholder="e.g. Recent admin actions"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitSaveCurrent()
                    }
                  }}
                />
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="tertiary"
                onPress={() => {
                  setSavePromptOpen(false)
                  setSavePromptName('')
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onPress={commitSaveCurrent}>
                Save filter
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
