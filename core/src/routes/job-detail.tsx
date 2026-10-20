import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CalendarClock, Clock, MapPin, Phone, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { clock, dayDate, duration, invoiceStatus, pounds, quoteStatus, ukDay } from '@kit'
import { JobSheet } from '@/components/dashboard/job-sheet'
import { Panel, PanelHeader, Row, Well } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Badge, Chip } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useArdent, useBook, useQuery } from '@/data/ardent'
import type { Job, LineItem, Priority } from '@/data/model'
import { act } from '@/lib/act'
import { find, invoiceTotal } from '@/lib/jobs'
import { ukToIso } from '@kit'
import { cn } from '@/lib/utils'

const selectClass = 'h-9 w-full min-w-0 rounded-md bg-raised px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
const priorities: Priority[] = ['emergency', 'high', 'normal', 'low']
const priorityWord: Record<Priority, string> = { emergency: 'Emergency', high: 'High', normal: 'Normal', low: 'Low' }

/** Rebook, reassign or rename. */
function Booking({ job }: { job: Job }) {
  const { client } = useArdent()
  const { data: book } = useBook()
  const [title, setTitle] = useState(job.title)
  const [day, setDay] = useState(ukDay(job.start))
  const [start, setStart] = useState(clock(job.start))
  const [hours, setHours] = useState((Date.parse(job.end) - Date.parse(job.start)) / 3_600_000)
  const [who, setWho] = useState(job.operatorIds[0] ?? '')
  const [priority, setPriority] = useState(job.priority)
  useEffect(() => {
    setTitle(job.title)
    setDay(ukDay(job.start))
    setStart(clock(job.start))
    setHours((Date.parse(job.end) - Date.parse(job.start)) / 3_600_000)
    setWho(job.operatorIds[0] ?? '')
    setPriority(job.priority)
  }, [job])
  const from = ukToIso(day, start)
  const to = new Date(Date.parse(from) + hours * 3_600_000).toISOString()
  const changed = title !== job.title || from !== new Date(job.start).toISOString() || to !== new Date(job.end).toISOString() || who !== (job.operatorIds[0] ?? '') || priority !== job.priority
  const save = () =>
    act(client.jobs.update(job.id, { title: title.trim(), start: from, end: to, operatorIds: who ? [who] : [], priority }), `${job.ref} saved`)
  return (
    <Panel>
      <PanelHeader icon={<CalendarClock />} title="Booking" />
      <Well className="grid grid-cols-2 gap-3 p-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="jb-title">Job</Label>
          <Input id="jb-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="jb-day">Day</Label>
          <Input id="jb-day" type="date" className="font-mono" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jb-start">From</Label>
          <Input id="jb-start" type="time" step={900} className="font-mono" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jb-hours">Hours</Label>
          <Input id="jb-hours" type="number" min={0.5} step={0.5} className="font-mono" value={hours} onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || 1))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jb-who">Who goes</Label>
          <select id="jb-who" className={selectClass} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">No one yet</option>
            {book?.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jb-pri">Priority</Label>
          <select id="jb-pri" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {priorityWord[p]}
              </option>
            ))}
          </select>
        </div>
        <Button className="col-span-2" variant={changed ? 'default' : 'outline'} disabled={!changed || !title.trim()} onClick={() => void save()}>
          Save changes
        </Button>
      </Well>
    </Panel>
  )
}

const kinds: LineItem['kind'][] = ['labour', 'material', 'callout', 'other']
const kindWord: Record<LineItem['kind'], string> = { labour: 'Labour', material: 'Materials', callout: 'Call-out', other: 'Other' }

