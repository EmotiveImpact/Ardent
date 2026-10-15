// Wave 17C — ShortcutsHelp migrated to HeroUI v3 <Modal>. Focus trap +
// ESC + click-outside-to-close are now handled by HeroUI for free.
//
// Custom behaviour we preserve manually:
//   - Pressing `?` while open also closes the help — listened on the
//     window so it works regardless of which element has focus.
import { useEffect } from 'react'
import { Modal } from '@haumea/ui'

interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

interface ShortcutRow {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  rows: ShortcutRow[]
}

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['Esc'], description: 'Close any modal, palette, or overlay' },
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'J'], description: 'Go to Jobs' },
      { keys: ['G', 'C'], description: 'Go to Clients' },
      { keys: ['G', 'P'], description: 'Go to Properties' },
      { keys: ['G', 'I'], description: 'Go to Insights' },
    ],
  },
  {
    title: 'Actions',
    rows: [
      { keys: ['N'], description: 'New — context-sensitive (job, client, etc.)' },
      { keys: ['/'], description: 'Focus search (opens command palette)' },
      { keys: ['R'], description: 'Refresh data on the current page' },
    ],
  },
  {
    title: 'Editing (when focused inside a form)',
    rows: [
      { keys: ['⌘', 'S'], description: 'Save current form' },
      { keys: ['⌘', '↵'], description: 'Submit current form' },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { keys: ['Shift', 'Click'], description: 'Range select rows on a table' },
      { keys: ['⌘', 'A'], description: 'Select all visible rows' },
    ],
  },
]

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 py-0.5 rounded-md bg-surface-elevated border border-border-default text-text-secondary text-micro font-mono font-medium leading-none">
      {children}
    </kbd>
  )
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  // Press `?` while open closes the help — preserved from the prior
  // implementation. ESC, focus trap, and Tab cycling are handled by
  // HeroUI's <Modal>.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog className="sm:max-w-[560px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Keyboard Shortcuts</Modal.Heading>
            <p className="text-micro text-text-muted mt-0.5">
              Move around without ever touching the mouse.
            </p>
          </Modal.Header>
          <Modal.Body>
            <div className="space-y-5">
              {SECTIONS.map((section) => (
                <section key={section.title}>
                  <h3 className="text-micro font-semibold text-text-muted uppercase tracking-[0.06em] mb-2">
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {section.rows.map((row) => (
                      <li
                        key={row.description}
                        className="flex items-center justify-between gap-4 py-1"
                      >
                        <span className="text-label text-text-secondary">{row.description}</span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {row.keys.map((k, idx) => (
                            <span key={`${row.description}-${k}-${idx}`} className="flex items-center gap-1">
                              {idx > 0 && (
                                <span className="text-[10px] text-text-muted">
                                  {k === 'Click' ? '+' : 'then'}
                                </span>
                              )}
                              <Keycap>{k}</Keycap>
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer className="justify-center">
            <p className="text-micro text-text-muted">
              Press <Keycap>?</Keycap> again to close
            </p>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
