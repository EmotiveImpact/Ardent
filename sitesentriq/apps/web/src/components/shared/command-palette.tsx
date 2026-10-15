import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { startSpan, logEvent } from '@/lib/observability'
import {
  Search,
  Users,
  Building2,
  Package,
  ShieldCheck,
  Calendar,
  Briefcase,
  FolderOpen,
  FileBarChart,
  Receipt,
  ScrollText,
  AlertTriangle,
  HardHat,
  Truck,
  BookOpen,
  ArrowRight,
  Clock,
  Sparkles,
  CornerDownLeft,
  ShoppingCart,
  MapPinned,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useUniversalSearch,
  ENTITY_LABELS,
  ENTITY_ORDER,
  type EntityKind,
  type SearchHit,
} from '@/hooks/use-universal-search'

const RECENT_KEY = 'fos:cmdk:recent'
const MAX_RECENT = 5

const ENTITY_ICON: Record<EntityKind, LucideIcon> = {
  client: Users,
  property: Building2,
  asset: Package,
  job: Briefcase,
  compliance: ShieldCheck,
  engineer: HardHat,
  contract: ScrollText,
  action: AlertTriangle,
  kb: BookOpen,
  document: FolderOpen,
}

interface QuickAction {
  id: string
  label: string
  shortcut?: string
  path: string
  icon: LucideIcon
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa-job', label: 'New Job', path: '/dashboard/jobs/new', icon: Briefcase },
  { id: 'qa-quote', label: 'New Quote', path: '/dashboard/quotes/new', icon: FileBarChart },
  { id: 'qa-invoice', label: 'New Invoice', path: '/dashboard/invoices/new', icon: Receipt },
  { id: 'qa-purchase-order', label: 'New Purchase Order', path: '/dashboard/purchase-orders/new', icon: ShoppingCart },
  { id: 'qa-client', label: 'New Client', path: '/dashboard/clients/new', icon: Users },
  { id: 'qa-property', label: 'New Property', path: '/dashboard/properties/new', icon: Building2 },
  { id: 'qa-asset', label: 'New Asset', path: '/dashboard/assets/new', icon: Package },
  { id: 'qa-action', label: 'New Action', path: '/dashboard/actions/new', icon: AlertTriangle },
  { id: 'qa-contract', label: 'New Contract', path: '/dashboard/contracts/new', icon: ScrollText },
  { id: 'qa-engineer', label: 'New Engineer', path: '/dashboard/engineers/new', icon: HardHat },
  { id: 'qa-subcontractor', label: 'New Subcontractor', path: '/dashboard/subcontractors/new', icon: Truck },
]

const NAVIGATE_ACTIONS: QuickAction[] = [
  { id: 'nav-dashboard', label: 'Dashboard', path: '/dashboard', icon: Calendar },
  { id: 'nav-clients', label: 'Clients', path: '/dashboard/clients', icon: Users },
  { id: 'nav-properties', label: 'Properties', path: '/dashboard/properties', icon: Building2 },
  { id: 'nav-assets', label: 'Assets', path: '/dashboard/assets', icon: Package },
  { id: 'nav-compliance', label: 'Compliance', path: '/dashboard/compliance', icon: ShieldCheck },
  { id: 'nav-jobs', label: 'Jobs', path: '/dashboard/jobs', icon: Briefcase },
  { id: 'nav-engineer-tracker', label: 'Engineer Tracker', path: '/dashboard/engineer-tracker', icon: MapPinned },
  { id: 'nav-purchase-orders', label: 'Purchase Orders', path: '/dashboard/purchase-orders', icon: ShoppingCart },
  { id: 'nav-actions', label: 'Actions', path: '/dashboard/actions', icon: AlertTriangle },
  { id: 'nav-contracts', label: 'Contracts', path: '/dashboard/contracts', icon: ScrollText },
  { id: 'nav-engineers', label: 'Engineers', path: '/dashboard/engineers', icon: HardHat },
  { id: 'nav-knowledge-base', label: 'Knowledge Base', path: '/dashboard/knowledge-base', icon: BookOpen },
]

function loadRecent(): SearchHit[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SearchHit[]) : []
  } catch {
    return []
  }
}

