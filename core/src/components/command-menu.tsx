import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { CornerDownLeft, MapPin, Search, User, Wrench } from 'lucide-react'
import { nav } from '@/components/layout/sidebar'
import { Badge } from '@/components/ui/badge'
import { byId, customers, jobs, sites } from '@/data/mock'
import { statusMeta } from '@/lib/format'

let opener: () => void = () => {}
export const openCommandMenu = () => opener()

const itemClass =
  'flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-[13px] text-muted outline-none data-[selected=true]:bg-raised data-[selected=true]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0'

const groupClass =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase'

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  opener = () => setOpen(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[3px] data-[state=open]:animate-[rise_200ms_ease-out]" />
        <D.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 outline-none">
          <D.Title className="sr-only">Search Ardent</D.Title>
          <Command
            loop
            className="panel-edge overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[0_40px_80px_-20px_#000]"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-3.5">
              <Search className="size-4 text-faint" />
              <Command.Input
                autoFocus
                placeholder="Jump to a job, customer, postcode or screen"
                className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
              />
              <kbd className="rounded border border-line-strong px-1.5 font-mono text-[10px] text-faint">esc</kbd>
            </div>
            <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">Nothing matches that.</Command.Empty>

              <Command.Group heading="Jobs" className={groupClass}>
                {jobs.map((j) => {
                  const site = byId(sites, j.siteId)
                  const c = byId(customers, j.customerId)
                  return (
                    <Command.Item
                      key={j.id}
                      value={`${j.ref} ${j.title} ${c?.name} ${site?.postcode} ${site?.line1}`}
                      onSelect={() => go(`/jobs/${j.id}`)}
                      className={itemClass}
                    >
                      <Wrench />
                      <span className="font-mono text-[12px] text-faint">{j.ref}</span>
                      <span className="truncate text-foreground">{j.title}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="font-mono text-[11px] text-faint">{site?.postcode}</span>
                        <Badge tone={statusMeta[j.status].tone}>{statusMeta[j.status].label}</Badge>
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>

              <Command.Group heading="Customers" className={groupClass}>
                {customers.map((c) => {
                  const site = sites.find((s) => s.customerId === c.id)
                  return (
                    <Command.Item key={c.id} value={`${c.name} ${c.phone} ${site?.postcode}`} onSelect={() => go('/customers')} className={itemClass}>
                      <User />
                      <span className="text-foreground">{c.name}</span>
                      <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-faint">
                        <MapPin className="size-3" /> {site?.postcode}
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>

              <Command.Group heading="Go to" className={groupClass}>
                {nav.filter(Boolean).map((n) => {
                  if (!n) return null
                  const Icon = n.icon
                  return (
                    <Command.Item key={n.to} value={`go ${n.label}`} onSelect={() => go(n.to)} className={itemClass}>
                      <Icon />
                      <span className="text-foreground">{n.label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-3.5 py-2 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <CornerDownLeft className="size-3" /> open
              </span>
              <span>↑ ↓ move</span>
              <span className="ml-auto">Ardent Core</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
