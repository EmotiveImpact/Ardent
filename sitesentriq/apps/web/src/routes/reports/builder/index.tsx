import { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, useDraggable, useDroppable, pointerWithin,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link, useSearchParams } from 'react-router'
import { Button, Modal, Spinner } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import {
  ChevronRight, Database, Filter, Columns3, ArrowUpDown, X,
  Save, CalendarClock, Download, Plus, GripVertical, Layers, Pencil,
} from 'lucide-react'
import { DATASETS, FILTER_OPERATOR_LABELS, getDataset, getField, type Dataset, type DatasetField, type FilterOperator } from '@/lib/reports/datasets'
import { runReport, cellDisplay, EMPTY_DEFINITION, type ReportDefinition, type ReportFilter, type ReportSort } from '@/lib/reports/query'
import { useReportTemplate, useCreateReportTemplate, useUpdateReportTemplate, useCreateReportSchedule, useReportSchedules } from '@/lib/reports/templates'
import { exportToCsv } from '@haumea/utils'
import { openPrintableHtml, escapeHtml } from '@/lib/pdf'
import { toast } from 'sonner'

type Zone = 'filters' | 'columns' | 'sort' | 'group'

interface DragPayload {
  fieldKey: string
  fromZone?: Zone
  fromIndex?: number
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ReportBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const templateIdParam = searchParams.get('template') ?? null

  const { data: loadedTemplate } = useReportTemplate(templateIdParam)
  const createTemplate = useCreateReportTemplate()
  const updateTemplate = useUpdateReportTemplate()

  const [datasetKey, setDatasetKey] = useState<string>('jobs')
  const [name, setName] = useState<string>('Untitled report')
  const [description, setDescription] = useState<string>('')
  const [definition, setDefinition] = useState<ReportDefinition>(EMPTY_DEFINITION)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  // Hydrate from a saved template if loaded
  useEffect(() => {
    if (loadedTemplate) {
      setDatasetKey(loadedTemplate.dataset)
      setName(loadedTemplate.name)
      setDescription(loadedTemplate.description ?? '')
      setDefinition(loadedTemplate.definition ?? EMPTY_DEFINITION)
    }
  }, [loadedTemplate])

  const dataset = useMemo(() => getDataset(datasetKey), [datasetKey])

  /* ── Live preview (debounced 500ms) ──────────── */
  const [preview, setPreview] = useState<{ rows: Record<string, unknown>[]; rowCount: number; latencyMs: number; error?: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!dataset) return
    setPreviewLoading(true)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    // Clearing the timeout doesn't cancel an already-dispatched runReport, so
    // a slow earlier run could resolve last and paint stale rows under the new
    // dataset's headers. Guard both setters on this effect still being current.
    let cancelled = false
    debounceRef.current = window.setTimeout(async () => {
      const result = await runReport(datasetKey, definition, 50)
      if (cancelled) return
      setPreview(result)
      setPreviewLoading(false)
    }, 500)
    return () => {
      cancelled = true
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [datasetKey, definition, dataset])

