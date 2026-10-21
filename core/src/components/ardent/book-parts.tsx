import type { ReactNode } from 'react'
import { customerKind, pounds } from '@kit'
import type { ArdentClient } from '@/data/client'
import type { Book } from '@/data/ardent'
import type { Customer, Site } from '@/data/model'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * The parts the booking screens share: the call sheet's inputs and chips, and
 * the who-and-where block that finds a customer already on the books or adds one.
 */

export const fieldClass =
  'h-[42px] w-full min-w-0 rounded-[10px] bg-inset px-3.5 text-[14px] text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/60'

/** A labelled part of the call sheet. Parts are split by hairlines, never boxes. */
export function Block({ label, aside, children, className }: { label: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 py-3.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="cap">{label}</span>
        {aside && <span className="font-mono text-[11px] tracking-[.06em] text-muted uppercase">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

/** One choice from a few: white when picked, grey otherwise. */
export function Pill({ on, onClick, children, disabled, small }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40',
        small ? 'h-8 px-3' : 'h-[34px] px-3.5',
        on ? 'bg-foreground text-background' : 'bg-raised text-foreground hover:bg-[#262626]',
      )}
    >
      {children}
    </button>
  )
}

/** A mono note under a part: what Ardent knows about what you typed. */
export const Note = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('font-mono text-[11px] tracking-[.06em] text-muted uppercase', className)}>{children}</span>

/* ---------- Who and where ---------- */

export interface WhoDraft {
  customerId?: string
  name: string
  phone: string
  kind: Customer['kind']
  /** A site of the picked customer, or undefined for a new address. */
  siteId?: string
  line1: string
  town: string
  postcode: string
}

export const emptyWho: WhoDraft = { name: '', phone: '', kind: 'homeowner', line1: '', town: '', postcode: '' }

/** Start from a site already on the books. */
export function whoFromSite(book: Book, siteId: string): WhoDraft | undefined {
  const site = find(book.sites, siteId)
  const c = find(book.customers, site?.customerId)
  if (!site || !c) return undefined
  return { ...emptyWho, customerId: c.id, name: c.name, phone: c.phone, kind: c.kind, siteId: site.id }
}

export function whoFromCustomer(book: Book, customerId: string): WhoDraft | undefined {
  const c = find(book.customers, customerId)
  if (!c) return undefined
  return { ...emptyWho, customerId: c.id, name: c.name, phone: c.phone, kind: c.kind, siteId: book.sites.find((s) => s.customerId === c.id)?.id }
}

/** What's still missing before the job can be saved, in a few words. */
export function whoMissing(w: WhoDraft) {
  if (!w.customerId && !w.name.trim()) return 'their name'
  if (!w.siteId && (!w.line1.trim() || !w.postcode.trim())) return 'the address and postcode'
  return undefined
}

/** Add the customer and the address if they are new; hand back the ids, or nothing if the engine said no. */
export async function settleWho(client: ArdentClient, w: WhoDraft): Promise<{ customerId: string; siteId: string; site?: Site } | undefined> {
  let customerId = w.customerId
  if (!customerId) {
    const c = await act(client.customers.create({ name: w.name.trim(), phone: w.phone.trim(), kind: w.kind }))
    if (!c) return undefined
    customerId = c.id
  }
  if (w.siteId) return { customerId, siteId: w.siteId }
  // A new address has no position until it is looked up; it sits at the yard on the crew map.
  const s = await act(client.sites.create({ customerId, line1: w.line1.trim(), town: w.town.trim(), postcode: w.postcode.trim().toUpperCase(), lat: 0, lng: 0 }))
  return s ? { customerId, siteId: s.id, site: s } : undefined
}

const digits = (s: string) => s.replace(/\D/g, '')
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const kinds: Customer['kind'][] = ['homeowner', 'landlord', 'letting_agent', 'business']

/** Customers on the books that match what has been typed so far. */
function customerMatches(book: Book, w: WhoDraft) {
  const name = w.name.trim().toLowerCase()
  const phone = digits(w.phone)
  if (name.length < 2 && phone.length < 4) return []
  return book.customers
    .filter((c) => (name.length >= 2 && c.name.toLowerCase().includes(name)) || (phone.length >= 4 && digits(c.phone).includes(phone)))
    .slice(0, 4)
}

function siteMatches(book: Book, w: WhoDraft) {
  const line = w.line1.trim().toLowerCase()
  const pc = squash(w.postcode)
  if (line.length < 3 && pc.length < 3) return []
  return book.sites.filter((s) => (line.length >= 3 && s.line1.toLowerCase().includes(line)) || (pc.length >= 3 && squash(s.postcode).startsWith(pc))).slice(0, 4)
}

const jobsFor = (book: Book, customerId: string) => book.jobs.filter((j) => j.customerId === customerId).length

function Suggest({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-inset p-1.5">
      <span className="cap px-2 pt-1.5 pb-1">{title}</span>
      {children}
    </div>
  )
}

const suggestRow = 'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60'

