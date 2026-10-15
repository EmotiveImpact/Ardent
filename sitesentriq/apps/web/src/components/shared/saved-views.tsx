import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Star, X, Bookmark, Lightbulb } from 'lucide-react'
import { Button } from '@haumea/ui'
import { toast } from 'sonner'

export interface ViewFilter {
  status?: string | string[]
  priority?: string | string[]
  due?: 'overdue' | 'today' | 'this_week' | 'this_month'
  assignee?: 'me' | string
  unpaid?: boolean
  source?: 'portal_callout'
  [key: string]: unknown
}

export interface SavedView {
  id: string
  label: string
  filters: ViewFilter
  builtIn?: boolean
}

interface SavedViewsProps {
  /** Used as the localStorage key suffix and entity-specific built-ins */
  entity: 'jobs' | 'compliance' | 'actions' | 'invoices' | 'documents'
  activeViewId: string | null
  onChange: (view: SavedView | null) => void
  /** Optional: caller passes a "match count" so we can offer smart suggestions */
  smartSuggestion?: { label: string; filters: ViewFilter; count: number } | null
}

const STORAGE_PREFIX = 'haumea_saved_views_'

const BUILT_IN_VIEWS: Record<SavedViewsProps['entity'], SavedView[]> = {
  jobs: [
    { id: 'all', label: 'All', filters: {}, builtIn: true },
    { id: 'my-open', label: 'My open', filters: { status: ['scheduled', 'in_progress'], assignee: 'me' }, builtIn: true },
    { id: 'due-week', label: 'Due this week', filters: { due: 'this_week' }, builtIn: true },
    { id: 'high-priority', label: 'High priority', filters: { priority: ['high', 'urgent'] }, builtIn: true },
    { id: 'overdue', label: 'Overdue', filters: { due: 'overdue' }, builtIn: true },
    { id: 'portal-callouts', label: 'Portal call-outs', filters: { source: 'portal_callout' }, builtIn: true },
  ],
  compliance: [
    { id: 'all', label: 'All', filters: {}, builtIn: true },
    { id: 'overdue', label: 'Overdue', filters: { status: 'overdue' }, builtIn: true },
    { id: 'due-soon', label: 'Due soon', filters: { status: 'due_soon' }, builtIn: true },
    { id: 'compliant', label: 'Compliant', filters: { status: 'compliant' }, builtIn: true },
    { id: 'non-compliant', label: 'Non-compliant', filters: { status: 'non_compliant' }, builtIn: true },
  ],
  actions: [
    { id: 'all', label: 'All', filters: {}, builtIn: true },
    { id: 'my-open', label: 'My open', filters: { status: ['open', 'in_progress'], assignee: 'me' }, builtIn: true },
    { id: 'high-priority', label: 'High priority', filters: { priority: ['high', 'critical'] }, builtIn: true },
    { id: 'overdue', label: 'Overdue', filters: { due: 'overdue' }, builtIn: true },
  ],
  invoices: [
    { id: 'all', label: 'All', filters: {}, builtIn: true },
    { id: 'unpaid', label: 'Unpaid', filters: { status: ['draft', 'sent', 'overdue'] }, builtIn: true },
    { id: 'overdue', label: 'Overdue', filters: { status: 'overdue' }, builtIn: true },
    { id: 'paid', label: 'Paid', filters: { status: 'paid' }, builtIn: true },
  ],
  documents: [
    { id: 'all', label: 'All', filters: {}, builtIn: true },
    { id: 'expiring', label: 'Expiring soon', filters: { due: 'this_month' }, builtIn: true },
  ],
}

function builtInIdsFor(entity: SavedViewsProps['entity']): Set<string> {
  return new Set((BUILT_IN_VIEWS[entity] ?? []).map((view) => view.id))
}

function sanitizeCustomViews(entity: SavedViewsProps['entity'], views: SavedView[]): SavedView[] {
  const reservedIds = builtInIdsFor(entity)
  const seen = new Set<string>()

  return views
    .filter((view): view is SavedView => {
      if (!view || typeof view.id !== 'string' || typeof view.label !== 'string') return false
      if (reservedIds.has(view.id) || seen.has(view.id)) return false
      seen.add(view.id)
      return true
    })
    .map((view) => ({
      id: view.id,
      label: view.label,
      filters: view.filters && typeof view.filters === 'object' ? view.filters : {},
      builtIn: false,
    }))
}

