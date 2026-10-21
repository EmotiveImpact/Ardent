import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { clock, dayDate, duration, invoiceStatus, pounds, quoteStatus, totals, trade as tradeWord, ukDay, ukToIso, window as timeWindow, type Tone } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { barButton } from '@/components/layout/topbar'
import { Card, ChecksRow, RowButton, SectionHead, StageTrack, StateDot, StepRings } from '@/components/ardent/parts'
import { BookedTime, OnSiteClock, jobSteps, useJobField, type JobField } from '@/components/ardent/job-live'
import { Fact, OverrideHold, StageTimes } from '@/components/ardent/jobs-parts'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { Invoice, Job, JobStatus, LineItem, Priority, Quote } from '@/data/model'
import { act } from '@/lib/act'
import { find, invoiceOwed, invoiceTotal, jobContext, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const inputCls = 'h-10 w-full min-w-0 rounded-[10px] bg-inset px-3 text-[14px] text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/60'
/** "Tue 20 Oct" */
const dd = (iso: string) => dayDate(iso).replace(',', '')
const past = (s: JobStatus) => ['complete', 'invoiced', 'paid'].includes(s)
const first = (name?: string) => name?.split(' ')[0]
/** "Sarah" for a person, the whole name for a firm. */
const callName = (c?: { name: string; kind: string }) => (c ? (c.kind === 'business' || c.kind === 'letting_agent' ? c.name : first(c.name)) : undefined)

const stateWord: Record<JobStatus, string> = {
  enquiry: 'Enquiry',
  quoted: 'Quoted',
  booked: 'Booked',
  en_route: 'On the road',
  on_site: 'On site',
  paused: 'On hold',
  complete: 'Done, to invoice',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const priorityWord: Record<Priority, string> = { emergency: 'Emergency', high: 'High priority', normal: 'Normal', low: 'Low priority' }

/** The job's paperwork, newest first, leaving out the dead ones. */
function paperwork(job: Job, book: Book) {
  const quotes = book.quotes.filter((q) => q.jobId === job.id)
  const invoices = book.invoices.filter((i) => i.jobId === job.id)
  const quote = quotes.find((q) => q.status === 'accepted') ?? quotes.find((q) => q.status === 'sent' || q.status === 'draft')
  const invoice = invoices.find((i) => i.status !== 'void')
  return { quotes, invoices, quote, invoice }
}

const earliest = <T extends { start: string }>(xs: T[]) => [...xs].sort((a, b) => a.start.localeCompare(b.start))[0]

export function JobDetail() {
  const { id } = useParams()
  const { data: book } = useBook()
  const job = find(book?.jobs, id)
  const { data: fieldData } = useJobField(job?.id)

  if (!book) return <div className="flex flex-col gap-10 pb-6"><PageBar crumbs={[{ label: 'Jobs', to: '/jobs' }]} /><div className="mt-8 h-60 animate-pulse rounded-[14px] bg-surface/60" /></div>
  if (!job) {
    return (
      <div className="flex flex-col gap-10 pb-6">
        <PageBar crumbs={[{ label: 'Jobs', to: '/jobs' }]} />
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-[14px] text-muted">
          That job isn't on your books.
          <RowButton to="/jobs">Back to jobs</RowButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar
        crumbs={[{ label: 'Jobs', to: '/jobs' }, { label: job.ref }]}
        actions={<JobActions job={job} book={book} />}
      />
      <JobHead job={job} book={book} field={fieldData} />
      {/* The top bar hides page actions on a phone, so they sit under the head there. */}
      <div className="-mt-4 flex flex-wrap gap-2 empty:hidden sm:hidden">
        <JobActions job={job} book={book} />
      </div>

      <section aria-label="Booked to paid" className="flex flex-col gap-4">
        <SectionHead title="Booked to paid" className="pb-1" />
        <StageTrack job={job} />
        <StageTimes times={stageTimes(job, book, fieldData)} />
      </section>

      {job.checks.length > 0 && (
        <section>
          <SectionHead title="Checks" aside="Set on site. Click one to override it from the office." />
          <ChecksRow job={job} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TheWork job={job} book={book} field={fieldData} />
        <FromSite job={job} book={book} field={fieldData} />
        <Money job={job} book={book} field={fieldData} />
      </div>

      <section>
        <SectionHead title="The office" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Booking key={[job.title, job.start, job.end, job.priority, job.operatorIds.join()].join('|')} job={job} book={book} />
            <SiteCard job={job} book={book} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Paperwork job={job} book={book} />
            <TimeCard job={job} book={book} field={fieldData} />
          </div>
        </div>
      </section>
    </div>
  )
}

/** Ring the customer, and the next thing the office does with the job. */
function JobActions({ job, book }: { job: Job; book: Book }) {
  const { customer } = jobContext(job, book)
  return (
    <>
      {customer?.phone && (
        <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className={barButton} title={`Ring ${customer.name} on ${customer.phone}`}>
          Call {callName(customer)}
        </a>
      )}
      <NextAction job={job} book={book} />
    </>
  )
}

/** The one thing the office does next with this job, in the top bar. */
function NextAction({ job, book }: { job: Job; book: Book }) {
  const { client } = useArdent()
  const navigate = useNavigate()
  const { quote, invoice } = paperwork(job, book)
  if (invoice && past(job.status))
    return (
      <Link to={`/invoices/${invoice.id}`} className={barButton}>
        Open {invoice.ref}
      </Link>
    )
  if (job.status === 'complete')
    return (
      <button
        type="button"
        className={cn(barButton, 'font-medium disabled:opacity-50')}
        disabled={!job.lines.length}
        title={job.lines.length ? undefined : 'Add the work done before invoicing'}
        onClick={async () => {
          const inv = await act(client.invoices.create(job.id), (i) => `${i.ref} drafted`)
          if (inv) navigate(`/invoices/${inv.id}`)
        }}
      >
        Draft the invoice
      </button>
    )
  if (quote && (job.status === 'enquiry' || job.status === 'quoted'))
    return (
      <Link to={`/quotes/${quote.id}`} className={barButton}>
        Open {quote.ref}
      </Link>
    )
  if (job.status === 'enquiry')
    return (
      <button
        type="button"
        className={cn(barButton, 'font-medium')}
        onClick={async () => {
          const q = await act(client.quotes.create(job.id), (x) => `${x.ref} drafted`)
          if (q) navigate(`/quotes/${q.id}`)
        }}
      >
        Write a quote
      </button>
    )
  return null
}

/** The state, the big readout (the on-site clock when someone's on the tools), and who, what, where. */
function JobHead({ job, book, field }: { job: Job; book: Book; field?: JobField }) {
  const { customer, site, crew } = jobContext(job, book)
  const lead = crew[0]
  const travel = earliest(field?.time.filter((t) => t.kind === 'travel') ?? [])
  const labour = earliest(field?.time.filter((t) => t.kind === 'labour') ?? [])
  const travelMin = travel?.end ? Math.round((Date.parse(travel.end) - Date.parse(travel.start)) / 60000) : undefined
  const worked = workedMs(field)
  const { quote, invoice } = paperwork(job, book)
  const onSite = job.status === 'on_site' || job.status === 'paused'
  const value = totals(job).total
  const who = lead?.name ?? 'Nobody on it yet'

  const sentence = {
    on_site: `${who}, arrived ${clock(labour?.start ?? job.start)}.${travelMin ? ` Travel ${travelMin} min.` : ''}`,
    paused: `${who}, arrived ${clock(labour?.start ?? job.start)}. On hold, waiting on parts, access or a permit.`,
    en_route: `${who}${travel ? `, set off ${clock(travel.start)}` : ''}${lead?.etaMinutes ? `, ${lead.etaMinutes} min away` : ''}. Booked for ${clock(job.start)}.`,
    booked: lead ? `${crew.map((o) => o.name).join(' and ')}, ${dd(job.start)}, ${timeWindow(job.start, job.end)}.` : `Nobody on it yet. Booked for ${dd(job.start)}, ${timeWindow(job.start, job.end)}.`,
    enquiry: quote ? `${quote.ref} is a ${quoteStatus[quote.status].label.toLowerCase()} quote.` : job.lines.length ? 'Priced, no quote written yet.' : 'Not priced yet.',
    quoted: quote ? `${quote.ref} ${quote.sentAt ? `sent ${dd(quote.sentAt)}` : quoteStatus[quote.status].label.toLowerCase()}, waiting on ${callName(customer) ?? 'the customer'}.` : 'Waiting on the customer.',
    complete: `Done${worked ? `, ${duration(worked)} on the tools` : ''}. ${invoice ? `${invoice.ref} is a draft.` : 'Ready to invoice.'}`,
    invoiced: invoice ? `${invoice.ref}, ${pounds(invoiceOwed(invoice), { always: true })} still owed.` : 'Invoiced.',
    paid: 'Paid in full.',
    cancelled: 'This job was cancelled.',
  }[job.status]

  const big =
    job.status === 'booked' ? clock(job.start)
    : job.status === 'en_route' ? (lead?.etaMinutes ? `${lead.etaMinutes} min` : clock(job.start))
    : (job.status === 'enquiry' || job.status === 'quoted') && quote ? pounds(totals({ lines: quote.lines }).total, { always: true })
    : value ? pounds(value, { always: true })
    : 'Not priced'

  return (
    <div className="animate-rise flex flex-wrap justify-between gap-x-14 gap-y-8 pt-8">
      <div className="flex min-w-0 flex-col gap-3.5">
        <p className="cap flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cn('text-foreground', job.status === 'paused' && 'text-warn')}>{stateWord[job.status]}</span>
          <span className="text-faint">·</span>
          <span>{tradeWord[job.trade]}</span>
          {job.priority !== 'normal' && (
            <>
              <span className="text-faint">·</span>
              <span className={cn(job.priority === 'emergency' && 'text-danger', job.priority === 'high' && 'text-warn')}>{priorityWord[job.priority]}</span>
            </>
          )}
        </p>
        {onSite ? (
          <OnSiteClock job={job} field={field} className="text-[56px] tracking-[-.02em] sm:text-[84px]" />
        ) : (
          <span className="op-number text-[48px] tracking-[-.02em] sm:text-[72px]">{big}</span>
        )}
        <p className="text-[14px] text-muted">{sentence}</p>
        {onSite && (
          <div className="max-w-[460px]">
            <BookedTime job={job} field={field} />
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 content-start gap-x-8 gap-y-6 sm:gap-x-14">
        <Fact label="Job">
          <span className="op-number text-[26px] sm:text-[30px]">{job.ref}</span>
        </Fact>
        <Fact label="Work">
          <span className="text-[16px] leading-6 sm:text-[18px]">{job.title}</span>
        </Fact>
        <Fact label="Customer">
          {customer ? (
            <Link to={`/customers/${customer.id}`} className="w-fit rounded text-[15px] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60">
              {customer.name}
            </Link>
          ) : (
            <span className="text-[15px] text-muted">Unknown</span>
          )}
          {customer?.phone && <span className="font-mono text-[12px] text-muted">{customer.phone}</span>}
        </Fact>
        <Fact label="Address">
          <span className="text-[15px]">
            {site?.line1}
            {site?.town && `, ${site.town}`}
          </span>
          <span className="font-mono text-[12px] text-muted">{site?.postcode}</span>
        </Fact>
      </dl>
    </div>
  )
}

const workedMs = (field?: JobField) => (field?.time ?? []).filter((t) => t.kind === 'labour').reduce((s, t) => s + (Date.parse(t.end ?? new Date().toISOString()) - Date.parse(t.start)), 0)

/** Under each of StageTrack's dots: when it happened, or not yet. */
function stageTimes(job: Job, book: Book, field?: JobField) {
  const at = ({ booked: 0, en_route: 1, on_site: 2, paused: 2, complete: 3, invoiced: 3, paid: 4 } as Partial<Record<JobStatus, number>>)[job.status] ?? -1
  const travel = earliest(field?.time.filter((t) => t.kind === 'travel') ?? [])
  const labour = field?.time.filter((t) => t.kind === 'labour') ?? []
  const lastEnd = labour.map((t) => t.end).filter((e): e is string => !!e).sort().at(-1)
  const sig = field?.signatures[0]
  const { invoice } = paperwork(job, book)
  const day = (iso: string) => (onDay(iso, today()) ? 'Today' : dd(iso))
  const texts = [
    day(job.start),
    travel ? clock(travel.start) : '',
    earliest(labour) ? clock(earliest(labour).start) : '',
    sig ? clock(sig.at) : lastEnd ? clock(lastEnd) : '',
    invoice?.status === 'paid' ? invoice.ref : '',
  ]
  return texts.map((t, i) => (i <= at ? { text: t || (i === at ? 'Now' : 'Done'), reached: true } : { text: 'Not yet', reached: false }))
}

function TheWork({ job, book, field }: { job: Job; book: Book; field?: JobField }) {
  const { client } = useArdent()
  const steps = jobSteps(job, book, field)
  const done = steps.filter((s) => s.state === 'done').length
  return (
    <Card className="flex flex-col p-[22px]">
      <SectionHead
        className="pb-1"
        title={
          <>
            The work <span className="text-faint">·</span> {done} of {steps.length}
          </>
        }
      />
      <StepRings steps={steps} />
      {job.status === 'on_site' && (
        <div className="mt-auto flex flex-col gap-3 pt-5">
          <p className="text-[12.5px] text-muted">Finishing is the engineer's call on site, from the phone.</p>
          <OverrideHold label="Office override: hold to mark done" className="self-start" onCommit={() => void act(client.jobs.setStatus(job.id, 'complete'), `${job.ref} marked done from the office`)} />
        </div>
      )}
    </Card>
  )
}

function FromSite({ job, book, field }: { job: Job; book: Book; field?: JobField }) {
  const { customer } = jobContext(job, book)
  const photos = field?.photos ?? []
  const notes = [...(field?.notes ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const sig = field?.signatures[0]
  const stages = (['before', 'during', 'after'] as const).map((s) => [s, photos.filter((p) => p.stage === s).length] as const).filter(([, n]) => n)
  const stamp = (iso: string) => (onDay(iso, today()) ? clock(iso) : `${dd(iso)} ${clock(iso)}`)
  return (
    <Card className="flex flex-col p-[22px]">
      <SectionHead title="From site" className="pb-1" />
      <div className="rows">
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <span className="text-[14px]">Photos</span>
          <span className="font-mono text-[12px] text-muted">{photos.length ? `${photos.length}${stages.length ? `  ${stages.map(([s, n]) => `${n} ${s}`).join(', ')}` : ''}` : 'None yet'}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <span className="text-[14px]">{sig ? `Signed by ${sig.signedBy}` : `Signature from ${callName(customer) ?? 'the customer'}`}</span>
          <span className="font-mono text-[12px] text-muted uppercase">{sig ? stamp(sig.at) : past(job.status) ? 'None on file' : 'To do'}</span>
        </div>
      </div>
      <p className="cap pt-5 pb-1">Notes from site</p>
      {notes.length ? (
        <ol className="rows">
          {notes.slice(0, 4).map((n) => (
            <li key={n.id} className="py-2.5">
              <p className="text-[14px] leading-snug">{n.body}</p>
              <p className="mt-1 font-mono text-[11px] text-muted uppercase">
                {first(find(book.operators, n.operatorId)?.name) ?? 'Crew'} {stamp(n.at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-2.5 text-[13px] text-muted">Nothing written from site yet.</p>
      )}
      {notes.length > 4 && <p className="pt-1 text-[12.5px] text-muted">{notes.length - 4} older notes.</p>}
    </Card>
  )
}

const kinds: LineItem['kind'][] = ['labour', 'material', 'callout', 'other']
const kindWord: Record<LineItem['kind'], string> = { labour: 'Labour', material: 'Materials', callout: 'Call-out', other: 'Other' }

/** The price: what was quoted, and the work and parts logged against the job. Lines can be added or taken off until it's invoiced. */
function Money({ job, book, field }: { job: Job; book: Book; field?: JobField }) {
  const { client } = useArdent()
  const { quote } = paperwork(job, book)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState('')
  const [kind, setKind] = useState<LineItem['kind']>('labour')
  const pence = Math.round(Number(price) * 100)
  const locked = ['invoiced', 'paid', 'cancelled'].includes(job.status)
  const sums = totals(job)
  const quoted = quote && totals({ lines: quote.lines })
  const head = quoted ?? sums
  const worked = workedMs(field)
  const running = field?.time.some((t) => t.kind === 'labour' && !t.end)

  const add = async () => {
    const done = await act(client.jobs.addLine(job.id, { kind, description: description.trim(), quantity, unitPrice: pence }))
    if (done) {
      setDescription('')
      setQuantity(1)
      setPrice('')
    }
  }

  return (
    <Card className="flex flex-col p-[22px] md:col-span-2 xl:col-span-1">
      <div className="flex flex-col gap-2">
        <span className="cap">{quote ? (quote.status === 'accepted' ? 'Quoted' : `Quote ${quoteStatus[quote.status].label.toLowerCase()}`) : 'Priced'}</span>
        <span className="op-number text-[30px]">{pounds(head.total, { always: true })}</span>
        <span className="font-mono text-[11px] text-muted uppercase">
          {pounds(head.net, { always: true })} + VAT
          {quote && <span className="ml-3">{quote.ref}</span>}
        </span>
      </div>

      <p className="cap pt-6 pb-1">Logged so far</p>
      <div className="rows">
        {job.lines.map((l) => (
          <div key={l.id} className="group flex items-baseline gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[14px]">{l.description}</span>
            {l.quantity !== 1 && <span className="font-mono text-[11px] text-faint">{l.quantity} x {pounds(l.unitPrice, { always: true })}</span>}
            <span className="font-mono text-[13px] text-muted">{pounds(Math.round(l.quantity * l.unitPrice), { always: true })}</span>
            {!locked && (
              <button
                type="button"
                aria-label={`Take ${l.description} off the job`}
                onClick={() => void act(client.jobs.removeLine(job.id, l.id))}
                title="Take off the job"
                className="-mr-1 flex size-5 shrink-0 items-center justify-center self-center rounded text-[15px] leading-none text-faint opacity-0 outline-none transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!job.lines.length && <p className="py-2.5 text-[13px] text-muted">Nothing logged on the job yet.</p>}
        {worked > 0 && (
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-[14px]">Labour{running ? ', running' : ''}</span>
            <span className="font-mono text-[13px] text-muted">{duration(worked)}</span>
          </div>
        )}
        {quoted && job.lines.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-[14px]">Logged, inc. VAT</span>
            <span className="font-mono text-[13px]">{pounds(sums.total, { always: true })}</span>
          </div>
        )}
      </div>

      {!locked && (
        <form
          className="mt-4 grid grid-cols-[minmax(0,1fr)_56px_84px] gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (description.trim() && pence > 0) void add()
          }}
        >
          <input aria-label="What it is" placeholder="Add a line: fit new diverter valve" value={description} onChange={(e) => setDescription(e.target.value)} className={cn(inputCls, 'col-span-3')} />
          <select aria-label="Kind" className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as LineItem['kind'])}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindWord[k]}
              </option>
            ))}
          </select>
          <input aria-label="Quantity" type="number" min={0.25} step={0.25} className={cn(inputCls, 'px-2 font-mono')} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
          <input aria-label="Price each in pounds, before VAT" placeholder="£ each" inputMode="decimal" className={cn(inputCls, 'px-2 font-mono')} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
          <button
            type="submit"
            disabled={!description.trim() || !(pence > 0)}
            className="col-span-3 h-10 rounded-[10px] bg-raised text-[13px] text-foreground outline-none transition-colors hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40"
          >
            Add to the job
          </button>
        </form>
      )}
      {locked && job.status !== 'cancelled' && <p className="mt-4 text-[12.5px] text-muted">Invoiced, so the lines are fixed. Change them on the invoice.</p>}
    </Card>
  )
}


/** Rebook, reassign, rename or reprioritise. Keyed on the job's booking, so it resets when the job changes. */
function Booking({ job, book }: { job: Job; book: Book }) {
  const { client } = useArdent()
  const [title, setTitle] = useState(job.title)
  const [day, setDay] = useState(ukDay(job.start))
  const [start, setStart] = useState(clock(job.start))
  const [hours, setHours] = useState((Date.parse(job.end) - Date.parse(job.start)) / 3_600_000)
  const [who, setWho] = useState(job.operatorIds[0] ?? '')
  const [priority, setPriority] = useState(job.priority)
  const from = ukToIso(day, start)
  const to = new Date(Date.parse(from) + hours * 3_600_000).toISOString()
  const changed = title !== job.title || from !== new Date(job.start).toISOString() || to !== new Date(job.end).toISOString() || who !== (job.operatorIds[0] ?? '') || priority !== job.priority
  const save = () => act(client.jobs.update(job.id, { title: title.trim(), start: from, end: to, operatorIds: who ? [who] : [], priority }), `${job.ref} saved`)
  const extra = job.operatorIds.slice(1).map((id) => find(book.operators, id)?.name).filter(Boolean)

  return (
    <Card className="p-[22px]">
      <SectionHead title="Booking" aside={extra.length ? `Also on it: ${extra.join(', ')}` : undefined} />
      <form
        className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (changed && title.trim()) void save()
        }}
      >
        <Labelled label="Job" className="col-span-2 sm:col-span-4">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Labelled>
        <Labelled label="Day" className="col-span-2">
          <input type="date" className={cn(inputCls, 'font-mono')} value={day} onChange={(e) => setDay(e.target.value)} />
        </Labelled>
        <Labelled label="From">
          <input type="time" step={900} className={cn(inputCls, 'font-mono')} value={start} onChange={(e) => setStart(e.target.value)} />
        </Labelled>
        <Labelled label="Hours">
          <input type="number" min={0.5} step={0.5} className={cn(inputCls, 'font-mono')} value={hours} onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || 1))} />
        </Labelled>
        <Labelled label="Who goes" className="col-span-2">
          <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">No one yet</option>
            {book.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Priority" className="col-span-2">
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(['emergency', 'high', 'normal', 'low'] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {p === 'normal' ? 'Normal' : priorityWord[p]}
              </option>
            ))}
          </select>
        </Labelled>
        <div className="col-span-2 flex items-center justify-end gap-3 sm:col-span-4">
          {changed && <span className="text-[12.5px] text-muted">Not saved yet</span>}
          <button
            type="submit"
            disabled={!changed || !title.trim()}
            className={cn(
              'h-10 rounded-[10px] px-5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40',
              changed ? 'bg-foreground text-background hover:bg-white' : 'bg-raised text-foreground',
            )}
          >
            Save changes
          </button>
        </div>
      </form>
    </Card>
  )
}

function Labelled({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="cap">{label}</span>
      {children}
    </label>
  )
}

const dotTone = (t: Tone): 'ok' | 'info' | 'warn' | 'danger' | 'faint' => (t === 'ok' || t === 'info' || t === 'warn' || t === 'danger' ? t : 'faint')

/** Quotes and invoices raised for this job. */
function Paperwork({ job, book }: { job: Job; book: Book }) {
  const { quotes, invoices } = paperwork(job, book)
  const row = (to: string, ref: string, what: string, amount: number, label: string, tone: Tone) => (
    <Link key={to} to={to} className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 text-[14px] outline-none transition-colors hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-ring/60">
      <span className="w-[76px] shrink-0 font-mono text-[12px]">{ref}</span>
      <span className="min-w-0 flex-1 truncate text-muted">{what}</span>
      <span className="font-mono text-[13px]">{pounds(amount, { always: true })}</span>
      <span className="flex w-[84px] shrink-0 items-center justify-end gap-2 text-[12.5px] text-muted">
        <StateDot tone={dotTone(tone)} />
        {label}
      </span>
    </Link>
  )
  return (
    <Card className="p-[22px]">
      <SectionHead title="Quotes and invoices" />
      {quotes.length + invoices.length === 0 ? (
        <p className="py-2 text-[13px] text-muted">Nothing raised for this job yet.</p>
      ) : (
        <div className="rows">
          {quotes.map((q: Quote) => row(`/quotes/${q.id}`, q.ref, 'Quote', totals({ lines: q.lines }).total, quoteStatus[q.status].label, quoteStatus[q.status].tone))}
          {invoices.map((i: Invoice) => row(`/invoices/${i.id}`, i.ref, i.status === 'part_paid' ? `Invoice, ${pounds(invoiceOwed(i), { always: true })} owed` : 'Invoice', invoiceTotal(i), invoiceStatus[i.status].label, invoiceStatus[i.status].tone))}
        </div>
      )}
    </Card>
  )
}

function TimeCard({ job, book, field }: { job: Job; book: Book; field?: JobField }) {
  const time = [...(field?.time ?? [])].sort((a, b) => a.start.localeCompare(b.start))
  const worked = workedMs(field)
  if (!time.length) return null
  return (
    <Card className="p-[22px]">
      <SectionHead title="Time on the job" aside={<span className="font-mono text-[12px]">{duration(worked)} on the tools</span>} />
      <ol className="rows">
        {time.map((t) => (
          <li key={t.id} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-[14px]">
              {first(find(book.operators, t.operatorId)?.name) ?? 'Crew'} <span className="text-muted">{t.kind === 'labour' ? 'on the tools' : t.kind === 'travel' ? 'travelling' : 'admin'}</span>
            </span>
            <span className="font-mono text-[12px] text-muted">
              {onDay(t.start, today()) ? '' : `${dd(t.start)} `}
              {clock(t.start)} to {t.end ? clock(t.end) : 'now'}
            </span>
          </li>
        ))}
      </ol>
      <span className="sr-only">{job.ref}</span>
    </Card>
  )
}

/** Getting in, the office's own notes, and what the customer owes overall. */
function SiteCard({ job, book }: { job: Job; book: Book }) {
  const { customer, site } = jobContext(job, book)
  const owes = customer?.balance ?? 0
  return (
    <Card className="p-[22px]">
      <SectionHead title="Site and customer" aside={customer && <Link to={`/customers/${customer.id}`} className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">Open {callName(customer)}'s record</Link>} />
      <div className="rows">
        <Line label="Getting in">{site?.accessNotes ?? <span className="text-muted">No access notes</span>}</Line>
        {job.notes && <Line label="Office notes">{job.notes}</Line>}
        <Line label="Owes overall">
          <span className={cn('font-mono text-[13px]', owes > 0 ? 'text-warn' : 'text-muted')}>{pounds(owes, { always: true })}</span>
        </Line>
      </div>
    </Card>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-6">
      <span className="cap w-32 shrink-0">{label}</span>
      <span className="min-w-0 flex-1 text-[14px]">{children}</span>
    </div>
  )
}