/** Who it's for: an existing customer, or a new one with name, phone and type. */
export function WhoBlock({ book, who, set, label }: { book: Book; who: WhoDraft; set: (w: WhoDraft) => void; label: string }) {
  const picked = find(book.customers, who.customerId)
  if (picked) {
    const jobs = jobsFor(book, picked.id)
    return (
      <Block label={label}>
        <div className="flex min-h-[42px] flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] bg-inset px-3.5 py-2.5">
          <span className="text-[14px]">{picked.name}</span>
          <span className="font-mono text-[11px] tracking-[.06em] text-muted uppercase">
            {customerKind[picked.kind]}
            <span className="ml-3 tracking-normal normal-case">{picked.phone}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Note>
            On the books · {jobs} {jobs === 1 ? 'job' : 'jobs'} · {picked.balance > 0 ? `owes ${pounds(picked.balance)}` : 'owes nothing'}
          </Note>
          <button type="button" onClick={() => set({ ...emptyWho })} className="rounded text-[12px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
            Someone else
          </button>
        </div>
      </Block>
    )
  }
  const matches = customerMatches(book, who)
  return (
    <Block label={label}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.4fr_1fr]">
        <input aria-label="Name" className={fieldClass} placeholder="Name" value={who.name} onChange={(e) => set({ ...who, name: e.target.value })} autoComplete="off" />
        <input aria-label="Phone" className={cn(fieldClass, 'font-mono')} placeholder="Phone" inputMode="tel" value={who.phone} onChange={(e) => set({ ...who, phone: e.target.value })} autoComplete="off" />
      </div>
      {matches.length > 0 && (
        <Suggest title="Already on the books?">
          {matches.map((c) => (
            <button key={c.id} type="button" className={suggestRow} onClick={() => set(whoFromCustomer(book, c.id) ?? who)}>
              <span className="min-w-0 flex-1 truncate text-[14px]">{c.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted">{c.phone}</span>
            </button>
          ))}
        </Suggest>
      )}
      {who.name.trim() ? <Note>New customer · not on the books yet</Note> : <Note>Type a name or number to find them on the books</Note>}
      {who.name.trim() && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type of customer">
          {kinds.map((k) => (
            <Pill key={k} on={who.kind === k} onClick={() => set({ ...who, kind: k })}>
              {customerKind[k]}
            </Pill>
          ))}
        </div>
      )}
    </Block>
  )
}

/** Where the job is: one of the customer's addresses, or a new one. */
export function WhereBlock({ book, who, set, label, siteNote }: { book: Book; who: WhoDraft; set: (w: WhoDraft) => void; label: string; siteNote?: (s: Site) => ReactNode }) {
  const theirs = who.customerId ? book.sites.filter((s) => s.customerId === who.customerId) : []
  const site = find(book.sites, who.siteId)
  const matches = who.customerId ? [] : siteMatches(book, who)
  return (
    <Block label={label}>
      {theirs.length > 0 && (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Address">
          {[...theirs, undefined].map((s) => {
            const on = s ? who.siteId === s.id : !who.siteId
            return (
              <button
                key={s?.id ?? 'new'}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ ...who, siteId: s?.id })}
                className={cn('flex items-center gap-3 rounded-[10px] px-3.5 py-[11px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', on ? 'bg-raised' : 'hover:bg-inset')}
              >
                <span aria-hidden className={cn('size-3.5 shrink-0 rounded-full', on ? 'shadow-[inset_0_0_0_4.5px_var(--fg)]' : 'shadow-[inset_0_0_0_1.5px_var(--fg-muted)]')} />
                <span className="min-w-0 flex-1 text-[14px]">{s ? `${s.line1}, ${s.town ? `${s.town}, ` : ''}${s.postcode}` : 'Another address'}</span>
                {s && siteNote && <span className="hidden shrink-0 font-mono text-[11px] tracking-[.06em] text-muted uppercase sm:inline">{siteNote(s)}</span>}
              </button>
            )
          })}
        </div>
      )}
      {!who.siteId && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1.6fr_1fr_0.8fr]">
          <input aria-label="Address" className={cn(fieldClass, 'col-span-2 sm:col-span-1')} placeholder="27 Ladybarn Lane" value={who.line1} onChange={(e) => set({ ...who, line1: e.target.value })} autoComplete="off" />
          <input aria-label="Town" className={fieldClass} placeholder="Town" value={who.town} onChange={(e) => set({ ...who, town: e.target.value })} autoComplete="off" />
          <input aria-label="Postcode" className={cn(fieldClass, 'font-mono uppercase placeholder:normal-case')} placeholder="Postcode" value={who.postcode} onChange={(e) => set({ ...who, postcode: e.target.value })} autoComplete="off" />
        </div>
      )}
      {matches.length > 0 && (
        <Suggest title="That address is on the books">
          {matches.map((s) => (
            <button key={s.id} type="button" className={suggestRow} onClick={() => set(whoFromSite(book, s.id) ?? who)}>
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {s.line1}, {s.town}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {s.postcode} · {find(book.customers, s.customerId)?.name}
              </span>
            </button>
          ))}
        </Suggest>
      )}
      {site?.accessNotes && <span className="text-[12.5px] text-muted">Getting in: {site.accessNotes}</span>}
      {site && siteNote && <span className="font-mono text-[11px] tracking-[.06em] text-muted uppercase sm:hidden">{siteNote(site)}</span>}
    </Block>
  )
}
