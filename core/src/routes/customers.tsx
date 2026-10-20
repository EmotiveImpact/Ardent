import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Building2, FileBadge2, MapPin, Phone, Plus, Receipt, Search, Users, Wrench } from 'lucide-react'
import { certificateState, customerKind, invoiceStatus, jobStatus, pounds, shortDate } from '@kit'
import { Panel, PanelHeader, Row, Well, PageHeader } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, selectClass } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NewJobDialog } from '@/components/new-job-dialog'
import { useArdent, useBook } from '@/data/ardent'
import type { Customer } from '@/data/model'
import { act } from '@/lib/act'
import { find, invoiceOwed, invoiceTotal, isDone } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const kinds: Customer['kind'][] = ['homeowner', 'landlord', 'letting_agent', 'business']

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
      <DialogContent className="max-w-xl">
        <div className="px-3 pt-3 pb-3">
          <DialogTitle>{customer ? 'Customer details' : 'New customer'}</DialogTitle>
          <DialogDescription>{customer ? 'Name, number and email.' : 'Who they are and where the work is.'}</DialogDescription>
        </div>
        <Well className="space-y-4 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="cd-name">
              <Input id="cd-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hannah Price" />
            </Field>
            <Field label="Type" htmlFor="cd-kind">
              <select id="cd-kind" className={selectClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Customer['kind'] })}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {customerKind[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone" htmlFor="cd-phone">
              <Input id="cd-phone" className="font-mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07700 900123" />
            </Field>
            <Field label="Email" htmlFor="cd-email">
              <Input id="cd-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
          {!customer && (
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface p-3 sm:grid-cols-[1.4fr_1fr_0.8fr]">
              <Field label="Address" htmlFor="cd-line1">
                <Input id="cd-line1" value={site.line1} onChange={(e) => setSite({ ...site, line1: e.target.value })} placeholder="14 Alder Road" />
              </Field>
              <Field label="Town" htmlFor="cd-town">
                <Input id="cd-town" value={site.town} onChange={(e) => setSite({ ...site, town: e.target.value })} placeholder="Didsbury" />
              </Field>
              <Field label="Postcode" htmlFor="cd-pc">
                <Input id="cd-pc" className="font-mono uppercase" value={site.postcode} onChange={(e) => setSite({ ...site, postcode: e.target.value })} placeholder="M20 6BT" />
              </Field>
            </div>
          )}
          <Button variant="ember" className="h-11 w-full" disabled={!ready || busy} onClick={() => void save()}>
            {customer ? 'Save' : 'Add customer'}
          </Button>
        </Well>
      </DialogContent>
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
      <DialogContent>
        <div className="px-3 pt-3 pb-3">
          <DialogTitle>New address</DialogTitle>
          <DialogDescription>Another property this customer looks after.</DialogDescription>
        </div>
        <Well className="space-y-3 p-3">
          <Field label="Address" htmlFor="sd-line1">
            <Input id="sd-line1" autoFocus value={site.line1} onChange={(e) => setSite({ ...site, line1: e.target.value })} placeholder="Flat 3, 22 Wilmslow Road" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Town" htmlFor="sd-town">
              <Input id="sd-town" value={site.town} onChange={(e) => setSite({ ...site, town: e.target.value })} />
            </Field>
            <Field label="Postcode" htmlFor="sd-pc">
              <Input id="sd-pc" className="font-mono uppercase" value={site.postcode} onChange={(e) => setSite({ ...site, postcode: e.target.value })} />
            </Field>
          </div>
          <Field label="Getting in" htmlFor="sd-access">
            <Input id="sd-access" value={site.accessNotes} onChange={(e) => setSite({ ...site, accessNotes: e.target.value })} placeholder="Key safe 4471, dog in the garden" />
          </Field>
          <Button variant="ember" className="h-11 w-full" disabled={!ready} onClick={() => void save()}>
            Add address
          </Button>
        </Well>
      </DialogContent>
    </Dialog>
  )
}