function loadCustomViews(entity: SavedViewsProps['entity']): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + entity)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? sanitizeCustomViews(entity, parsed as SavedView[]) : []
    }
  } catch {
    /* ignore */
  }
  return []
}

function saveCustomViews(entity: SavedViewsProps['entity'], views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + entity, JSON.stringify(sanitizeCustomViews(entity, views)))
  } catch {
    /* ignore */
  }
}

export function SavedViews({ entity, activeViewId, onChange, smartSuggestion }: SavedViewsProps) {
  const [customViews, setCustomViews] = useState<SavedView[]>(() => loadCustomViews(entity))
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    saveCustomViews(entity, customViews)
  }, [entity, customViews])

  const allViews = useMemo(() => {
    const builtInViews = BUILT_IN_VIEWS[entity] ?? []
    return [...builtInViews, ...sanitizeCustomViews(entity, customViews)]
  }, [entity, customViews])

  const handleSelect = useCallback(
    (id: string) => {
      const view = allViews.find((v) => v.id === id)
      onChange(view ?? null)
    },
    [allViews, onChange]
  )

  const handleCreate = useCallback(() => {
    const label = newLabel.trim()
    if (!label) {
      toast.error('Enter a name for your view')
      return
    }
    const newView: SavedView = {
      id: `custom-${Date.now()}`,
      label,
      // Snapshot the current active view's filters as a starting point
      filters: allViews.find((v) => v.id === activeViewId)?.filters ?? {},
    }
    setCustomViews((prev) => [...prev, newView])
    setNewLabel('')
    setCreating(false)
    toast.success(`Saved view "${label}"`)
    onChange(newView)
  }, [newLabel, allViews, activeViewId, onChange])

  const handleSuggestionAccept = useCallback(() => {
    if (!smartSuggestion) return
    const newView: SavedView = {
      id: `custom-${Date.now()}`,
      label: smartSuggestion.label,
      filters: smartSuggestion.filters,
    }
    setCustomViews((prev) => [...prev, newView])
    onChange(newView)
    toast.success(`Saved view "${smartSuggestion.label}"`)
  }, [smartSuggestion, onChange])

  const handleDelete = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setCustomViews((prev) => prev.filter((v) => v.id !== id))
      if (activeViewId === id) onChange(null)
      toast.success('View removed')
    },
    [activeViewId, onChange]
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <AnimatePresence initial={false}>
        {allViews.map((view) => {
          const isActive = activeViewId === view.id
          return (
            <motion.button
              key={view.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              type="button"
              onClick={() => handleSelect(view.id)}
              className={`group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-caption font-medium transition-colors border ${
                isActive
                  ? 'bg-brand-500/10 border-brand-500/40 text-text-accent'
                  : 'bg-surface-elevated/40 border-border-default text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
              }`}
            >
              {view.builtIn ? <Star size={11} /> : <Bookmark size={11} />}
              {view.label}
              {!view.builtIn && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleDelete(view.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleDelete(view.id, e as unknown as React.MouseEvent)
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-metric-rose cursor-pointer"
                  aria-label={`Delete view ${view.label}`}
                >
                  <X size={11} />
                </span>
              )}
            </motion.button>
          )
        })}
        </AnimatePresence>

        {!creating ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setCreating(true)}
            className="h-7 px-2.5"
          >
            <Plus size={12} /> New view
          </Button>
        ) : (
          <div className="inline-flex items-center gap-1 h-7">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewLabel('')
                }
              }}
              placeholder="View name…"
              className="h-7 px-2 rounded-full text-caption bg-surface-elevated border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 w-32"
            />
            <Button variant="primary" size="sm" onPress={handleCreate} className="h-7 px-2">
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setCreating(false)
                setNewLabel('')
              }}
              className="h-7 px-2"
            >
              <X size={12} />
            </Button>
          </div>
        )}
      </div>

      {smartSuggestion && smartSuggestion.count > 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-caption">
          <Lightbulb size={12} className="text-brand-500" />
          <span className="text-text-secondary">
            {smartSuggestion.count} match "{smartSuggestion.label}"
          </span>
          <button
            type="button"
            onClick={handleSuggestionAccept}
            className="text-brand-500 hover:text-brand-400 font-medium"
          >
            Save as view →
          </button>
        </div>
      )}
    </div>
  )
}