/** The work and parts on the job, priced before VAT. */
function Lines({ job }: { job: Job }) {
  const { client } = useArdent()
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState('')
  const [kind, setKind] = useState<LineItem['kind']>('labour')
  const pence = Math.round(Number(price) * 100)
  const locked = ['invoiced', 'paid', 'cancelled'].includes(job.status)
  const add = async () => {
    const done = await act(client.jobs.addLine(job.id, { kind, description: description.trim(), quantity, unitPrice: pence }))
    if (done) {
      setDescription('')
      setQuantity(1)
      setPrice('')
    }
  }
  return (
    <Panel>
      <PanelHeader icon={<ReceiptText />} title="Work and parts" />
      <Well className="p-1">
        <div className="divide-y divide-line">
          {job.lines.map((l) => (
            <div key={l.id} className="group flex items-center gap-3 px-2.5 py-2 text-[13px]">
              <span className="w-16 shrink-0 text-[12px] text-faint">{kindWord[l.kind]}</span>
              <span className="min-w-0 flex-1 truncate">{l.description}</span>
              <span className="font-mono text-[12px] text-muted">
                {l.quantity} × {pounds(l.unitPrice, { always: true })}
              </span>
              {!locked && (
                <button aria-label={`Remove ${l.description}`} onClick={() => void act(client.jobs.removeLine(job.id, l.id))} className="rounded p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {!job.lines.length && <p className="px-2.5 py-3 text-[13px] text-faint">Nothing on the job yet.</p>}
        </div>
        {!locked && (
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-1.5 rounded-md bg-surface p-2 sm:grid-cols-[110px_1fr_64px_96px_auto]">
            <select aria-label="Kind" className={cn(selectClass, 'col-span-2 sm:col-span-1')} value={kind} onChange={(e) => setKind(e.target.value as LineItem['kind'])}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindWord[k]}
                </option>
              ))}
            </select>
            <Input aria-label="Description" placeholder="Fit new diverter valve" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-2 sm:col-span-1" />
            <Input aria-label="Quantity" type="number" min={0.25} step={0.25} className="font-mono" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
            <Input aria-label="Unit price in pounds" placeholder="£ each" inputMode="decimal" className="font-mono" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
            <Button size="sm" className="col-span-2 h-9 sm:col-span-1" disabled={!description.trim() || !(pence > 0)} onClick={() => void add()}>
              <Plus /> Add
            </Button>
          </div>
        )}
      </Well>
    </Panel>
  )
}

export function JobDetail() {
  const { id } = useParams()
  const { data: book, loading } = useBook()
  const job = find(book?.jobs, id)
  const { data: extra } = useQuery(
    async (c) => {
      if (!id) return undefined
      const [quotes, invoices, time] = await Promise.all([c.quotes.forJob(id), c.invoices.forJob(id), c.time.forJob(id)])
      return { quotes, invoices, time }
    },
    [id],
  )
  if (!book) return loading ? null : null
  if (!job) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted">
        That job isn't on your books.
        <Button variant="outline" size="sm" asChild>
          <Link to="/jobs">Back to jobs</Link>
        </Button>
      </div>
    )
  }
  const customer = find(book.customers, job.customerId)
  const site = find(book.sites, job.siteId)
  const worked = (extra?.time ?? []).filter((t) => t.kind === 'labour').reduce((s, t) => s + (Date.parse(t.end ?? new Date().toISOString()) - Date.parse(t.start)), 0)
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link to="/jobs">
            <ArrowLeft /> All jobs
          </Link>
        </Button>
        <JobSheet linked={false} job={job} book={book} title="Job sheet" />
        <Lines job={job} />
      </div>
      <div className="flex flex-col gap-3 lg:pt-11">
        <Booking job={job} />
        {extra && (extra.quotes.length > 0 || extra.invoices.length > 0) && (
          <Panel>
            <PanelHeader icon={<ReceiptText />} title="Quotes and invoices" />
            <Well className="divide-y divide-line">
              {extra.quotes.map((q) => (
                <Link key={q.id} to={`/money?tab=quotes&quote=${q.id}`} className="flex min-h-11 items-center gap-3 px-3 text-[13px] hover:bg-white/[0.02]">
                  <span className="font-mono text-[12px]">{q.ref}</span>
                  <span className="text-muted">Quote</span>
                  <Badge tone={quoteStatus[q.status].tone} className="ml-auto">
                    {quoteStatus[q.status].label}
                  </Badge>
                </Link>
              ))}
              {extra.invoices.map((inv) => (
                <Link key={inv.id} to={`/money?invoice=${inv.id}`} className="flex min-h-11 items-center gap-3 px-3 text-[13px] hover:bg-white/[0.02]">
                  <span className="font-mono text-[12px]">{inv.ref}</span>
                  <span className="font-mono text-[12px] text-muted">{pounds(invoiceTotal(inv), { always: true })}</span>
                  <Badge tone={invoiceStatus[inv.status].tone} className="ml-auto">
                    {invoiceStatus[inv.status].label}
                  </Badge>
                </Link>
              ))}
            </Well>
          </Panel>
        )}
        {extra && extra.time.length > 0 && (
          <Panel>
            <PanelHeader icon={<Clock />} title={`Time on the job · ${duration(worked)}`} />
            <Well className="divide-y divide-line">
              {extra.time.map((t) => (
                <Row key={t.id} label={<span className="capitalize">{find(book.operators, t.operatorId)?.name.split(' ')[0]} · {t.kind}</span>}>
                  <span className="font-mono text-[12px] text-muted">
                    {dayDate(t.start)} {clock(t.start)} to {t.end ? clock(t.end) : 'now'}
                  </span>
                </Row>
              ))}
            </Well>
          </Panel>
        )}
        <Panel>
          <PanelHeader icon={<Phone />} title="Customer" />
          <Well className="divide-y divide-line">
            <Row label="Name">{customer ? <Link to={`/customers/${customer.id}`} className="hover:text-white">{customer.name}</Link> : 'Unknown'}</Row>
            <Row label="Phone">
              <Chip>{customer?.phone}</Chip>
            </Row>
            <Row label="Owes">
              <span className={cn('font-mono', (customer?.balance ?? 0) > 0 && 'text-warn')}>{pounds(customer?.balance ?? 0, { always: true })}</span>
            </Row>
          </Well>
        </Panel>
        <Panel>
          <PanelHeader icon={<MapPin />} title="Site" />
          <Well className="divide-y divide-line">
            <Row label="Address">{site?.line1}</Row>
            <Row label="Town">{site?.town}</Row>
            <Row label="Postcode">
              <Chip>{site?.postcode}</Chip>
            </Row>
            {site?.accessNotes && (
              <p className="px-3 py-3 text-[13px] text-muted">
                <span className="text-foreground">Access: </span>
                {site.accessNotes}
              </p>
            )}
          </Well>
        </Panel>
        {job.notes && (
          <Panel>
            <PanelHeader title="Notes" />
            <Well className="p-3 text-[13px] text-muted">{job.notes}</Well>
          </Panel>
        )}
      </div>
    </div>
  )
}
