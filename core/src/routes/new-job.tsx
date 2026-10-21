import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { clock, shortDate, trade as tradeName, ukToIso } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { Block, Note, Pill, WhereBlock, WhoBlock, emptyWho, fieldClass, settleWho, whoFromCustomer, whoFromSite, whoMissing, type WhoDraft } from '@/components/ardent/book-parts'
import { checksFor, freeSlots, holdsTrade, listWords, slotDay, tradeWord, type Slot } from '@/components/ardent/book-plan'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { CertificateKind, Priority, Site, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { addDays, find, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * New job: who, where and what, then free slots worked out from the real diary
 * for crew who hold the trade. ?site=<id>&for=<cert kind> starts a renewal;
 * ?for=quote logs an enquiry and opens a draft quote.
 */

const renewals: Record<CertificateKind, { trade: Trade; title: string; mins: number }> = {
  CP12: { trade: 'gas', title: 'Landlord gas safety check (CP12)', mins: 60 },
  'Boiler service': { trade: 'gas', title: 'Annual boiler service', mins: 60 },
  EICR: { trade: 'electrical', title: 'Electrical installation condition report (EICR)', mins: 240 },
  PAT: { trade: 'electrical', title: 'PAT testing', mins: 120 },
  BS5839: { trade: 'fire', title: 'Fire alarm service (BS5839)', mins: 120 },
  Unvented: { trade: 'heating', title: 'Unvented cylinder service', mins: 60 },
}

const lengths = [
  { label: '1h', mins: 60 },
  { label: '1h 30', mins: 90 },
  { label: '2h', mins: 120 },
  { label: 'Half day', mins: 240 },
  { label: 'Day', mins: 480 },
]
const urgencies: { label: string; value: Priority }[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Emergency', value: 'emergency' },
]
const allTrades: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'carpentry', 'roofing', 'fire', 'hvac', 'lifts', 'general']
const first = (name: string) => name.trim().split(' ')[0]

export function NewJob() {
  const { data: book } = useBook()
  const { search } = useLocation()
  const [params] = useSearchParams()
  const quote = params.get('for') === 'quote'
  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Jobs', to: '/jobs' }, { label: quote ? 'New quote' : 'New job' }]} noNew />
      {book ? (
        <JobSheet key={search} book={book} params={params} />
      ) : (
        <>
          <PageHead title={quote ? 'New quote' : 'New job'} eyebrow="Not booked yet" sub="Who, where and what." className="pb-0" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="h-[560px] animate-pulse rounded-[14px] bg-surface/60" />
            <div className="h-[420px] animate-pulse rounded-[14px] bg-surface/60" />
          </div>
        </>
      )}
    </div>
  )
}

