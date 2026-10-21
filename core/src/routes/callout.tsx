import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { clock, pounds, trade as tradeName } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, Initials, PageHead, SectionHead, StateDot, type Figure } from '@/components/ardent/parts'
import { Block, Note, Pill, WhereBlock, WhoBlock, emptyWho, fieldClass, settleWho, whoMissing, type WhoDraft } from '@/components/ardent/book-parts'
import { checksFor, rankCrew, sendNote, tradeWord, type Candidate } from '@/components/ardent/book-plan'
import { HoldButton } from '@/components/ui/hold-button'
import { useArdent, useBook, useQuery, type Book } from '@/data/ardent'
import type { Trade } from '@/data/model'
import { useNow } from '@/hooks/use-now'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * Emergency callout: take the details while the customer is on the phone,
 * see who holds the trade and can get there first, and hold to send them.
 */

const problems: { label: string; trade?: Trade }[] = [
  { label: 'Burst or leak', trade: 'plumbing' },
  { label: 'No heat or hot water', trade: 'heating' },
  { label: 'Smell of gas', trade: 'gas' },
  { label: 'No power', trade: 'electrical' },
  { label: 'Something else' },
]

const TWO_HOURS = 2 * 3_600_000
const first = (name: string) => name.trim().split(' ')[0]

/** "£120" typed as pounds, to pence; undefined if blank or not a price. */
function toPence(s: string) {
  const n = Number(s.replace(/[£,\s]/g, ''))
  return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined
}