export function Customers() {
  const { data: book } = useBook()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    if (!book) return []
    const term = q.trim().toLowerCase()
    return [...book.customers]
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
      .filter((c) => !term || [c.name, c.phone, c.email, ...book.sites.filter((s) => s.customerId === c.id).flatMap((s) => [s.postcode, s.line1])].some((v) => v?.toLowerCase().includes(term)))
  }, [book, q])
  const owed = book?.customers.reduce((s, c) => s + c.balance, 0) ?? 0

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow={book ? `${book.customers.length} customers, ${book.sites.length} addresses, ${pounds(owed)} owed` : 'Everyone you work for'}
        title="Customers"
        aside={
          <CustomerDialog>
            <Button variant="ember" size="sm">
              New customer
            </Button>
          </CustomerDialog>
        }
      />
      <div className="flex justify-end">
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or postcode" className="h-9 w-full rounded-md bg-surface pr-3 pl-8 text-[13px] outline-none placeholder:text-faint" />
        </label>
      </div>
      <Panel>
        <PanelHeader icon={<Users />} title={`${rows.length} customers`} />
        <Well className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b">
                {['Customer', 'Type', 'Phone', 'Addresses', 'Jobs', 'Last job', 'Owes'].map((h) => (
                  <th key={h} className={cn('h-10 px-3 font-normal', h === 'Owes' && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const jobs = book!.jobs.filter((j) => j.customerId === c.id).sort((a, b) => b.start.localeCompare(a.start))
                const sites = book!.sites.filter((s) => s.customerId === c.id)
                const live = jobs.filter((j) => !isDone(j) && j.status !== 'cancelled').length
                return (
                  <tr key={c.id} className="group border-b last:border-0 hover:bg-white/[0.02]">
                    <td className="h-12 px-3">
                      <Link to={`/customers/${c.id}`} className="group-hover:text-white">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 text-muted">{customerKind[c.kind]}</td>
                    <td className="px-3 font-mono text-[12px] text-muted">{c.phone}</td>
                    <td className="px-3">
                      <span className="flex items-center gap-1.5">
                        <Chip>{sites[0]?.postcode ?? '·'}</Chip>
                        {sites.length > 1 && <span className="font-mono text-[11px] text-faint">+{sites.length - 1}</span>}
                      </span>
                    </td>
                    <td className="px-3 font-mono text-[12px]">
                      {jobs.length}
                      {live > 0 && <span className="ml-1.5 text-faint">{live} open</span>}
                    </td>
                    <td className="px-3 font-mono text-[12px] text-muted">{jobs[0] ? shortDate(jobs[0].start) : '·'}</td>
                    <td className={cn('px-3 text-right font-mono tabular', c.balance ? 'text-foreground' : 'text-faint')}>{c.balance ? pounds(c.balance) : '·'}</td>
                  </tr>
                )
              })}
              {book && !rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-faint">
                    No one matches that.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Well>
      </Panel>
    </div>
  )
}

export function CustomerDetail() {
  const { id } = useParams()
  const { data: book } = useBook()
  const customer = find(book?.customers, id)
  if (!book) return <div className="mx-auto h-40 max-w-[1600px] animate-pulse rounded-xl bg-surface/60" />
  if (!customer)
    return (
      <div className="mx-auto max-w-[1600px] py-20 text-center text-muted">
        That customer isn't in the book. <Link to="/customers" className="text-foreground underline-offset-2 hover:underline">Back to customers</Link>
      </div>
    )

  const sites = book.sites.filter((s) => s.customerId === customer.id)
  const jobs = book.jobs.filter((j) => j.customerId === customer.id).sort((a, b) => b.start.localeCompare(a.start))
  const invoices = book.invoices.filter((i) => i.customerId === customer.id).sort((a, b) => (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9'))
  const certs = book.certificates.filter((c) => sites.some((s) => s.id === c.siteId)).sort((a, b) => a.expires.localeCompare(b.expires))
  const billed = invoices.filter((i) => i.status !== 'void' && i.status !== 'draft').reduce((s, i) => s + invoiceTotal(i), 0)

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow={`${customerKind[customer.kind]}${jobs.length ? `, first job ${shortDate(jobs[jobs.length - 1].start)}` : ''}`}
        title={customer.name}
        aside={
          <>
            <CustomerDialog customer={customer}>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </CustomerDialog>
            <NewJobDialog customerId={customer.id}>
              <Button variant="ember" size="sm">
                New job
              </Button>
            </NewJobDialog>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Panel>
            <PanelHeader icon={<Phone />} title="Details" />
            <Well className="divide-y divide-line">
              <Row label="Phone">
                <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className="font-mono hover:text-white">
                  {customer.phone}
                </a>
              </Row>
              <Row label="Email">{customer.email ? <a href={`mailto:${customer.email}`} className="hover:text-white">{customer.email}</a> : <span className="text-faint">None</span>}</Row>
              <Row label="Owes">
                <span className={cn('font-mono tabular', customer.balance ? 'text-foreground' : 'text-faint')}>{pounds(customer.balance, { always: true })}</span>
              </Row>
              <Row label="Billed to date">
                <span className="font-mono tabular">{pounds(billed)}</span>
              </Row>
            </Well>
          </Panel>

          <Panel style={{ '--i': 1 } as CSSProperties}>
            <PanelHeader
              icon={<MapPin />}
              title={`Addresses · ${sites.length}`}
              actions={
                <SiteDialog customerId={customer.id}>
                  <Button variant="outline" size="xs">
                    <Plus /> Address
                  </Button>
                </SiteDialog>
              }
            />
            <Well className="divide-y divide-line">
              {sites.map((s) => (
                <div key={s.id} className="flex items-start gap-3 px-3 py-3 text-[13px]">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p>{s.line1}</p>
                    <p className="text-muted">{s.town}</p>
                    {s.accessNotes && <p className="mt-1 text-[12px] text-faint">{s.accessNotes}</p>}
                  </div>
                  <Chip>{s.postcode}</Chip>
                </div>
              ))}
            </Well>
          </Panel>

          {certs.length > 0 && (
            <Panel style={{ '--i': 2 } as CSSProperties}>
              <PanelHeader icon={<FileBadge2 />} title="Certificates" actions={<Link to="/certificates" className="text-[12px] text-muted hover:text-foreground">All certificates</Link>} />
              <Well className="divide-y divide-line">
                {certs.map((c) => (
                  <Row key={c.id} label={<span className="flex items-center gap-2"><Chip>{c.kind}</Chip><span className="text-muted">{find(sites, c.siteId)?.line1}</span></span>}>
                    <span className="font-mono text-[12px] text-muted">{shortDate(`${c.expires}T12:00:00Z`)}</span>
                    <Badge tone={certificateState[c.state].tone} dot>
                      {certificateState[c.state].label}
                    </Badge>
                  </Row>
                ))}
              </Well>
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel style={{ '--i': 1 } as CSSProperties}>
            <PanelHeader icon={<Wrench />} title={`Jobs · ${jobs.length}`} />
            <Well className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className={cn('group border-b last:border-0 hover:bg-white/[0.02]', isDone(j) && 'opacity-60 hover:opacity-100')}>
                      <td className="h-12 w-20 px-3">
                        <Link to={`/jobs/${j.id}`} className="font-mono text-[12px] group-hover:text-white">
                          {j.ref}
                        </Link>
                      </td>
                      <td className="px-3">
                        <Link to={`/jobs/${j.id}`}>{j.title}</Link>
                      </td>
                      <td className="px-3 font-mono text-[11px] text-faint">{find(sites, j.siteId)?.postcode}</td>
                      <td className="px-3 font-mono text-[12px] whitespace-nowrap text-muted">{shortDate(j.start)}</td>
                      <td className="px-3 text-right">
                        <Badge tone={jobStatus[j.status].tone} dot>
                          {jobStatus[j.status].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!jobs.length && (
                    <tr>
                      <td className="px-3 py-10 text-center text-faint">No jobs yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Well>
          </Panel>

          <Panel style={{ '--i': 2 } as CSSProperties}>
            <PanelHeader icon={<Receipt />} title={`Invoices · ${invoices.length}`} />
            <Well className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="group border-b last:border-0 hover:bg-white/[0.02]">
                      <td className="h-12 px-3">
                        <Link to={`/money?invoice=${i.id}`} className="font-mono text-[12px] group-hover:text-white">
                          {i.ref}
                        </Link>
                      </td>
                      <td className="px-3 font-mono text-[12px] text-muted">{i.issuedAt ? shortDate(i.issuedAt) : 'Draft'}</td>
                      <td className="px-3 text-right font-mono tabular">
                        {pounds(invoiceTotal(i))}
                        {invoiceOwed(i) > 0 && i.status !== 'draft' && i.status !== 'void' && <span className="block text-[11px] text-faint">{pounds(invoiceOwed(i))} owed</span>}
                      </td>
                      <td className="px-3 text-right">
                        <Badge tone={invoiceStatus[i.status].tone} dot>
                          {invoiceStatus[i.status].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!invoices.length && (
                    <tr>
                      <td className="px-3 py-10 text-center text-faint">Nothing invoiced yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Well>
          </Panel>
        </div>
      </div>
    </div>
  )
}