  /* ── Drag-drop (@dnd-kit — pointer + touch + keyboard) ─────────── */
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null)
  const sensors = useSensors(
    // distance constraint so clicking the chip's ✕ / a field row doesn't drag
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { fieldKey?: string } | undefined
    setActiveFieldKey(d?.fieldKey ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveFieldKey(null)
    const { active, over } = e
    if (!over) return
    const a = active.data.current as { kind?: string; fieldKey?: string } | undefined
    const o = over.data.current as { kind?: string; zone?: Zone; fieldKey?: string } | undefined
    if (!a?.fieldKey) return

    if (a.kind === 'field') {
      // Adding a field from the palette into a zone.
      if (o?.kind === 'zone' && o.zone) {
        addToZone(o.zone, { fieldKey: a.fieldKey })
      } else if (o?.kind === 'col' && o.fieldKey) {
        // dropped onto an existing column chip → insert at that position
        const idx = definition.columns.indexOf(o.fieldKey)
        addToZone('columns', { fieldKey: a.fieldKey }, idx < 0 ? undefined : idx)
      }
    } else if (a.kind === 'col' && o?.kind === 'col' && o.fieldKey && a.fieldKey !== o.fieldKey) {
      // Reordering columns.
      const from = definition.columns.indexOf(a.fieldKey)
      const to = definition.columns.indexOf(o.fieldKey)
      if (from >= 0 && to >= 0) {
        setDefinition((prev) => ({ ...prev, columns: arrayMove(prev.columns, from, to) }))
      }
    }
  }

  const addToZone = (zone: Zone, payload: DragPayload, atIndex?: number) => {
    const field = getField(datasetKey, payload.fieldKey)
    if (!field) return
    setDefinition((prev) => {
      const next = { ...prev }
      if (zone === 'filters') {
        const op = field.filter_operators[0] as FilterOperator
        const newFilter: ReportFilter = { field: field.key, operator: op, value: '' }
        next.filters = atIndex !== undefined
          ? [...prev.filters.slice(0, atIndex), newFilter, ...prev.filters.slice(atIndex)]
          : [...prev.filters, newFilter]
      } else if (zone === 'columns') {
        if (prev.columns.includes(field.key)) return prev
        next.columns = atIndex !== undefined
          ? [...prev.columns.slice(0, atIndex), field.key, ...prev.columns.slice(atIndex)]
          : [...prev.columns, field.key]
      } else if (zone === 'sort') {
        if (prev.sort.find((s) => s.field === field.key)) return prev
        const newSort: ReportSort = { field: field.key, direction: 'asc' }
        next.sort = atIndex !== undefined
          ? [...prev.sort.slice(0, atIndex), newSort, ...prev.sort.slice(atIndex)]
          : [...prev.sort, newSort]
      } else if (zone === 'group') {
        if (prev.group.includes(field.key)) return prev
        next.group = [...prev.group, field.key]
      }
      return next
    })
  }

  const removeFromZone = (zone: Zone, index: number) => {
    setDefinition((prev) => {
      if (zone === 'filters') return { ...prev, filters: prev.filters.filter((_, i) => i !== index) }
      if (zone === 'columns') return { ...prev, columns: prev.columns.filter((_, i) => i !== index) }
      if (zone === 'sort') return { ...prev, sort: prev.sort.filter((_, i) => i !== index) }
      if (zone === 'group') return { ...prev, group: prev.group.filter((_, i) => i !== index) }
      return prev
    })
  }

  const updateFilter = (index: number, patch: Partial<ReportFilter>) => {
    setDefinition((prev) => ({
      ...prev,
      filters: prev.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }))
  }

  const updateSort = (index: number, direction: 'asc' | 'desc') => {
    setDefinition((prev) => ({
      ...prev,
      sort: prev.sort.map((s, i) => (i === index ? { ...s, direction } : s)),
    }))
  }

  /* ── Save / export ──────────────────────────── */
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please give the report a name')
      return
    }
    if (loadedTemplate && !loadedTemplate.is_system) {
      await updateTemplate.mutateAsync({
        id: loadedTemplate.id,
        name,
        description,
        definition,
      })
    } else {
      const created = await createTemplate.mutateAsync({
        name,
        description,
        dataset: datasetKey,
        definition,
      })
      // Enter update mode so a SECOND Save edits this template instead of
      // inserting a duplicate (loadedTemplate stayed null, so every click created
      // a new row; ensureTemplate then made yet another for scheduling).
      const newId = (created as { id?: string } | null)?.id
      if (newId) setSearchParams({ template: newId }, { replace: true })
    }
  }

  const handleExportCsv = () => {
    if (!preview?.rows.length) {
      toast.error('Nothing to export')
      return
    }
    const cols = definition.columns.length ? definition.columns : Object.keys(preview.rows[0])
    const rows = preview.rows.map((r) => {
      const out: Record<string, unknown> = {}
      // Key by the human-friendly field label (exportToCsv derives headers from
      // the row keys) so the CSV matches the on-screen preview instead of showing
      // raw column keys like 'property_id'.
      for (const c of cols) out[getField(datasetKey, c)?.label ?? c] = cellDisplay(r, c, getField(datasetKey, c))
      return out
    })
    exportToCsv(`${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv`, rows)
  }

  const handleExportPdf = () => {
    if (!preview) {
      toast.error('Run the preview first')
      return
    }
    // Generate the printable HTML client-side as a fallback when the
    // edge function isn't deployed.
    const cols = definition.columns.length ? definition.columns : Object.keys(preview.rows[0] ?? {})
    // Human-friendly labels for the header row (match the preview), not raw keys.
    // SECURITY: every interpolated value (report name/description, header labels,
    // and especially cell values like client/asset/property names) MUST be
    // HTML-escaped — openPrintableHtml renders this as a same-origin srcdoc
    // iframe, so unescaped user/tenant data would be stored XSS.
    const ths = cols.map((h) => `<th>${escapeHtml(getField(datasetKey, h)?.label ?? h)}</th>`).join('')
    const trs = preview.rows
      .map((r) => `<tr>${cols.map((h) => `<td>${escapeHtml(String(cellDisplay(r, h, getField(datasetKey, h)) ?? ''))}</td>`).join('')}</tr>`)
      .join('')
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a;padding:32px;max-width:960px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.meta{color:#64748b;font-size:12px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0}
th{background:#f8fafc;font-weight:600;text-transform:uppercase;font-size:11px;color:#475569}
@media print{body{padding:0}}
</style></head>
<body><h1>${escapeHtml(name)}</h1><p class="meta">${escapeHtml(description)} &middot; ${preview.rows.length} rows &middot; ${new Date().toLocaleString('en-GB')}</p>
<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></body></html>`
    openPrintableHtml(html)
  }

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-caption text-text-muted">
        <Link to="/" className="hover:text-text-secondary">Dashboard</Link>
        <ChevronRight size={12} />
        <Link to="/dashboard/reports" className="hover:text-text-secondary">Reports</Link>
        <ChevronRight size={12} />
        <span className="text-text-secondary font-medium">Custom builder</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[260px] space-y-1">
          <div className="group relative">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled report"
              aria-label="Report name"
              className="w-full bg-transparent text-[22px] font-semibold text-text-primary tracking-[-0.02em] rounded-lg -mx-2 px-2 pr-8 py-1 outline-none transition-colors placeholder:text-text-muted/50 hover:bg-surface-page focus:bg-surface-card focus:ring-2 focus:ring-accent/30"
            />
            <Pencil
              size={14}
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-0"
            />
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description to remember what this report is for…"
            aria-label="Report description"
            className="w-full bg-transparent text-label text-text-secondary rounded-lg -mx-2 px-2 py-1 outline-none transition-colors placeholder:text-text-muted/60 hover:bg-surface-page focus:bg-surface-card focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onPress={handleExportCsv}>
            <Download size={14} /> CSV
          </Button>
          <Button size="sm" variant="outline" onPress={handleExportPdf}>
            <Download size={14} /> PDF
          </Button>
          <Button size="sm" variant="outline" onPress={() => setScheduleOpen(true)}>
            <CalendarClock size={14} /> Schedule
          </Button>
          <Button size="sm" variant="primary" onPress={handleSave} isDisabled={createTemplate.isPending || updateTemplate.isPending}>
            <Save size={14} /> {loadedTemplate && !loadedTemplate.is_system ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>

      {/* 3-column layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
        {/* ── Left: Datasets + fields ── */}
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <Database size={14} className="text-text-muted" />
            <span className="text-caption font-semibold text-text-primary uppercase tracking-[0.04em]">Data sources</span>
          </div>
          <div className="max-h-[80vh] overflow-y-auto">
            {DATASETS.map((d) => (
              <DatasetSection
                key={d.key}
                dataset={d}
                expanded={d.key === datasetKey}
                onSelect={() => {
                  if (d.key !== datasetKey) {
                    setDatasetKey(d.key)
                    setDefinition(EMPTY_DEFINITION)
                    // A different data source is a different report. Detach from any
                    // loaded template so Save creates a NEW one — otherwise the
                    // update path kept the old `dataset` while writing the new empty
                    // `definition`, silently corrupting the saved template.
                    if (templateIdParam) setSearchParams({}, { replace: true })
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Centre: Drop zones ── */}
        <div className="space-y-4">
          <DropZone
            title="Filters"
            icon={Filter}
            count={definition.filters.length}
            zone="filters"
            empty="Drag fields here to filter the report"
          >
            {definition.filters.map((f, i) => (
              <FilterChip
                key={`${f.field}-${i}`}
                filter={f}
                field={getField(datasetKey, f.field)}
                onChange={(patch) => updateFilter(i, patch)}
                onRemove={() => removeFromZone('filters', i)}
              />
            ))}
          </DropZone>

          <DropZone
            title="Columns"
            icon={Columns3}
            count={definition.columns.length}
            zone="columns"
            empty="Drag fields here to display them as columns. Drag to reorder."
          >
            <SortableContext items={definition.columns.map((c) => `col::${c}`)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-2">
                {definition.columns.map((c, i) => (
                  <SortableChip
                    key={c}
                    fieldKey={c}
                    label={getField(datasetKey, c)?.label ?? c}
                    onRemove={() => removeFromZone('columns', i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DropZone>

          <DropZone
            title="Sort"
            icon={ArrowUpDown}
            count={definition.sort.length}
            zone="sort"
            empty="Drag fields here to sort"
          >
            <div className="flex flex-col gap-2">
              {definition.sort.map((s, i) => {
                const f = getField(datasetKey, s.field)
                return (
                  <div key={s.field} className="flex items-center gap-2 bg-surface-page border border-border-default rounded-lg px-2.5 py-1.5">
                    <span className="text-caption text-text-primary font-medium flex-1">{f?.label ?? s.field}</span>
                    <div className="w-32">
                      <FormSelect<'asc' | 'desc'>
                        value={s.direction}
                        onChange={(v) => updateSort(i, v)}
                        ariaLabel="Sort direction"
                        options={[
                          { value: 'asc', label: 'Ascending' },
                          { value: 'desc', label: 'Descending' },
                        ]}
                      />
                    </div>
                    <button onClick={() => removeFromZone('sort', i)} className="text-text-muted hover:text-status-overdue">
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </DropZone>

          <DropZone
            title="Group by"
            icon={Layers}
            count={definition.group.length}
            zone="group"
            empty="Drag fields here to group rows"
          >
            <div className="flex flex-wrap gap-2">
              {definition.group.map((g, i) => {
                const f = getField(datasetKey, g)
                return (
                  <div
                    key={g}
                    className="flex items-center gap-1.5 bg-surface-page border border-border-default rounded-lg px-2.5 py-1 text-caption text-text-primary"
                  >
                    <span>{f?.label ?? g}</span>
                    <button onClick={() => removeFromZone('group', i)} className="text-text-muted hover:text-status-overdue">
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </DropZone>
        </div>

        {/* ── Right: Live preview ── */}
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-caption font-semibold text-text-primary uppercase tracking-[0.04em]">Live preview</span>
              {previewLoading && <Spinner size="sm" />}
            </div>
            {preview && !preview.error && (
              <span className="text-micro text-text-muted">
                {preview.rows.length} of {preview.rowCount} &middot; {preview.latencyMs}ms
              </span>
            )}
          </div>
          <div className="max-h-[80vh] overflow-auto">
            {preview?.error ? (
              <div className="p-6 text-label text-status-overdue">{preview.error}</div>
            ) : !definition.columns.length && !preview?.rows.length ? (
              <div className="p-12 text-center">
                <Database size={28} className="text-text-muted mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-label text-text-muted">Drag fields into Columns to see a preview</p>
              </div>
            ) : !preview?.rows.length && !previewLoading ? (
              <div className="p-12 text-center">
                <p className="text-label text-text-muted">No rows match these filters</p>
              </div>
            ) : (
              <PreviewTable rows={preview?.rows ?? []} columns={definition.columns} datasetKey={datasetKey} />
            )}
          </div>
        </div>
      </div>

        {/* Floating drag preview */}
        <DragOverlay dropAnimation={null}>
          {activeFieldKey ? (
            <div className="flex items-center gap-1.5 bg-surface-card border border-[var(--accent)] rounded-lg px-2.5 py-1.5 shadow-[var(--overlay-shadow)] cursor-grabbing">
              <GripVertical size={12} className="text-text-muted" />
              <span className="text-caption text-text-primary font-medium">
                {getField(datasetKey, activeFieldKey)?.label ?? activeFieldKey}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Schedule modal */}
      {scheduleOpen && (
        <ScheduleModal
          template={loadedTemplate ?? null}
          onClose={() => setScheduleOpen(false)}
          ensureTemplate={async () => {
            if (loadedTemplate) return loadedTemplate.id
            const created = await createTemplate.mutateAsync({
              name, description, dataset: datasetKey, definition,
            })
            // Enter update mode so a later Save reuses this template (otherwise
            // scheduling + saving created two separate template rows).
            if (created?.id) setSearchParams({ template: created.id }, { replace: true })
            return created.id
          }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════ */

function DatasetSection({
  dataset, expanded, onSelect,
}: {
  dataset: Dataset
  expanded: boolean
  onSelect: () => void
}) {
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-surface-page transition-colors ${
          expanded ? 'bg-surface-page' : ''
        }`}
      >
        <div>
          <div className="text-caption font-semibold text-text-primary">{dataset.label}</div>
          <div className="text-micro text-text-muted truncate">{dataset.description}</div>
        </div>
        <ChevronRight
          size={12}
          className={`text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5">
          {dataset.fields.map((field) => (
            <DraggableField key={field.key} field={field} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A field in the palette — draggable into any zone (@dnd-kit). */
function DraggableField({ field }: { field: DatasetField }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `field::${field.key}`,
    data: { kind: 'field', fieldKey: field.key },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-page cursor-grab active:cursor-grabbing touch-none group ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <GripVertical size={11} className="text-text-muted opacity-0 group-hover:opacity-100" />
      <span className="text-caption text-text-secondary flex-1 truncate">{field.label}</span>
      <span className="text-[10px] text-text-muted uppercase">{field.type}</span>
    </div>
  )
}

/** A column chip — sortable for reordering (@dnd-kit). */
function SortableChip({ fieldKey, label, onRemove }: { fieldKey: string; label: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col::${fieldKey}`,
    data: { kind: 'col', fieldKey },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 bg-surface-page border border-border-default rounded-lg px-2.5 py-1.5 ${
        isDragging ? 'opacity-50 z-10' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label}`}
        className="cursor-grab active:cursor-grabbing touch-none text-text-muted"
      >
        <GripVertical size={12} />
      </button>
      <span className="text-caption text-text-primary font-medium">{label}</span>
      <button onClick={onRemove} className="text-text-muted hover:text-status-overdue">
        <X size={12} />
      </button>
    </div>
  )
}

function DropZone({
  title, icon: Icon, count, zone, empty, children,
}: {
  title: string
  icon: typeof Filter
  count: number
  zone: Zone
  empty: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone::${zone}`, data: { kind: 'zone', zone } })
  return (
    <div
      ref={setNodeRef}
      className={`bg-surface-card border rounded-xl overflow-hidden transition-colors ${
        isOver ? 'border-[var(--accent)] ring-2 ring-accent/20' : 'border-border-default'
      }`}
    >
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-text-muted" />
          <span className="text-caption font-semibold text-text-primary uppercase tracking-[0.04em]">{title}</span>
        </div>
        <span className="text-micro text-text-muted">{count}</span>
      </div>
      <div className="p-4 min-h-[60px]">
        {count === 0 ? (
          <div className={`text-caption text-center py-4 border-2 border-dashed rounded-lg transition-colors ${
            isOver ? 'border-[var(--accent)] text-text-secondary' : 'border-border-subtle text-text-muted'
          }`}>
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function FilterChip({
  filter, field, onChange, onRemove,
}: {
  filter: ReportFilter
  field: DatasetField | undefined
  onChange: (patch: Partial<ReportFilter>) => void
  onRemove: () => void
}) {
  const operators = field?.filter_operators ?? []
  const showValue = !['is_null', 'is_not_null'].includes(filter.operator)
  const showSecondary = filter.operator === 'between'

  return (
    <div className="flex items-center gap-2 bg-surface-page border border-border-default rounded-lg px-2.5 py-1.5 mb-2">
      <span className="text-caption font-medium text-text-primary">{field?.label ?? filter.field}</span>
      <div className="min-w-[120px]">
        <FormSelect<FilterOperator>
          value={filter.operator}
          onChange={(v) => onChange({ operator: v })}
          ariaLabel="Filter operator"
          options={operators.map((op) => ({ value: op, label: FILTER_OPERATOR_LABELS[op] }))}
        />
      </div>
      {showValue && (
        field?.type === 'enum' && field.enum_values ? (
          <div className="flex-1 min-w-[120px]">
            <FormSelect
              value={filter.value ?? ''}
              onChange={(v) => onChange({ value: v })}
              ariaLabel="Filter value"
              placeholder="—"
              clearable
              options={field.enum_values.map((v) => ({ value: v, label: v }))}
            />
          </div>
        ) : (
          <input
            type={field?.type === 'date' || field?.type === 'datetime' ? 'date' : field?.type === 'number' ? 'number' : 'text'}
            className="bg-surface-card border border-border-default rounded-md px-2 py-0.5 text-micro text-text-primary flex-1 min-w-[120px]"
            value={filter.value ?? ''}
            placeholder="value"
            onChange={(e) => onChange({ value: e.target.value })}
          />
        )
      )}
      {showSecondary && (
        <input
          type={field?.type === 'date' || field?.type === 'datetime' ? 'date' : 'text'}
          className="bg-surface-card border border-border-default rounded-md px-2 py-0.5 text-micro text-text-primary flex-1 min-w-[100px]"
          value={filter.value_to ?? ''}
          placeholder="and"
          onChange={(e) => onChange({ value_to: e.target.value })}
        />
      )}
      <button onClick={onRemove} className="text-text-muted hover:text-status-overdue">
        <X size={12} />
      </button>
    </div>
  )
}

function PreviewTable({
  rows, columns, datasetKey,
}: { rows: Record<string, unknown>[]; columns: string[]; datasetKey: string }) {
  // When no columns are dragged yet, default to the dataset's declared field
  // keys rather than the raw row keys. Deriving from row keys surfaced BOTH the
  // raw FK (e.g. property_id, a UUID) and the embedded relation object
  // (e.g. properties) as separate columns; the field keys render relations once
  // via cellDisplay (which reads the embed) and never show the raw UUID.
  const previewDataset = getDataset(datasetKey)
  const cols = columns.length
    ? columns
    : previewDataset
      ? previewDataset.fields.map((f) => f.key)
      : (rows[0] ? Object.keys(rows[0]).filter((k) => k !== 'id') : [])
  // Plain semantic HTML <table> — NOT HeroUI's react-aria Table. The preview has
  // fully DYNAMIC columns (driven by the user's field selection) plus a debounced
  // re-render, which DETERMINISTICALLY tripped HeroUI v3's collection-build race
  // ("Found N cells and 0 columns") — a retry boundary can't fix a deterministic
  // throw, it just loops. A native table has no collection builder, so the race
  // cannot occur. (read-only preview; no react-aria features needed here.)
  return (
    <table className="w-full text-caption border-collapse">
      <thead>
        <tr className="border-b border-border-default">
          {cols.map((c) => {
            const f = getField(datasetKey, c)
            return (
              <th
                key={c}
                className="text-left py-2 px-3 text-[10px] font-medium text-text-muted uppercase tracking-[0.04em] whitespace-nowrap"
              >
                {f?.label ?? c}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={(row.id as string) ?? ri} className="border-b border-border-subtle hover:bg-surface-page">
            {cols.map((c) => (
              <td key={c} className="px-3 py-2 text-text-secondary whitespace-nowrap">
                {cellDisplay(row, c, getField(datasetKey, c))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Schedule modal ──────────────────────────────── */

function ScheduleModal({
  template,
  onClose,
  ensureTemplate,
}: {
  template: { id: string } | null
  onClose: () => void
  ensureTemplate: () => Promise<string>
}) {
  const createSchedule = useCreateReportSchedule()
  const { data: existingSchedules } = useReportSchedules(template?.id)
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [format, setFormat] = useState<'csv' | 'pdf' | 'html'>('csv')
  const [recipients, setRecipients] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const list = recipients.split(',').map((s) => s.trim()).filter(Boolean)
    if (!list.length) {
      toast.error('Add at least one recipient email')
      return
    }
    setSubmitting(true)
    try {
      const templateId = template?.id ?? (await ensureTemplate())
      await createSchedule.mutateAsync({
        template_id: templateId,
        frequency,
        format,
        recipients: list,
      })
      onClose()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create schedule')
    } finally {
      setSubmitting(false)
    }
  }

  // Wave 17C — schedule modal migrated to HeroUI <Modal>.
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
            <Modal.Heading>Schedule report</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-4">
            {!template && (
              <div className="text-caption text-text-secondary bg-surface-page border border-border-default rounded-md p-3">
                The current report will be saved as a template before scheduling.
              </div>
            )}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Frequency</label>
              <FormSelect<'daily' | 'weekly' | 'monthly'>
                value={frequency}
                onChange={setFrequency}
                ariaLabel="Frequency"
                options={[
                  { value: 'daily', label: 'Daily (07:00)' },
                  { value: 'weekly', label: 'Weekly (Mon 07:00)' },
                  { value: 'monthly', label: 'Monthly (1st @ 07:00)' },
                ]}
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Format</label>
              <FormSelect<'csv' | 'pdf' | 'html'>
                value={format}
                onChange={setFormat}
                ariaLabel="Format"
                options={[
                  { value: 'csv', label: 'CSV' },
                  { value: 'pdf', label: 'PDF (HTML)' },
                  { value: 'html', label: 'HTML' },
                ]}
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Recipients</label>
              <textarea
                rows={3}
                placeholder="alice@example.com, bob@example.com"
                className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 text-label text-text-primary"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
              />
              <p className="text-micro text-text-muted mt-1">Comma-separated email addresses.</p>
            </div>

            {existingSchedules && existingSchedules.length > 0 && (
              <div className="mt-2 border-t border-border-default pt-3">
                <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em] mb-2">Active schedules</p>
                <ul className="space-y-1.5">
                  {existingSchedules.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-micro">
                      <span className="text-text-secondary capitalize">{s.frequency} · {(s.format || 'csv').toUpperCase()}</span>
                      <span className="text-text-muted">
                        {s.last_run_at
                          ? `Last run ${new Date(s.last_run_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                          : 'Not run yet'}
                        {s.next_run_at
                          ? ` · Next ${new Date(s.next_run_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={onClose}>Cancel</Button>
            <Button variant="primary" onPress={submit} isDisabled={submitting}>
              <Plus size={14} /> Create schedule
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
