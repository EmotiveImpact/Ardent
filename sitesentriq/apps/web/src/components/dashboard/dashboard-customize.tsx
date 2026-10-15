// "Customise dashboard" modal (trust wave W1-T4): show/hide + reorder the
// dashboard widgets, persisted per-user (00115). Reordering is zone-aware —
// up/down moves a widget within its own zone (full-width stack vs left
// column), which keeps the layout sane and is fully keyboard-accessible.

import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Switch } from '@haumea/ui'
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  mergeLayout,
  moveWithinZone,
  widgetMeta,
  type DashboardLayoutEntry,
} from '@/lib/dashboard-widgets'
import {
  useDashboardPrefs,
  useResetDashboardPrefs,
  useSaveDashboardPrefs,
} from '@/hooks/use-dashboard-prefs'

const ZONE_LABEL: Record<string, string> = {
  main: 'Full-width sections',
  left: 'Feed column',
  rail: 'Activity rail',
}

export function DashboardCustomize() {
  const [open, setOpen] = useState(false)
  const { data: savedLayout } = useDashboardPrefs()
  const savePrefs = useSaveDashboardPrefs()
  const resetPrefs = useResetDashboardPrefs()
  const [draft, setDraft] = useState<DashboardLayoutEntry[]>([])

  // Seed the draft from the saved layout ONLY on the open transition — not on
  // every savedLayout reference change. A background refetch (refetch-on-focus)
  // produces a fresh array; depending on it here would overwrite the user's
  // in-progress reorder/toggle mid-edit. We read the latest savedLayout via a
  // ref so the seed is current without making it a reactive dependency.
  const savedLayoutRef = useRef(savedLayout)
  savedLayoutRef.current = savedLayout
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(mergeLayout(savedLayoutRef.current))
    wasOpen.current = open
  }, [open])

  const toggle = (key: string) =>
    setDraft((prev) => prev.map((e) => (e.key === key ? { ...e, hidden: !e.hidden } : e)))

  const save = () => {
    savePrefs.mutate(draft, {
      onSuccess: () => {
        toast.success('Dashboard layout saved')
        setOpen(false)
      },
      onError: (err: Error) => toast.error(err.message || 'Failed to save layout'),
    })
  }

  const reset = () => {
    resetPrefs.mutate(undefined, {
      onSuccess: () => {
        toast.success('Dashboard reset to default')
        setOpen(false)
      },
      onError: (err: Error) => toast.error(err.message || 'Failed to reset'),
    })
  }

  // Group draft indices per zone so each section lists its own widgets in order.
  const zones: Array<{ zone: string; indices: number[] }> = ['main', 'left', 'rail'].map(
    (zone) => ({
      zone,
      indices: draft
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => widgetMeta(e.key)?.zone === zone)
        .map(({ i }) => i),
    }),
  )

  return (
    <>
      <Button variant="outline" size="sm" onPress={() => setOpen(true)}>
        <SlidersHorizontal size={14} /> Customise
      </Button>

      <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && setOpen(false)}>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Customise dashboard</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-5">
                {zones.map(({ zone, indices }) => (
                  <div key={zone}>
                    <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-2">
                      {ZONE_LABEL[zone]}
                    </p>
                    <ul className="space-y-1">
                      {indices.map((i, posInZone) => {
                        const entry = draft[i]
                        const meta = widgetMeta(entry.key)!
                        return (
                          <li
                            key={entry.key}
                            className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-label text-text-primary">{meta.label}</p>
                              <p className="text-caption text-text-muted truncate">
                                {meta.description}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Move ${meta.label} up`}
                                isDisabled={posInZone === 0}
                                onPress={() => setDraft((prev) => moveWithinZone(prev, i, -1))}
                              >
                                <ArrowUp size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Move ${meta.label} down`}
                                isDisabled={posInZone === indices.length - 1}
                                onPress={() => setDraft((prev) => moveWithinZone(prev, i, 1))}
                              >
                                <ArrowDown size={14} />
                              </Button>
                              <Switch
                                isSelected={!entry.hidden}
                                onChange={() => toggle(entry.key)}
                                size="sm"
                                aria-label={`Show ${meta.label}`}
                              />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <div className="flex w-full items-center justify-between gap-2">
                <Button variant="ghost" size="sm" isDisabled={resetPrefs.isPending} onPress={reset}>
                  Reset to default
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onPress={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" isDisabled={savePrefs.isPending} onPress={save}>
                    {savePrefs.isPending ? 'Saving…' : 'Save layout'}
                  </Button>
                </div>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