/** "CP12 RAN OUT 28 SEP", "CP12 RUNS OUT 14 NOV", "CP12 FINE TILL MAR 27" */
function certWords(book: Book, s: Site) {
  const certs = book.certificates.filter((c) => c.siteId === s.id && c.state !== 'draft').sort((a, b) => a.expires.localeCompare(b.expires))
  const c = certs.find((x) => x.state === 'overdue') ?? certs.find((x) => x.state === 'due_soon') ?? certs[0]
  if (!c) return undefined
  const when = shortDate(`${c.expires}T12:00:00Z`)
  if (c.state === 'overdue') return `${c.kind} ran out ${when}`
  if (c.state === 'due_soon') return `${c.kind} runs out ${when}`
  return `${c.kind} fine till ${new Date(`${c.expires}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`
}

function JobSheet({ book, params }: { book: Book; params: URLSearchParams }) {
  const { client } = useArdent()
  const navigate = useNavigate()
  const quote = params.get('for') === 'quote'
  const renewalKind = (params.get('for') ?? '') as CertificateKind
  const renewal = renewals[renewalKind]
  const lastCert = renewal ? book.certificates.filter((c) => c.siteId === params.get('site') && c.kind === renewalKind).sort((a, b) => b.expires.localeCompare(a.expires))[0] : undefined

  const [who, setWho] = useState<WhoDraft>(() => {
    const site = params.get('site')
    const customer = params.get('customer')
    return (site && whoFromSite(book, site)) || (customer && whoFromCustomer(book, customer)) || emptyWho
  })
  const [title, setTitle] = useState(renewal?.title ?? '')
  const [trade, setTrade] = useState<Trade>(renewal?.trade ?? 'gas')
  const [mins, setMins] = useState(renewal?.mins ?? 90)
  const [urgency, setUrgency] = useState<Priority>(lastCert?.state === 'overdue' ? 'high' : 'normal')
  const [notes, setNotes] = useState('')
  const [picked, setPicked] = useState<string>()
  const [own, setOwn] = useState(false)
  const [ownDay, setOwnDay] = useState(addDays(today(), 1))
  const [ownTime, setOwnTime] = useState('09:00')
  const [ownWho, setOwnWho] = useState('')
  const [busy, setBusy] = useState(false)

  const site = find(book.sites, who.siteId)
  const holders = book.operators.filter((o) => holdsTrade(o, trade))
  const slots = useMemo(() => freeSlots(book, trade, mins, site), [book, trade, mins, site])

  // The trades worth offering: what the crew hold, plus whatever is picked.
  const trades = allTrades.filter((t) => t === trade || book.operators.some((o) => o.trades.includes(t)))

  const ownStart = ownDay && ownTime ? ukToIso(ownDay, ownTime) : undefined
  const ownSlot: Slot | undefined = own && ownStart ? { key: 'own', opId: ownWho, start: ownStart, end: new Date(Date.parse(ownStart) + mins * 60_000).toISOString(), why: '' } : undefined
  const slot = ownSlot ?? slots.find((s) => s.key === picked) ?? slots[0]
  const op = find(book.operators, slot?.opId)

  const missing = whoMissing(who) ?? (!title.trim() ? 'what the work is' : undefined)

  const save = async (withCrew: boolean) => {
    if (missing || busy) return
    setBusy(true)
    try {
      const where = await settleWho(client, who)
      if (!where) return
      const now = Math.ceil(Date.now() / 1_800_000) * 1_800_000
      const start = quote || !slot ? new Date(now).toISOString() : slot.start
      const end = quote || !slot ? new Date(now + mins * 60_000).toISOString() : slot.end
      const crew = !quote && withCrew && slot?.opId ? [slot.opId] : []
      const job = await act(
        client.jobs.create({
          title: title.trim(),
          trade,
          status: quote ? 'enquiry' : 'booked',
          priority: urgency,
          customerId: where.customerId,
          siteId: where.siteId,
          operatorIds: crew,
          start,
          end,
          lines: [],
          checks: checksFor(trade),
          notes: notes.trim() || undefined,
        }),
        quote ? undefined : (j) => (crew.length ? `${j.ref} booked with ${first(op?.name ?? '')}` : `${j.ref} saved with nobody on it yet`),
      )
      if (!job) return
      if (quote) {
        const q = await act(client.quotes.create(job.id), (x) => `${job.ref} logged, ${x.ref} started`)
        navigate(q ? `/quotes/${q.id}` : `/jobs/${job.id}`)
      } else navigate(`/jobs/${job.id}`)
    } finally {
      setBusy(false)
    }
  }

  const customer = find(book.customers, who.customerId)
  const callName = customer ? first(customer.name) : who.name.trim() ? first(who.name) : 'The customer'
  const eyebrow = quote ? 'Enquiry, then a quote' : renewal ? `${renewalKind} renewal` : 'Not booked yet'
  const holdersAside = holders.length === 0 ? `Nobody holds ${tradeWord(trade)}` : holders.length === 1 ? `Only ${first(holders[0].name)} holds ${tradeWord(trade)}` : `${listWords(holders.map((h) => first(h.name)))} hold ${tradeWord(trade)}`

  return (
    <>
      <PageHead
        title={quote ? 'New quote' : 'New job'}
        eyebrow={<span className="font-mono text-[12px] tracking-[.06em] text-muted">{eyebrow}</span>}
        sub={quote ? 'Who, where and what. Ardent logs it as an enquiry and opens a draft quote for it.' : 'Who, where and what. Ardent finds the free slots for someone who holds the right ticket.'}
        className="pb-0"
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
        <Card aria-label="The job" className="rows px-5 pt-2 pb-4 sm:px-6">
          <WhoBlock book={book} who={who} set={setWho} label="Customer" />
          <WhereBlock book={book} who={who} set={setWho} label="Address" siteNote={(s) => certWords(book, s)} />

          <Block label="The work">
            <input aria-label="What needs doing" className={fieldClass} placeholder="Annual gas safety check and boiler service" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trade">
              {trades.map((t) => (
                <Pill key={t} on={trade === t} onClick={() => setTrade(t)}>
                  {tradeName[t]}
                </Pill>
              ))}
            </div>
            {renewal && lastCert && (
              <Note>
                {renewalKind} renewal. The last one here {lastCert.state === 'overdue' ? 'ran out' : 'runs out'} {shortDate(`${lastCert.expires}T12:00:00Z`)}.
              </Note>
            )}
          </Block>

          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-[1.2fr_1fr]">
            {!quote && (
              <Block label="How long">
                <div className="flex flex-wrap gap-1.5">
                  {lengths.map((l) => (
                    <Pill small key={l.mins} on={mins === l.mins} onClick={() => setMins(l.mins)}>
                      {l.label}
                    </Pill>
                  ))}
                </div>
              </Block>
            )}
            <Block label="How urgent">
              <div className="flex flex-wrap gap-1.5">
                {urgencies.map((u) => (
                  <Pill small key={u.value} on={urgency === u.value} onClick={() => setUrgency(u.value)}>
                    {u.label}
                  </Pill>
                ))}
              </div>
              {urgency === 'emergency' && (
                <span className="text-[12.5px] text-muted">
                  On the phone to them now?{' '}
                  <Link to="/callout" className="rounded text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
                    Take it as a callout
                  </Link>
                </span>
              )}
            </Block>
          </div>

          <Block label="Notes for the crew" aside="Optional">
            <textarea
              aria-label="Notes for the crew"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tenant's home. Ring 30 minutes before."
              className="min-h-[64px] w-full resize-y rounded-[10px] bg-inset px-3.5 py-3 text-[14px] leading-[21px] text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/60"
            />
            <Note>Prices go on the job once it is saved. No price list in Ardent yet</Note>
          </Block>
        </Card>

        {quote ? (
          <Card aria-label="The quote" className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <SectionHead title="The quote" className="pb-0" />
            <ol className="rows text-[14px]">
              {[
                ['Logged as an enquiry', 'Nobody is booked yet. It sits on the line as an enquiry until they say yes.'],
                ['A draft quote opens', 'Add the lines and prices there. It is valid for 30 days unless you change it.'],
                ['You send it', 'Ardent marks it as sent. It does not email or text it yet, so send it yourself.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4 py-3">
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full font-mono text-[11px] text-muted shadow-[inset_0_0_0_1.5px_var(--line-strong)]">{i + 1}</span>
                  <span className="flex flex-col gap-1">
                    <span>{t}</span>
                    <span className="text-[13px] text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="pt-3.5 text-[13px] leading-[19px] text-muted shadow-[inset_0_1px_0_var(--line)]">{missing ? `Still need ${missing}.` : `${callName}'s enquiry goes on the line, and the quote opens next.`}</p>
            <BigButton disabled={!!missing || busy} onClick={() => void save(false)}>
              Write the quote
            </BigButton>
          </Card>
        ) : (
          <Card aria-label="Free slots" className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <SectionHead title="Free slots" aside={<span className="font-mono text-[11px] tracking-[.06em] uppercase">{holdersAside}</span>} className="pb-0" />
            {!own && slots.length === 0 && (
              <p className="rounded-xl bg-inset px-4 py-5 text-[13.5px] text-muted">
                {holders.length === 0 ? `Nobody on the crew holds ${tradeWord(trade)}, so there are no slots to offer. Save it with nobody yet, or pick another trade.` : `No ${lengths.find((l) => l.mins === mins)?.label ?? ''} gap in the next two weeks for ${listWords(holders.map((h) => first(h.name)))}. Try a shorter job or pick your own time.`}
              </p>
            )}
            {!own && slots.length > 0 && (
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Free slots">
                {slots.map((s) => (
                  <SlotRow key={s.key} s={s} name={find(book.operators, s.opId)?.name ?? ''} on={slot?.key === s.key} onPick={() => setPicked(s.key)} />
                ))}
              </div>
            )}
            {own ? (
              <div className="flex flex-col gap-3 rounded-xl bg-inset p-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <input aria-label="Day" type="date" className={cn(fieldClass, 'bg-raised font-mono')} value={ownDay} onChange={(e) => setOwnDay(e.target.value)} />
                  <input aria-label="Start time" type="time" step={900} className={cn(fieldClass, 'bg-raised font-mono')} value={ownTime} onChange={(e) => setOwnTime(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who goes">
                  {holders.map((o) => (
                    <Pill key={o.id} on={ownWho === o.id} onClick={() => setOwnWho(o.id)}>
                      {o.name}
                    </Pill>
                  ))}
                  <Pill on={!ownWho} onClick={() => setOwnWho('')}>
                    Nobody yet
                  </Pill>
                </div>
                <button type="button" onClick={() => setOwn(false)} className="self-start rounded text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                  Back to the free slots
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setOwn(true)} className="self-start rounded text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                Pick your own time
              </button>
            )}
            <p className="pt-3.5 text-[13px] leading-[19px] text-muted shadow-[inset_0_1px_0_var(--line)]">
              {missing
                ? `Still need ${missing}.`
                : op
                  ? `It goes in the diary and on ${first(op.name)}'s phone. ${callName} gets nothing from Ardent yet, so give them a ring to confirm.`
                  : `It goes in the diary with nobody on it, and shows in Needs you on the day. ${callName} gets nothing from Ardent yet, so give them a ring.`}
            </p>
            <BigButton disabled={!!missing || busy || !slot} onClick={() => void save(true)}>
              {slot ? `Book ${slotDay(slot.start)} ${clock(slot.start)}${op ? ` with ${first(op.name)}` : ', nobody yet'}` : 'No slot picked'}
            </BigButton>
            {op && (
              <button type="button" disabled={!!missing || busy} onClick={() => void save(false)} className="self-center rounded text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50">
                Save it with nobody yet
              </button>
            )}
          </Card>
        )}
      </div>
    </>
  )
}

function BigButton({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-ember px-4 py-3 text-background outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:bg-raised disabled:text-faint disabled:hover:brightness-100"
    >
      <span className="op-title text-center text-[12px] leading-[1.6] tracking-[.16em] sm:tracking-[.22em]">{children}</span>
    </button>
  )
}

function SlotRow({ s, name, on, onPick }: { s: Slot; name: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn('flex items-center gap-4 rounded-xl p-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', on ? 'bg-raised' : 'hover:bg-inset')}
    >
      <span className="flex w-16 shrink-0 flex-col gap-1">
        <span className="cap text-foreground">{slotDay(s.start)}</span>
        <span className="op-number text-[18px]">{clock(s.start)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14px]">{name}</span>
        <span className="text-[13px] text-muted">{s.why}</span>
      </span>
      {s.tag && <span className={cn('cap shrink-0 text-[9px]', s.tag === 'Soonest' ? 'text-ok' : 'text-muted')}>{s.tag}</span>}
    </button>
  )
}