function CallTimer({ since }: { since: number }) {
  const now = useNow(1000)
  const s = Math.max(0, Math.floor((now - since) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return <span className="font-mono tracking-[.12em] text-muted">{`${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`}</span>
}

export function Callout() {
  const { data: book } = useBook()
  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Today', to: '/' }, { label: 'Emergency callout' }]} noCallout />
      {book ? <CallSheet book={book} /> : <Loading />}
    </div>
  )
}

function Loading() {
  return (
    <>
      <PageHead title="Emergency callout" eyebrow="Call in progress" sub="Take the details while they're on the phone." className="pb-0" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-[520px] animate-pulse rounded-[14px] bg-surface/60" />
        <div className="h-[420px] animate-pulse rounded-[14px] bg-surface/60" />
      </div>
    </>
  )
}

function CallSheet({ book }: { book: Book }) {
  const { client } = useArdent()
  const navigate = useNavigate()
  const [opened] = useState(Date.now)
  const [who, setWho] = useState<WhoDraft>(emptyWho)
  const [problem, setProblem] = useState(0)
  const [trade, setTrade] = useState<Trade>('plumbing')
  const [said, setSaid] = useState('')
  const [feeLabel, setFeeLabel] = useState<string>()
  const [fee, setFee] = useState<string>()
  const [picked, setPicked] = useState<string>()
  // Send someone straight away, or put it to the crew as a job request.
  const [how, setHow] = useState<'send' | 'one' | 'all'>('send')
  const [busy, setBusy] = useState(false)

  const site = find(book.sites, who.siteId)
  const { data: travel } = useQuery((c) => (site ? c.travel.list({ siteId: site.id }) : Promise.resolve(undefined)), [site?.id])
  const { data: roads } = useQuery((c) => c.travel.get())
  const { data: prices } = useQuery((c) => c.priceList.list())
  const crew = useMemo(() => rankCrew(book, trade, site, Date.now(), travel), [book, trade, site, travel])
  const canGo = crew.filter((c) => c.when === 'now' || c.when === 'later')
  const chosen = crew.find((c) => c.op.id === picked && c.cleared) ?? canGo[0]
  // The call-out charge starts from the price list, and can be changed for this call.
  const listed = prices?.find((i) => i.kind === 'callout')
  const feeText = fee ?? (listed ? (listed.price / 100).toFixed(2) : '')
  const feeName = feeLabel ?? listed?.name ?? 'Emergency callout'
  const pence = toPence(feeText)
  const gas = problems[problem].trade === 'gas'

  // The trades worth offering: what the crew hold, plus whatever is picked.
  const trades = useMemo(() => {
    const held = new Set<Trade>(book.operators.flatMap((o) => o.trades))
    held.add(trade)
    return (['gas', 'heating', 'plumbing', 'electrical', 'roofing', 'carpentry', 'fire', 'lifts', 'hvac', 'general'] as Trade[]).filter((t) => held.has(t))
  }, [book.operators, trade])

  const asking = how !== 'send'
  const missing = whoMissing(who) ?? (!chosen && !asking ? `someone cleared for ${tradeWord(trade)}` : undefined)

  const pickProblem = (i: number) => {
    setProblem(i)
    const t = problems[i].trade
    if (t) setTrade(t)
  }

  const send = async () => {
    if (missing || busy || (!chosen && !asking)) return
    setBusy(true)
    try {
      const where = await settleWho(client, who)
      if (!where) return
      const start = Date.now()
      const what = problems[problem]
      const title = what.trade ? what.label : said.trim().split(/[.!?\n]/)[0].slice(0, 60) || 'Emergency callout'
      const job = await act(
        client.jobs.create({
          title,
          trade,
          status: 'booked',
          priority: 'emergency',
          customerId: where.customerId,
          siteId: where.siteId,
          operatorIds: asking ? [] : [chosen!.op.id],
          start: new Date(start).toISOString(),
          end: new Date(start + TWO_HOURS).toISOString(),
          lines: [],
          checks: checksFor(trade),
          notes: said.trim() || undefined,
        }),
        (j) => (asking ? `${j.ref} booked` : `${j.ref} sent to ${first(chosen!.op.name)}`),
      )
      if (!job) return
      if (asking) await act(client.requests.create(job.id, { mode: how === 'all' ? 'all' : 'one' }), (r) => (r.status === 'open' ? 'Asking the crew' : 'No one can be asked: see why on the job'))
      if (pence) await act(client.jobs.addLine(job.id, { kind: 'callout', description: feeName.trim() || 'Emergency callout', quantity: 1, unitPrice: pence, ...(listed && fee === undefined && feeLabel === undefined ? { itemId: listed.id } : {}) }))
      navigate(`/jobs/${job.id}`)
    } finally {
      setBusy(false)
    }
  }

  const figures: Figure[] = [
    { label: 'Free from', value: chosen ? (chosen.when === 'later' && chosen.freeAt ? clock(chosen.freeAt) : chosen.when === 'off' ? 'Off' : 'Now') : '--' },
    ...(pence ? [{ label: 'Callout', value: pounds(pence) }] : []),
    { label: 'Can go', value: canGo.length, unit: `of ${crew.length}` },
  ]

  return (
    <>
      <PageHead
        title="Emergency callout"
        eyebrow={
          <>
            <span className="flex items-center gap-2 text-danger">
              <StateDot tone="danger" className="animate-pulse" />
              Call in progress
            </span>
            <CallTimer since={opened} />
          </>
        }
        sub="Take the details while they're on the phone. Ardent picks who can get there first with the right ticket."
        figures={figures}
        className="pb-0"
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
        <Card aria-label="The call" className="rows px-5 pt-2 pb-4 sm:px-6">
          <WhoBlock book={book} who={who} set={setWho} label="Who's calling" />
          <WhereBlock book={book} who={who} set={setWho} label="Where" />

          <Block label="What's wrong">
            <div className="flex flex-wrap gap-1.5">
              {problems.map((p, i) => (
                <Pill key={p.label} on={problem === i} onClick={() => pickProblem(i)}>
                  {p.label}
                </Pill>
              ))}
            </div>
            <span className={cn('text-[12.5px] leading-[18px]', gas ? 'text-warn' : 'text-muted')}>
              Smell of gas? They ring the National Gas Emergency line on <span className={cn('font-mono', gas ? 'text-warn' : 'text-foreground')}>0800 111 999</span> first, then you.
            </span>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Trade it needs">
              <span className="cap mr-2">Needs</span>
              {trades.map((t) => (
                <Pill key={t} on={trade === t} onClick={() => setTrade(t)}>
                  {tradeName[t]}
                </Pill>
              ))}
            </div>
          </Block>

          <Block label="What they said">
            <textarea
              aria-label="What they said"
              rows={3}
              value={said}
              onChange={(e) => setSaid(e.target.value)}
              placeholder="Pipe in the loft has gone. Water coming through the landing ceiling. Stopcock is off."
              className="min-h-[84px] w-full resize-y rounded-[10px] bg-inset px-3.5 py-3 text-[14px] leading-[21px] text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/60"
            />
            <Note>Goes on the job, so whoever goes reads it on their phone</Note>
          </Block>

          <Block label="Callout charge" aside="Optional">
            <div className="grid grid-cols-[1fr_120px] gap-2.5">
              <input aria-label="Charge description" className={fieldClass} value={feeName} onChange={(e) => setFeeLabel(e.target.value)} />
              <input aria-label="Charge in pounds, before VAT" className={cn(fieldClass, 'text-right font-mono')} inputMode="decimal" placeholder="£0.00" value={feeText} onChange={(e) => setFee(e.target.value)} />
            </div>
            <Note>{listed ? 'From your price list, before VAT. Change it for this call if you need to' : 'Type what you charge, before VAT, or add it on the job later'}</Note>
          </Block>
        </Card>

        <Card aria-label="Who can go" className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <SectionHead title="Who can go" aside={<span className="font-mono text-[11px] tracking-[.06em] uppercase">Needs {tradeWord(trade)}</span>} className="pb-0" />
          <div className="flex flex-col gap-1" role="radiogroup" aria-label="Who to send">
            {crew.map((c) => (
              <CrewRow
                key={c.op.id}
                c={c}
                on={!asking && chosen?.op.id === c.op.id}
                best={c === canGo[0] && c.when === 'now'}
                onPick={() => {
                  setPicked(c.op.id)
                  setHow('send')
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-3.5 shadow-[inset_0_1px_0_var(--line)]" role="group" aria-label="How to send it">
            <Pill on={how === 'send'} onClick={() => setHow('send')} disabled={!chosen}>
              {chosen ? `Send ${first(chosen.op.name)}` : 'Send someone'}
            </Pill>
            <Pill on={how === 'one'} onClick={() => setHow('one')}>
              Ask the crew, one at a time
            </Pill>
            <Pill on={how === 'all'} onClick={() => setHow('all')}>
              Ask everyone at once
            </Pill>
          </div>
          <p className="text-[13px] leading-[19px] text-muted">
            {missing
              ? `Still need ${missing} before you can send anyone.`
              : asking
                ? `It goes to the phones of whoever does ${tradeWord(trade)}, has the papers it needs and is free, ${how === 'one' ? 'nearest first, 45 seconds each' : 'all together, first to accept gets it'}. Freelancers are asked when they're on standby. You watch the answers on the job.`
                : sendNote(book, chosen!, who.name)}
          </p>
          {site && roads && !roads.roadTimes && <p className="-mt-2 text-[12.5px] text-faint">Distances are as the crow flies, from where each van was last seen or the job it's on. Drive times by road come on once the TomTom key is added.</p>}
          <HoldButton
            label={asking ? 'Hold to ask the crew' : chosen ? `Hold to send ${first(chosen.op.name)}` : 'Nobody to send'}
            onCommit={() => void send()}
            ms={1000}
            disabled={!!missing || busy}
            className="h-14 rounded-xl bg-ember disabled:bg-raised disabled:opacity-100 [&>span:first-child]:bg-black/35 [&>span:first-child]:shadow-none [&>span:last-child]:!text-[12px] [&>span:last-child]:!text-background disabled:[&>span:last-child]:!text-faint"
          />
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]">
            <Link to={who.siteId ? `/jobs/new?site=${who.siteId}` : '/jobs/new'} className="rounded text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              Book it for later instead
            </Link>
            {canGo.length > 1 && !asking && <span className="text-faint">Tap another name to send them instead</span>}
          </div>
        </Card>
      </div>
    </>
  )
}

const tagFor = (c: Candidate, best: boolean) =>
  c.when === 'no' ? { text: 'Not cleared', cls: 'text-faint' } : c.when === 'off' ? { text: 'Off shift', cls: 'text-faint' } : c.when === 'later' ? { text: 'Busy', cls: 'text-muted' } : best ? { text: 'Best', cls: 'text-ok' } : { text: 'Free', cls: 'text-muted' }

function CrewRow({ c, on, best, onPick }: { c: Candidate; on: boolean; best: boolean; onPick: () => void }) {
  const tag = tagFor(c, best)
  const big = c.when === 'now' ? 'NOW' : c.when === 'later' && c.freeAt ? clock(c.freeAt) : '--'
  const small = [
    c.when === 'later' ? 'FREE' : '',
    c.minutes !== undefined ? `${c.minutes} MIN DRIVE` : '',
    c.miles === undefined ? '' : c.miles < 0.1 ? 'SAME ADDRESS' : `${c.miles} MI`,
  ]
    .filter(Boolean)
    .join(' · ')
  const seen = c.seenAt ? `Van seen ${Math.max(1, Math.round((Date.now() - Date.parse(c.seenAt)) / 60_000))} min ago` : undefined
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={!c.cleared}
      onClick={onPick}
      className={cn(
        'flex items-center gap-3.5 rounded-xl p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 sm:p-3.5',
        on ? 'bg-raised' : 'enabled:hover:bg-inset',
        !on && (c.when === 'no' ? 'opacity-45' : c.when === 'now' ? '' : 'opacity-70'),
      )}
    >
      <Initials className="size-11 rounded-[10px] bg-background font-display text-[12px] tracking-[.14em]">{c.op.initials}</Initials>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[15px]">
          {c.op.name}
          <span className={cn('cap text-[11px]', tag.cls)}>{tag.text}</span>
        </span>
        <span className="text-[13px] text-muted">
          {c.why}
          {seen && <span className="text-faint"> {seen}.</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="op-number text-[18px]">{big}</span>
        {small && <span className="font-mono text-[11px] text-muted">{small}</span>}
      </span>
    </button>
  )
}
