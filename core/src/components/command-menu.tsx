import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { clock, customerKind, invoiceStatus, jobStatus, pounds, quoteStatus, shortDate, totals, type Tone } from '@kit'
import { nav } from '@/components/layout/sidebar'
import { Icon } from '@/components/layout/icons'
import { useBook, type Book } from '@/data/ardent'
import { find, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * Search: one box for jobs, customers, addresses and postcodes, quotes and
 * invoices, plus somewhere to go. Opened by ⌘K, / and the top bar.
 */

let opener: () => void = () => {}
export const openCommandMenu = () => opener()

interface Row {
  id: string
  to: string
  ref?: string
  title: string
  detail?: string
  state?: string
  tone?: Tone
  hay: string
}

interface Group {
  label: string
  rows: Row[]
}

const dot: Record<Tone, string> = {
  ok: 'bg-ok',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
  violet: 'bg-violet',
  neutral: 'bg-muted',
  faint: 'bg-faint',
  // Ember belongs to one thing per screen; in a list it reads as grey.
  ember: 'bg-faint',
}

const norm = (s: string) => s.toLowerCase()

/** Every word typed has to be somewhere in the row; postcodes match with or without the space. */
function matches(hay: string, words: string[]) {
  const squashed = hay.replace(/\s+/g, '')
  return words.every((w) => hay.includes(w) || squashed.includes(w))
}

function buildRows(book: Book) {
  const customer = (id: string) => find(book.customers, id)
  const site = (id: string) => find(book.sites, id)
  const jobs: Row[] = [...book.jobs]
    .sort((a, b) => b.start.localeCompare(a.start))
    .map((j) => {
      const c = customer(j.customerId)
      const s = site(j.siteId)
      return {
        id: j.id,
        to: `/jobs/${j.id}`,
        ref: j.ref,
        title: j.title,
        detail: [c?.name, s?.line1, onDay(j.start, today()) ? `today ${clock(j.start)}` : (s?.postcode ?? '')].filter(Boolean).join(', '),
        state: jobStatus[j.status].label,
        tone: jobStatus[j.status].tone,
        hay: norm(`${j.ref} ${j.title} ${c?.name} ${s?.line1} ${s?.town} ${s?.postcode} ${j.trade}`),
      }
    })
  const customers: Row[] = book.customers.map((c) => {
    const n = book.jobs.filter((j) => j.customerId === c.id).length
    const sites = book.sites.filter((s) => s.customerId === c.id)
    return {
      id: c.id,
      to: `/customers/${c.id}`,
      title: c.name,
      detail: [c.phone, `${n} ${n === 1 ? 'job' : 'jobs'}`, c.balance > 0 ? `owes ${pounds(c.balance)}` : 'owes nothing'].join(' · '),
      state: customerKind[c.kind],
      tone: 'faint',
      hay: norm(`${c.name} ${c.phone} ${c.phone.replace(/\s/g, '')} ${c.email ?? ''} ${sites.map((s) => `${s.line1} ${s.postcode}`).join(' ')}`),
    }
  })
  const places: Row[] = book.sites.map((s) => ({
    id: s.id,
    to: `/customers/${s.customerId}`,
    ref: s.postcode,
    title: `${s.line1}, ${s.town}`,
    detail: customer(s.customerId)?.name,
    hay: norm(`${s.line1} ${s.town} ${s.postcode} ${customer(s.customerId)?.name}`),
  }))
  const quotes: Row[] = book.quotes.map((q) => {
    const j = find(book.jobs, q.jobId)
    return {
      id: q.id,
      to: `/quotes/${q.id}`,
      ref: q.ref,
      title: j?.title ?? 'Quote',
      detail: [customer(q.customerId)?.name, pounds(totals({ lines: q.lines }).total, { always: true }), q.sentAt ? `sent ${shortDate(q.sentAt)}` : 'not sent'].filter(Boolean).join(' · '),
      state: quoteStatus[q.status].label,
      tone: quoteStatus[q.status].tone,
      hay: norm(`${q.ref} ${j?.title} ${j?.ref} ${customer(q.customerId)?.name} ${site(j?.siteId ?? '')?.line1 ?? ''} ${site(j?.siteId ?? '')?.postcode ?? ''}`),
    }
  })
  const invoices: Row[] = book.invoices.map((inv) => {
    const j = find(book.jobs, inv.jobId)
    return {
      id: inv.id,
      to: `/invoices/${inv.id}`,
      ref: inv.ref,
      title: customer(inv.customerId)?.name ?? 'Invoice',
      detail: [j?.title, pounds(totals(inv).total, { always: true }), inv.dueAt ? `due ${shortDate(inv.dueAt)}` : ''].filter(Boolean).join(' · '),
      state: invoiceStatus[inv.status].label,
      tone: invoiceStatus[inv.status].tone,
      hay: norm(`${inv.ref} ${j?.title} ${j?.ref} ${customer(inv.customerId)?.name} ${site(j?.siteId ?? '')?.line1 ?? ''} ${site(j?.siteId ?? '')?.postcode ?? ''}`),
    }
  })
  return { jobs, customers, places, quotes, invoices }
}

const doRows: Row[] = [
  { id: 'do_job', to: '/jobs/new', title: 'New job', detail: 'Who, where and what, then a free slot', hay: 'new job book' },
  { id: 'do_callout', to: '/callout', title: 'Emergency callout', detail: 'Someone on the phone needs help now', hay: 'emergency callout call out' },
  { id: 'do_quote', to: '/jobs/new?for=quote', title: 'New quote', detail: 'Log an enquiry and price it', hay: 'new quote enquiry' },
  { id: 'do_invoice', to: '/invoices/new', title: 'New invoice', detail: 'Bill a finished job', hay: 'new invoice bill' },
]

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { data: book } = useBook()

  useEffect(() => {
    opener = () => setOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen((o) => {
          if (o) setQ('')
          return !o
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggle = (on: boolean) => {
    setOpen(on)
    if (!on) setQ('')
  }

  const all = useMemo(() => (book ? buildRows(book) : undefined), [book])

  const groups: Group[] = useMemo(() => {
    if (!all) return []
    const words = norm(q).trim().split(/\s+/).filter(Boolean)
    const goTo: Row[] = nav.filter((n) => !!n).map((n) => ({ id: `go_${n.to}`, to: n.to, title: n.label, hay: norm(`go ${n.label}`) }))
    goTo.push({ id: 'go_settings', to: '/settings', title: 'Settings', hay: 'go settings' })
    if (!words.length) {
      const day = today()
      const todays = all.jobs.filter((r) => onDay(find(book!.jobs, r.id)!.start, day)).reverse()
      return [
        { label: "Today's jobs", rows: todays.slice(0, 6) },
        { label: 'Do', rows: doRows },
        { label: 'Go to', rows: goTo },
      ]
    }
    const hit = (rows: Row[], n: number) => rows.filter((r) => matches(r.hay, words)).slice(0, n)
    const places = hit(all.places, 4)
    const doThis: Row[] = places.slice(0, 1).map((r) => ({ id: `do_at_${r.id}`, to: `/jobs/new?site=${r.id}`, title: `New job at ${r.title.split(',')[0]}`, detail: r.detail, hay: '' }))
    return [
      { label: 'Jobs', rows: hit(all.jobs, 5) },
      { label: 'Customers', rows: hit(all.customers, 4) },
      { label: 'Addresses and postcodes', rows: places },
      { label: 'Quotes', rows: hit(all.quotes, 4) },
      { label: 'Invoices', rows: hit(all.invoices, 4) },
      { label: 'Do', rows: [...doThis, ...hit(doRows, 4)] },
      { label: 'Go to', rows: hit(goTo, 4) },
    ].filter((g) => g.rows.length)
  }, [all, book, q])

  const go = (to: string) => {
    toggle(false)
    navigate(to)
  }

  return (
    <D.Root open={open} onOpenChange={toggle}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[3px]" />
        <D.Content className="fixed top-[8vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[760px] -translate-x-1/2 outline-none">
          <D.Title className="sr-only">Search Ardent</D.Title>
          <D.Description className="sr-only">Find a job, customer, address, postcode, quote or invoice, or go somewhere.</D.Description>
          <Command loop shouldFilter={false} label="Search Ardent" className="flex max-h-[84vh] flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_30px_80px_rgba(0,0,0,.6)]">
            <div className="flex h-[62px] shrink-0 items-center gap-3 px-5 shadow-[inset_0_-1px_0_var(--line)]">
              <Icon name="search" className="size-[18px] text-muted" strokeWidth={1.8} />
              <Command.Input
                autoFocus
                value={q}
                onValueChange={setQ}
                placeholder="Find a job, customer, postcode or invoice"
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-faint sm:text-[18px]"
              />
              <button type="button" onClick={() => toggle(false)} className="rounded font-mono text-[11px] text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                ESC
              </button>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-2 pb-2.5">
              {!book && <Command.Loading className="px-3 py-8 text-center text-[13px] text-muted">Opening the books…</Command.Loading>}
              {book && groups.length === 0 && <p className="px-3 py-10 text-center text-[14px] text-muted">Nothing on the books matches “{q.trim()}”.</p>}
              {groups.map((g) => (
                <Command.Group key={g.label} heading={g.label} className="[&_[cmdk-group-heading]]:cap [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5">
                  {g.rows.map((r) => (
                    <Item key={r.id} value={r.id} onSelect={() => go(r.to)} row={r} icon={g.label === 'Go to' ? (nav.find((n) => n?.to === r.to)?.icon ?? 'settings') : undefined} />
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <div className="flex shrink-0 items-center gap-5 px-5 py-3.5 font-mono text-[11px] tracking-[.06em] text-faint uppercase shadow-[inset_0_1px_0_var(--line)]">
              <span>↑ ↓ move</span>
              <span>↵ open</span>
              <span className="ml-auto hidden truncate md:inline">Jobs, customers, addresses, postcodes, quotes, invoices</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

function Item({ row, value, onSelect, icon }: { row: Row; value: string; onSelect: () => void; icon?: Parameters<typeof Icon>[0]['name'] }) {
  let lead: ReactNode = <span className="w-14 shrink-0 truncate font-mono text-[12px] text-muted sm:w-[76px]">{row.ref}</span>
  if (icon) lead = <span className="flex w-14 shrink-0 text-muted sm:w-[76px]"><Icon name={icon} className="size-4" /></span>
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex cursor-default items-center gap-3.5 rounded-[10px] px-3 py-[11px] outline-none data-[selected=true]:bg-raised">
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[14px] text-foreground">{row.title}</span>
        {row.detail && <span className="truncate text-[12px] text-muted">{row.detail}</span>}
      </span>
      {row.state && (
        <span className="hidden shrink-0 items-center gap-[7px] text-[12px] text-muted sm:flex">
          <span className={cn('size-[7px] rounded-full', dot[row.tone ?? 'faint'])} />
          {row.state}
        </span>
      )}
    </Command.Item>
  )
}
