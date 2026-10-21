import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { clock, customerKind, pounds, quoteStatus, shortDate, totals } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { barButton } from '@/components/layout/topbar'
import { Icon } from '@/components/layout/icons'
import { Card, PageHead } from '@/components/ardent/parts'
import { FormDialog, Monogram } from '@/components/ardent/people-parts'
import { daysTo, softButton, solidButton } from '@/components/ardent/people-kit'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { selectClass } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NewJobDialog } from '@/components/new-job-dialog'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { Certificate, Customer, Invoice, Job, JobStatus } from '@/data/model'
import { act } from '@/lib/act'
import { find, invoiceOwed, invoiceTotal, isDone, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const kinds: Customer['kind'][] = ['homeowner', 'landlord', 'letting_agent', 'business']

/** A label in caps over its control. */
function Labelled({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="cap">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Add a customer, or change one. A new customer comes with their first address. */
function CustomerDialog({ children, customer }: { children: ReactNode; customer?: Customer }) {
  const { client } = useArdent()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', kind: 'homeowner' as Customer['kind'] })
  const [site, setSite] = useState({ line1: '', town: '', postcode: '' })
  const [busy, setBusy] = useState(false)
  const ready = form.name.trim() && form.phone.trim() && (customer || (site.line1.trim() && site.postcode.trim()))

  const openWith = (o: boolean) => {
    if (o) setForm({ name: customer?.name ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', kind: customer?.kind ?? 'homeowner' })
    if (o && !customer) setSite({ line1: '', town: '', postcode: '' })
    setOpen(o)
  }

  const save = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      const details = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, kind: form.kind }
      if (customer) {
        if (await act(client.customers.update(customer.id, details), `${details.name} saved`)) setOpen(false)
        return
      }
      const c = await act(client.customers.create(details))
      if (!c) return
      // Placed at the yard on the crew map until addresses are looked up.
      const s = await act(client.sites.create({ customerId: c.id, line1: site.line1.trim(), town: site.town.trim(), postcode: site.postcode.trim(), lat: 0, lng: 0 }), `${c.name} added`)
      setOpen(false)
      if (s) navigate(`/customers/${c.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormDialog wide eyebrow={customer ? customerKind[customer.kind] : 'Customers'} title={customer ? 'Their details' : 'New customer'} line={customer ? 'Name, number and email.' : 'Who they are and where the work is.'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Name" htmlFor="cd-name">
            <Input id="cd-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hannah Price" />
          </Labelled>
          <Labelled label="Type" htmlFor="cd-kind">
            <select id="cd-kind" className={selectClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Customer['kind'] })}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {customerKind[k]}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Phone" htmlFor="cd-phone">
            <Input id="cd-phone" className="font-mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07700 900123" />
          </Labelled>
          <Labelled label="Email" htmlFor="cd-email">
            <Input id="cd-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" />
          </Labelled>
        </div>
        {!customer && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr]">
            <Labelled label="Address" htmlFor="cd-line1">
              <Input id="cd-line1" value={site.line1} onChange={(e) => setSite({ ...site, line1: e.target.value })} placeholder="14 Alder Road" />
            </Labelled>
            <Labelled label="Town" htmlFor="cd-town">
              <Input id="cd-town" value={site.town} onChange={(e) => setSite({ ...site, town: e.target.value })} placeholder="Didsbury" />
            </Labelled>
            <Labelled label="Postcode" htmlFor="cd-pc">
              <Input id="cd-pc" className="font-mono uppercase" value={site.postcode} onChange={(e) => setSite({ ...site, postcode: e.target.value })} placeholder="M20 6BT" />
            </Labelled>
          </div>
        )}
        <button type="button" className={solidButton} disabled={!ready || busy} onClick={() => void save()}>
          {customer ? 'Save' : 'Add customer'}
        </button>
      </FormDialog>
    </Dialog>
  )
}

function SiteDialog({ customerId, children }: { customerId: string; children: ReactNode }) {
  const { client } = useArdent()
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState({ line1: '', town: '', postcode: '', accessNotes: '' })
  const ready = site.line1.trim() && site.postcode.trim()
  const save = async () => {
    if (!ready) return
    const s = await act(
      client.sites.create({ customerId, line1: site.line1.trim(), town: site.town.trim(), postcode: site.postcode.trim(), accessNotes: site.accessNotes.trim() || undefined, lat: 0, lng: 0 }),
      (x) => `${x.line1} added`,
    )
    if (s) {
      setOpen(false)
      setSite({ line1: '', town: '', postcode: '', accessNotes: '' })
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormDialog eyebrow="Addresses" title="New address" line="Another property this customer looks after.">
        <Labelled label="Address" htmlFor="sd-line1">
          <Input id="sd-line1" autoFocus value={site.line1} onChange={(e) => setSite({ ...site, line1: e.target.value })} placeholder="Flat 3, 22 Wilmslow Road" />
        </Labelled>
        <div className="grid grid-cols-2 gap-3">
          <Labelled label="Town" htmlFor="sd-town">
            <Input id="sd-town" value={site.town} onChange={(e) => setSite({ ...site, town: e.target.value })} />
          </Labelled>
          <Labelled label="Postcode" htmlFor="sd-pc">
            <Input id="sd-pc" className="font-mono uppercase" value={site.postcode} onChange={(e) => setSite({ ...site, postcode: e.target.value })} />
          </Labelled>
        </div>
        <Labelled label="Getting in" htmlFor="sd-access">
          <Input id="sd-access" value={site.accessNotes} onChange={(e) => setSite({ ...site, accessNotes: e.target.value })} placeholder="Key safe 4471, dog in the garden" />
        </Labelled>
        <button type="button" className={solidButton} disabled={!ready} onClick={() => void save()}>
          Add address
        </button>
      </FormDialog>
    </Dialog>
  )
}

/* ---------- Money owed, worked out from the invoices ---------- */

const owing = (i: Invoice) => ['sent', 'part_paid', 'overdue'].includes(i.status) && invoiceOwed(i) > 0
const isLate = (i: Invoice) => owing(i) && (i.status === 'overdue' || (!!i.dueAt && i.dueAt < new Date().toISOString()))
const daysLate = (i: Invoice) => (i.dueAt ? Math.max(0, Math.floor((Date.now() - Date.parse(i.dueAt)) / 86_400_000)) : 0)

/** Who owes what and whether any of it is late. */
function moneyOf(book: Book, c: Customer) {
  const invoices = book.invoices.filter((i) => i.customerId === c.id)
  return { late: invoices.some(isLate), lateAmount: invoices.filter(isLate).reduce((s, i) => s + invoiceOwed(i), 0) }
}

/* ---------- The screen ---------- */

export function Customers() {
  return <CustomersScreen />
}

export function CustomerDetail() {
  const { id } = useParams()
  return <CustomersScreen id={id} />
}

function CustomersScreen({ id }: { id?: string }) {
  const { data: book } = useBook()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    if (!book) return []
    const term = q.trim().toLowerCase()
    return [...book.customers]
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
      .filter((c) => !term || [c.name, c.phone, c.email, ...book.sites.filter((s) => s.customerId === c.id).flatMap((s) => [s.postcode, s.line1, s.town])].some((v) => v?.toLowerCase().includes(term)))
  }, [book, q])

  const picked = id ? find(book?.customers, id) : undefined
  // On a wide screen the list always has someone open beside it.
  const shown = picked ?? (id ? undefined : rows[0])
  const owed = book?.customers.reduce((s, c) => s + Math.max(0, c.balance), 0) ?? 0
  const late = book?.invoices.filter(isLate).reduce((s, i) => s + invoiceOwed(i), 0) ?? 0

  const crumbs = picked ? [{ label: 'Customers', to: '/customers' }, { label: picked.name }] : [{ label: 'Customers' }]
  const newCustomer = (
    <CustomerDialog>
      <button type="button" className={barButton}>
        <Icon name="plus" className="size-4" /> New customer
      </button>
    </CustomerDialog>
  )

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={crumbs} actions={newCustomer} />
      <PageHead
        title="Customers"
        book={book}
        className="pb-0"
        sub={book ? `${book.customers.length} customers at ${book.sites.length} addresses. ${owed ? `${pounds(owed)} owed${late ? `, ${pounds(late)} of it late.` : ', none of it late.'}` : 'Nobody owes you anything.'}` : ' '}
        figures={
          book && [
            { label: 'Customers', value: book.customers.length },
            { label: 'Owed to you', value: pounds(owed) },
            { label: 'Late', value: pounds(late), tone: late ? 'warn' : undefined },
          ]
        }
      />
      <div className="-mt-4 sm:hidden">{newCustomer}</div>

      {!book ? (
        <div className="h-[420px] animate-pulse rounded-[14px] bg-surface/60" />
      ) : id && !picked ? (
        <Card className="py-16 text-center text-[14px] text-muted">
          That customer isn't in the book.{' '}
          <Link to="/customers" className="text-foreground underline-offset-2 hover:underline">
            Back to customers
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          <section aria-label="All customers" className={cn('flex min-w-0 flex-col gap-4', picked && 'hidden lg:flex')}>
            <label className="flex h-10 items-center gap-2.5 rounded-[10px] bg-surface px-3.5 text-muted focus-within:ring-2 focus-within:ring-ring/60">
              <Icon name="search" className="size-4 shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, street or postcode" aria-label="Find a customer" className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted" />
            </label>
            <ul className="flex flex-col gap-0.5">
              {rows.map((c) => (
                <li key={c.id}>
                  <CustomerRow book={book} c={c} on={c.id === shown?.id} />
                </li>
              ))}
              {!rows.length && <li className="px-3.5 py-10 text-center text-[13px] text-muted">No one matches that.</li>}
            </ul>
          </section>
          {shown && (
            <div className={cn('min-w-0', !picked && 'hidden lg:block')}>
              <CustomerCard book={book} c={shown} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CustomerRow({ book, c, on }: { book: Book; c: Customer; on: boolean }) {
  const site = book.sites.find((s) => s.customerId === c.id)
  const { late } = moneyOf(book, c)
  return (
    <Link
      to={`/customers/${c.id}`}
      aria-current={on ? 'page' : undefined}
      className={cn('flex items-center gap-3.5 rounded-[10px] p-3.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', on ? 'bg-raised' : 'hover:bg-surface')}
    >
      <Monogram className="size-[38px]">{initialsOf(c.name)}</Monogram>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[14px]">{c.name}</span>
        <span className="truncate font-mono text-[10px] tracking-[.12em] whitespace-pre text-muted uppercase">
          {customerKind[c.kind]}
          {site?.town ? `  ${site.town}` : ''}
        </span>
      </span>
      <span className={cn('shrink-0 font-mono text-[13px]', c.balance > 0 ? (late ? 'text-warn' : 'text-foreground') : 'text-muted')}>{c.balance > 0 ? pounds(c.balance, { always: true }) : c.balance < 0 ? `${pounds(-c.balance)} CREDIT` : 'SQUARE'}</span>
    </Link>
  )
}

/** "Northgate Lettings" -> "NL", "The Crown & Anchor" -> "CA". */
function initialsOf(name: string) {
  const words = name.split(/\s+/).filter((w) => /^[a-z0-9]/i.test(w) && !/^(the|and|of)$/i.test(w))
  return (words.length ? words : name.split(/\s+/))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

/* ---------- One customer ---------- */

const STAGES: { label: string; at: JobStatus[] }[] = [
  { label: 'Enquiry', at: ['enquiry'] },
  { label: 'Quoted', at: ['quoted'] },
  { label: 'Booked', at: ['booked'] },
  { label: 'On the road', at: ['en_route'] },
  { label: 'On site', at: ['on_site', 'paused'] },
  { label: 'Done', at: ['complete'] },
  { label: 'Invoiced', at: ['invoiced'] },
  { label: 'Paid', at: ['paid'] },
]

function CustomerCard({ book, c }: { book: Book; c: Customer }) {
  const sites = book.sites.filter((s) => s.customerId === c.id)
  const jobs = book.jobs.filter((j) => j.customerId === c.id)
  const open = jobs.filter((j) => !isDone(j)).sort((a, b) => a.start.localeCompare(b.start))
  const past = jobs.filter((j) => isDone(j)).sort((a, b) => b.start.localeCompare(a.start))
  const invoices = book.invoices.filter((i) => i.customerId === c.id).sort((a, b) => (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9'))
  const quotes = book.quotes.filter((x) => x.customerId === c.id).sort((a, b) => (b.sentAt ?? '9').localeCompare(a.sentAt ?? '9'))
  const certs = book.certificates.filter((x) => sites.some((s) => s.id === x.siteId)).sort((a, b) => a.expires.localeCompare(b.expires))
  const lapsed = certs.filter((x) => x.state === 'overdue').length
  const { late } = moneyOf(book, c)

  return (
    <Card aria-label={c.name} className="flex flex-col gap-7 p-5 sm:p-[26px]">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="cap">{customerKind[c.kind]}</span>
          <h2 className="op-title text-[18px] tracking-[.16em] sm:text-[20px]">{c.name}</h2>
          <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px] text-muted">
            <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              {c.phone}
            </a>
            {c.email && (
              <a href={`mailto:${c.email}`} className="truncate outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                {c.email}
              </a>
            )}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <CustomerDialog customer={c}>
            <button type="button" className={softButton}>
              Edit
            </button>
          </CustomerDialog>
          <NewJobDialog customerId={c.id}>
            <button type="button" className={cn(softButton, 'font-medium')}>
              New job
            </button>
          </NewJobDialog>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Fig label="Owes you" tone={c.balance > 0 && late ? 'text-warn' : undefined}>
          {pounds(Math.max(0, c.balance), { always: true })}
        </Fig>
        <Fig label="Jobs">{jobs.length}</Fig>
        <Fig label="Addresses">{sites.length}</Fig>
        <Fig label="Certs out of date" tone={lapsed ? 'text-danger' : undefined}>
          {lapsed}
        </Fig>
      </dl>

      <div>
        <div className="flex items-center justify-between pb-2">
          <span className="cap">Addresses</span>
          <SiteDialog customerId={c.id}>
            <button type="button" className="rounded-md px-1.5 py-0.5 text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              Add address
            </button>
          </SiteDialog>
        </div>
        <ul className="flex flex-col gap-1.5">
          {sites.map((s) => (
            <li key={s.id} className="flex flex-wrap justify-between gap-3 rounded-[10px] bg-inset px-4 py-3.5">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px]">
                  {s.line1}
                  {s.town ? `, ${s.town}` : ''}
                </span>
                <span className="font-mono text-[12px] text-muted">{s.postcode}</span>
              </span>
              {s.accessNotes && (
                <span className="flex min-w-0 flex-col gap-1 sm:items-end">
                  <span className="cap">Getting in</span>
                  <span className="text-[13px] text-foreground/80">{s.accessNotes}</span>
                </span>
              )}
            </li>
          ))}
          {!sites.length && <li className="py-3 text-[13px] text-muted">No addresses yet.</li>}
        </ul>
      </div>

      <div>
        <span className="cap block pb-1.5">Jobs</span>
        <ul className="rows">
          {[...open, ...past].map((j) => (
            <li key={j.id}>
              <JobLine job={j} />
            </li>
          ))}
        </ul>
        {!jobs.length && <p className="py-3 text-[13px] text-muted">No jobs yet.</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <span className="cap block pb-1.5">Certificates</span>
          <ul className="rows">
            {certs.map((x) => (
              <li key={x.id}>
                <CertLine cert={x} where={sites.length > 1 ? find(sites, x.siteId)?.line1 : undefined} />
              </li>
            ))}
          </ul>
          {!certs.length && <p className="py-3 text-[13px] text-muted">None on file.</p>}
        </div>
        <div className="flex flex-col gap-6">
          <div>
            <span className="cap block pb-1.5">Invoices</span>
            <ul className="rows">
              {invoices.map((i) => (
                <li key={i.id}>
                  <InvoiceLine inv={i} />
                </li>
              ))}
            </ul>
            {!invoices.length && <p className="py-3 text-[13px] text-muted">Nothing invoiced yet.</p>}
          </div>
          {quotes.length > 0 && (
            <div>
              <span className="cap block pb-1.5">Quotes</span>
              <ul className="rows">
                {quotes.map((x) => (
                  <li key={x.id}>
                    <Link to={`/quotes/${x.id}`} className="flex items-center gap-2.5 py-[11px] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60">
                      <span className={cn('size-[7px] shrink-0 rounded-full', { draft: 'bg-[#6b6b6b]', sent: 'bg-info', accepted: 'bg-ok', declined: 'bg-danger', expired: 'bg-[#6b6b6b]' }[x.status])} />
                      <span className="font-mono text-[12px]">{x.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{quoteStatus[x.status].label}</span>
                      <span className="font-mono text-[13px]">{pounds(totals({ lines: x.lines }).total, { always: true })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Fig({ label, tone, children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <dt className="cap">{label}</dt>
      <dd className={cn('op-number truncate text-[24px] sm:text-[26px]', tone)}>{children}</dd>
    </div>
  )
}

function JobLine({ job }: { job: Job }) {
  const at = STAGES.findIndex((s) => s.at.includes(job.status))
  const now = today()
  const when =
    job.priority === 'emergency' && !job.operatorIds.length && !isDone(job) ? 'ASAP' : onDay(job.start, now) ? `TODAY ${clock(job.start)}` : upDate(job.start)
  const word = job.status === 'cancelled' ? 'Cancelled' : job.status === 'paused' ? 'Paused' : STAGES[at]?.label
  return (
    <Link
      to={`/jobs/${job.id}`}
      className={cn(
        'grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3.5 py-3 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60 sm:grid-cols-[64px_minmax(0,1fr)_150px_96px]',
        job.status === 'cancelled' && 'opacity-50',
      )}
    >
      <span className="font-mono text-[12px]">{job.ref}</span>
      <span className="truncate text-[14px]">{job.title}</span>
      <span className="hidden flex-col gap-1.5 sm:flex" aria-label={`Stage: ${word}`}>
        {at >= 0 && (
          <span aria-hidden className="flex items-center">
            {STAGES.map((s, k) => (
              <span key={s.label} className="flex items-center">
                <span className={cn('shrink-0 rounded-full', k === at ? 'size-[9px]' : 'size-[6px]', k <= at ? 'bg-foreground' : 'bg-line-strong')} />
                {k < STAGES.length - 1 && <span className={cn('h-px w-[9px]', k < at ? 'bg-muted' : 'bg-line-strong')} />}
              </span>
            ))}
          </span>
        )}
        <span className="font-mono text-[10px] tracking-[.12em] text-muted">{word}</span>
      </span>
      <span className="text-right font-mono text-[12px] text-muted">
        {when}
        <span className="mt-0.5 block text-[10px] tracking-[.1em] sm:hidden">{word}</span>
      </span>
    </Link>
  )
}

/** "21 SEP" */
const upDate = (iso: string) => shortDate(iso).replace('Sept', 'Sep').toUpperCase()

const certName: Partial<Record<Certificate['kind'], string>> = { CP12: 'Gas safety (CP12)', BS5839: 'Fire alarm (BS5839)', PAT: 'PAT testing' }

function CertLine({ cert, where }: { cert: Certificate; where?: string }) {
  const iso = `${cert.expires}T12:00:00Z`
  const d = daysTo(cert.expires)
  const date = upDate(iso)
  const word = cert.state === 'draft' ? 'DRAFT' : d < 0 ? `RAN OUT ${date}` : `RUNS OUT ${date}${d > 330 ? ` ${iso.slice(2, 4)}` : ''}`
  return (
    <Link to="/certificates" className="flex items-center gap-2.5 py-[11px] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60">
      <span className={cn('size-[7px] shrink-0 rounded-full', { overdue: 'bg-danger', due_soon: 'bg-warn', valid: 'bg-ok', draft: 'bg-[#6b6b6b]' }[cert.state])} />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {certName[cert.kind] ?? cert.kind}
        {where && <span className="text-muted"> · {where}</span>}
      </span>
      <span className="shrink-0 font-mono text-[12px] text-muted">{word}</span>
    </Link>
  )
}

function InvoiceLine({ inv }: { inv: Invoice }) {
  const late = isLate(inv)
  const word =
    inv.status === 'draft'
      ? 'Draft, not sent'
      : inv.status === 'void'
        ? 'Void'
        : inv.status === 'paid'
          ? `Paid${inv.issuedAt ? `, sent ${shortDate(inv.issuedAt)}` : ''}`
          : late
            ? `${daysLate(inv)} ${daysLate(inv) === 1 ? 'day' : 'days'} late`
            : inv.status === 'part_paid'
              ? `Part paid, ${pounds(invoiceOwed(inv))} to come`
              : inv.dueAt
                ? `Due ${shortDate(inv.dueAt)}`
                : 'Sent'
  return (
    <Link to={`/invoices/${inv.id}`} className={cn('flex items-center gap-2.5 py-[11px] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60', inv.status === 'void' && 'opacity-50')}>
      <span className={cn('size-[7px] shrink-0 rounded-full', late ? 'bg-warn' : inv.status === 'paid' ? 'bg-ok' : inv.status === 'draft' || inv.status === 'void' ? 'bg-[#6b6b6b]' : 'bg-info')} />
      <span className="font-mono text-[12px]">{inv.ref}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{word}</span>
      <span className="shrink-0 font-mono text-[13px]">{pounds(owing(inv) ? invoiceOwed(inv) : invoiceTotal(inv), { always: true })}</span>
    </Link>
  )
}