function pushRecent(hit: SearchHit) {
  try {
    const existing = loadRecent().filter((h) => h.id !== hit.id || h.kind !== hit.kind)
    const next = [hit, ...existing].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** Highlight matched substring inside `text` (case-insensitive). */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-500/20 text-brand-500 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

interface PaletteRow {
  key: string
  type: 'hit' | 'quick' | 'recent' | 'nav'
  label: string
  subtitle?: string
  path: string
  icon: LucideIcon
  group: string
  hit?: SearchHit
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [recent, setRecent] = useState<SearchHit[]>([])
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim()
  const { data: hits, isFetching } = useUniversalSearch(trimmed)

  // Keyboard: open / close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          // Only emit the breadcrumb when actually opening (not toggling closed).
          if (!o) logEvent('command_palette.open')
          return !o
        })
        setQuery('')
        setSelected(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input + load recents on open
  useEffect(() => {
    if (open) {
      setRecent(loadRecent())
      window.setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    setSelected(0)
  }, [query])

  // Build flat row list for keyboard navigation
  const rows = useMemo<PaletteRow[]>(() => {
    if (!trimmed) {
      const list: PaletteRow[] = []
      QUICK_ACTIONS.forEach((qa) =>
        list.push({
          key: qa.id,
          type: 'quick',
          label: qa.label,
          path: qa.path,
          icon: qa.icon,
          group: 'Quick Actions',
        }),
      )
      recent.forEach((r) =>
        list.push({
          key: `recent-${r.kind}-${r.id}`,
          type: 'recent',
          label: r.title,
          subtitle: r.subtitle,
          path: r.path,
          icon: ENTITY_ICON[r.kind] ?? Search,
          group: 'Recent',
          hit: r,
        }),
      )
      NAVIGATE_ACTIONS.forEach((na) =>
        list.push({
          key: na.id,
          type: 'nav',
          label: na.label,
          path: na.path,
          icon: na.icon,
          group: 'Navigate',
        }),
      )
      return list
    }

    const list: PaletteRow[] = []
    if (hits && hits.length > 0) {
      ENTITY_ORDER.forEach((kind) => {
        const group = hits.filter((h) => h.kind === kind)
        group.forEach((h) =>
          list.push({
            key: `${h.kind}-${h.id}`,
            type: 'hit',
            label: h.title,
            subtitle: h.subtitle,
            path: h.path,
            icon: ENTITY_ICON[h.kind] ?? Search,
            group: ENTITY_LABELS[h.kind],
            hit: h,
          }),
        )
      })
    }

    // Always offer matching nav as a fallback
    NAVIGATE_ACTIONS.filter((n) => n.label.toLowerCase().includes(trimmed.toLowerCase())).forEach(
      (na) =>
        list.push({
          key: na.id,
          type: 'nav',
          label: na.label,
          path: na.path,
          icon: na.icon,
          group: 'Navigate',
        }),
    )
    return list
  }, [trimmed, hits, recent])

  const groupedKeys = useMemo(() => {
    const seen: string[] = []
    rows.forEach((r) => {
      if (!seen.includes(r.group)) seen.push(r.group)
    })
    return seen
  }, [rows])

  const choose = (row: PaletteRow) => {
    if (row.hit) pushRecent(row.hit)
    navigate(row.path)
    setOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, Math.max(rows.length - 1, 0)))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    }
    if (e.key === 'Enter' && rows[selected]) {
      e.preventDefault()
      const target = rows[selected]
      startSpan(`command_palette.select:${target.key}`, 'ui.action', () => {
        choose(target)
      })
    }
  }

  // Scroll selected row into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-row-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Wave G1 a11y — backdrop is now a real <button> so it's reachable
          by keyboard / SR and announces a meaningful action. aria-hidden
          + tabIndex=-1 so the listbox above isn't drowned out by the
          backdrop announcement; ESC handler at line ~162 still owns the
          dismiss behavior. */}
      <button
        type="button"
        aria-label="Close command palette"
        aria-hidden
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
      />
      <div className="relative w-full max-w-xl mx-4 bg-surface-card border border-border-default rounded-xl shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search clients, jobs, assets, articles..."
            className="flex-1 text-body bg-transparent outline-none text-text-primary placeholder:text-text-muted"
          />
          {isFetching && (
            <span className="text-[10px] text-text-muted uppercase tracking-wider">
              Searching
            </span>
          )}
          <kbd className="text-[10px] font-medium text-text-muted bg-surface-elevated border border-border-default px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {rows.length === 0 ? (
            <p className="text-center text-label text-text-muted py-8">
              {trimmed
                ? `No results for "${trimmed}"`
                : 'Start typing to search across your workspace'}
            </p>
          ) : (
            groupedKeys.map((group) => (
              <div key={group}>
                <p className="flex items-center gap-1.5 px-4 py-1.5 text-micro font-semibold text-text-muted uppercase tracking-[0.06em]">
                  {group === 'Quick Actions' && <Sparkles size={11} className="text-brand-500" />}
                  {group === 'Recent' && <Clock size={11} className="text-text-muted" />}
                  {group}
                </p>
                {rows
                  .map((row, idx) => ({ row, idx }))
                  .filter(({ row }) => row.group === group)
                  .map(({ row, idx }) => {
                    const isSelected = idx === selected
                    const Icon = row.icon
                    return (
                      <button
                        key={row.key}
                        data-row-idx={idx}
                        onMouseEnter={() => setSelected(idx)}
                        onClick={() => choose(row)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected
                            ? 'bg-brand-500/10 text-text-primary'
                            : 'text-text-secondary hover:bg-surface-elevated'
                        }`}
                      >
                        <Icon
                          size={15}
                          className={isSelected ? 'text-brand-500' : 'text-text-muted'}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-label font-medium truncate">
                            <Highlight text={row.label} query={trimmed} />
                          </p>
                          {row.subtitle && (
                            <p className="text-micro text-text-muted truncate">
                              <Highlight text={row.subtitle} query={trimmed} />
                            </p>
                          )}
                        </div>
                        {isSelected ? (
                          <CornerDownLeft size={13} className="text-brand-500 flex-shrink-0" />
                        ) : (
                          <ArrowRight size={13} className="text-text-muted/40 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-3 text-micro text-text-muted">
          <span>
            <kbd className="bg-surface-elevated border border-border-default px-1 rounded">↑↓</kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="bg-surface-elevated border border-border-default px-1 rounded">↵</kbd>{' '}
            select
          </span>
          <span>
            <kbd className="bg-surface-elevated border border-border-default px-1 rounded">⌘K</kbd>{' '}
            toggle
          </span>
        </div>
      </div>
    </div>
  )
}
