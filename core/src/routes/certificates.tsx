import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ukDay } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, RowButton, SectionHead } from '@/components/ardent/parts'
import { Fact, StateMark } from '@/components/ardent/money-parts'
import { capDay, say, type Dot } from '@/components/ardent/money-lib'
import { daysTo } from '@/components/ardent/people-kit'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useBook, useQuery, type Book } from '@/data/ardent'
import type { Certificate, CertificateKind, GasAppliance, GasInstallation, GasSafetyRecord, Verdict } from '@/data/model'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const order: Certificate['state'][] = ['overdue', 'due_soon', 'valid', 'draft']
const dot: Record<Certificate['state'], string> = { overdue: 'bg-danger', due_soon: 'bg-warn', valid: 'bg-foreground', draft: 'bg-faint' }
const runsOutTone: Record<Certificate['state'], string> = { overdue: 'text-danger', due_soon: 'text-warn', valid: 'text-muted', draft: 'text-muted' }
const kindName: Record<CertificateKind, string> = { CP12: 'CP12', EICR: 'EICR', PAT: 'PAT', BS5839: 'Fire alarm', 'Boiler service': 'Boiler service', Unvented: 'Unvented' }

/** Words a renewal visit for this kind of certificate would carry in its title or notes. */
const renewalWords: Record<CertificateKind, string[]> = {
  CP12: ['cp12', 'gas safety'],
  'Boiler service': ['boiler service'],
  EICR: ['eicr', 'electrical installation condition'],
  PAT: ['pat test', 'portable appliance'],
  BS5839: ['bs5839', 'bs 5839', 'fire alarm'],
  Unvented: ['unvented'],
}
const OPEN_DONE = ['complete', 'invoiced', 'paid', 'cancelled']

/** A renewal visit already in the book: an open job at the same site for the same kind of work. */
function bookedFor(c: Certificate, book: Book) {
  const words = renewalWords[c.kind]
  return book.jobs.find((j) => j.siteId === c.siteId && !OPEN_DONE.includes(j.status) && words.some((w) => `${j.title} ${j.notes ?? ''}`.toLowerCase().includes(w)))
}

type Filter = 'all' | 'overdue' | 'due_soon' | 'valid'

export function Certificates() {
  const { data: book } = useBook()
  const [filter, setFilter] = useState<Filter>('all')
  const certs = book?.certificates ?? []
  const counts = { overdue: 0, due_soon: 0, valid: 0, draft: 0 }
  for (const c of certs) counts[c.state]++
  const rows = certs.filter((c) => filter === 'all' || c.state === filter).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.expires.localeCompare(b.expires))

  const sub = !book
    ? ' '
    : counts.overdue
      ? `${say(counts.overdue)} ${counts.overdue === 1 ? 'has' : 'have'} run out${counts.due_soon ? ` and ${say(counts.due_soon).toLowerCase()} more ${counts.due_soon === 1 ? 'runs' : 'run'} out in the next 30 days` : ''}. Book the renewals from here.`
      : counts.due_soon
        ? `Nothing has run out. ${say(counts.due_soon)} ${counts.due_soon === 1 ? 'runs' : 'run'} out in the next 30 days.`
        : 'Everything is in date.'

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Certs' }]} />
      <div className="flex flex-wrap items-end justify-between gap-x-10">
        <PageHead title="Certificates" book={book} sub={sub} className="pb-0" />
        {book && <Gauge certs={certs} counts={counts} filter={filter} setFilter={setFilter} />}
      </div>

      {!book ? (
        <div className="h-[420px] animate-pulse rounded-[14px] bg-surface/60" />
      ) : (
        <Card className="px-4 py-1.5 sm:px-[22px]">
          <div className="cap hidden gap-4 py-3.5 lg:grid lg:grid-cols-[130px_minmax(200px,2fr)_minmax(140px,1.3fr)_90px_100px_150px]">
            <span>Certificate</span>
            <span>Address</span>
            <span>Customer</span>
            <span>Issued</span>
            <span>Runs out</span>
            <span />
          </div>
          {!rows.length && <p className="py-10 text-center text-[14px] text-muted">{certs.length ? 'None in this state.' : 'No certificates yet.'}</p>}
          <ul className="rows lg:shadow-[inset_0_1px_0_var(--line)]">
            {rows.map((c) => (
              <CertRow key={c.id} c={c} book={book} />
            ))}
          </ul>
        </Card>
      )}

      {book && <GasRecords book={book} />}
    </div>
  )
}

function CertRow({ c, book }: { c: Certificate; book: Book }) {
  const site = find(book.sites, c.siteId)
  const customer = find(book.customers, site?.customerId)
  const visit = c.state === 'overdue' || c.state === 'due_soon' ? bookedFor(c, book) : undefined
  const needsBooking = (c.state === 'overdue' || c.state === 'due_soon') && !visit
  const address = site ? `${site.line1}, ${site.postcode}` : 'Unknown site'
  const action = visit ? (
    <Link to={`/jobs/${visit.id}`} className="rounded-sm font-mono text-[11px] tracking-[.1em] text-muted uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
      Booked {visit.ref}
    </Link>
  ) : needsBooking ? (
    <RowButton to={`/jobs/new?site=${c.siteId}&for=${encodeURIComponent(c.kind)}`} className="h-8 px-3">
      Book renewal
    </RowButton>
  ) : null
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 lg:grid lg:grid-cols-[130px_minmax(200px,2fr)_minmax(140px,1.3fr)_90px_100px_150px] lg:py-[11px]', (c.state === 'valid' || c.state === 'draft') && 'opacity-55')}>
      <span className="flex w-full items-center gap-2.5 text-[13.5px] lg:w-auto">
        <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', dot[c.state])} />
        {kindName[c.kind]}
        <span className="sr-only">, {c.state.replace('_', ' ')}</span>
        <span className={cn('ml-auto font-mono text-[11px] lg:hidden', runsOutTone[c.state])}>{capDay(c.expires)}</span>
      </span>
      <span className="min-w-0 flex-1 truncate pl-[17px] text-[14px] lg:flex-none lg:pl-0">{address}</span>
      <span className="hidden min-w-0 truncate text-[13.5px] text-[#c8c8c8] lg:block">
        {customer ? (
          <Link to={`/customers/${customer.id}`} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
            {customer.name}
          </Link>
        ) : null}
      </span>
      <span className="hidden font-mono text-[12px] text-muted lg:block">{c.issued ? capDay(c.issued) : '--'}</span>
      <span className={cn('hidden font-mono text-[12px] lg:block', runsOutTone[c.state])}>{capDay(c.expires)}</span>
      <span className="flex shrink-0 justify-end lg:min-h-8 lg:items-center">{action}</span>
      <span className="w-full truncate pl-[17px] text-[12.5px] text-muted lg:hidden">{customer?.name}</span>
    </li>
  )
}

/** In date out of all, one segment per certificate, and a legend that filters the list. */
function Gauge({ certs, counts, filter, setFilter }: { certs: Certificate[]; counts: Record<Certificate['state'], number>; filter: Filter; setFilter: (f: Filter) => void }) {
  const live = certs.filter((c) => c.state !== 'draft')
  const segs = [...live].sort((a, b) => order.indexOf(b.state) - order.indexOf(a.state))
  const inDate = counts.valid + counts.due_soon
  const legend: { key: Filter; label: string; n: number; dot: string }[] = [
    { key: 'overdue', label: 'Run out', n: counts.overdue, dot: 'bg-danger' },
    { key: 'due_soon', label: 'Due in 30 days', n: counts.due_soon, dot: 'bg-warn' },
    { key: 'valid', label: 'Fine', n: counts.valid, dot: 'bg-foreground' },
  ]
  return (
    <div className="flex w-[440px] max-w-full flex-col gap-3 pt-6">
      <div className="flex items-baseline justify-between">
        <span className="cap">In date</span>
        <span className="op-number text-[30px]">
          {inDate} <span className="text-[16px] text-muted">of {live.length}</span>
        </span>
      </div>
      <div aria-hidden className="flex gap-[3px]">
        {segs.map((c) => (
          <span key={c.id} className={cn('h-2 flex-1 rounded-[1px]', dot[c.state])} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show only">
        {legend.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={filter === l.key}
            onClick={() => setFilter(filter === l.key ? 'all' : l.key)}
            className={cn('cap flex h-7 items-center gap-1.5 rounded-full px-2.5 outline-none transition-colors first:-ml-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60', filter === l.key && 'bg-raised text-foreground')}
          >
            <span className={cn('size-[7px] rounded-full', l.dot)} />
            {l.label} <span className="text-foreground">{l.n}</span>
          </button>
        ))}
        {filter !== 'all' && (
          <button type="button" onClick={() => setFilter('all')} className="cap flex h-7 items-center rounded-full px-2.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
            Show all
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- Gas safety records (CP12) ---------- */

const flueWord: Record<GasAppliance['flue'], string> = { room_sealed: 'Room sealed', open_flue: 'Open flue', flueless: 'Flueless' }
const unsafeWord: Record<NonNullable<GasAppliance['unsafe']>, string> = { at_risk: 'At risk', immediately_dangerous: 'Immediately dangerous' }
const verdictWord: Record<Verdict, string> = { pass: 'Pass', fail: 'Fail', 'n/a': 'Not needed', pending: 'Still to do' }
const verdictDot: Record<Verdict, Dot> = { pass: 'ok', fail: 'danger', 'n/a': 'faint', pending: 'grey' }
const checkName: Record<keyof GasAppliance['checks'], string> = { flue: 'Flue', ventilation: 'Ventilation', safetyDevice: 'Safety device', spillage: 'Spillage' }
const installName: Record<keyof GasInstallation, string> = { tightness: 'Tightness test', ecv: 'Emergency control valve', bonding: 'Bonding', pipework: 'Pipework', coAlarm: 'CO alarm' }
const gasCols = 'lg:grid-cols-[96px_minmax(180px,1.6fr)_minmax(140px,1.1fr)_90px_90px_96px_minmax(200px,1.6fr)]'

/** What the engineer said about an appliance's safety, in words and a dot. */
function safety(a: GasAppliance): { label: string; dot: Dot } {
  if (a.unsafe) return { label: unsafeWord[a.unsafe], dot: 'danger' }
  if (a.safe === false) return { label: 'Not safe to use', dot: 'danger' }
  if (a.safe) return { label: 'Safe to use', dot: 'ok' }
  return { label: 'Not said yet', dot: 'grey' }
}

/** The worst appliance on a record: immediately dangerous, then at risk, then any other not safe to use. */
function worst(r: GasSafetyRecord) {
  return r.appliances.find((a) => a.unsafe === 'immediately_dangerous') ?? r.appliances.find((a) => a.unsafe === 'at_risk') ?? r.appliances.find((a) => a.safe === false)
}

const where = (a: GasAppliance) => `${a.type} in the ${a.location.toLowerCase()}`

/** The landlord gas safety records the crew fill in on site. The office reads them here. */
function GasRecords({ book }: { book: Book }) {
  const { data: records } = useQuery((c) => c.gasRecords.list())
  return (
    <Card className="px-4 pt-5 pb-1.5 sm:px-[22px]">
      <SectionHead title={`Gas safety records · ${records?.length ?? ''}`} aside="Filled in on the phone. Open one to see the readings." className="pb-1" />
      <div className={cn('cap hidden gap-4 py-3.5 lg:grid', gasCols)}>
        <span>Record</span>
        <span>Address</span>
        <span>Customer</span>
        <span>Issued</span>
        <span>Runs to</span>
        <span>Appliances</span>
        <span>Safety</span>
      </div>
      {!records && <div className="mb-4 h-24 animate-pulse rounded-[10px] bg-inset" />}
      {records && !records.length && <p className="py-10 text-center text-[14px] text-muted">No gas safety records yet. The crew start one on the phone at a landlord's job.</p>}
      <ul className="rows lg:shadow-[inset_0_1px_0_var(--line)]">
        {records?.map((r) => (
          <li key={r.id}>
            <GasRecordDialog r={r} book={book}>
              <GasRow r={r} book={book} />
            </GasRecordDialog>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** One record in a row. Forwards the dialog trigger's props to the button. */
function GasRow({ r, book, ...props }: { r: GasSafetyRecord; book: Book } & React.ComponentProps<'button'>) {
  const site = find(book.sites, r.siteId)
  const customer = find(book.customers, r.customerId)
  const bad = worst(r)
  const left = r.expires ? daysTo(r.expires) : undefined
  const runsTone = left === undefined ? 'text-muted' : left < 0 ? 'text-danger' : left <= 30 ? 'text-warn' : 'text-muted'
  const count = `${r.appliances.length} ${r.appliances.length === 1 ? 'appliance' : 'appliances'}`
  const said = r.status === 'draft' ? 'Being filled in on site' : bad ? `${bad.unsafe ? unsafeWord[bad.unsafe] : 'Not safe to use'}: ${where(bad)}${bad.defects ? `, ${bad.defects.charAt(0).toLowerCase()}${bad.defects.slice(1)}` : ''}` : 'All safe to use'
  const verdict =
    r.status === 'draft' ? (
      <StateMark dot="info" className="text-[13px] text-muted">
        Being filled in on site
      </StateMark>
    ) : bad ? (
      <StateMark dot="danger" className="min-w-0 text-[13px] text-danger">
        <span className="truncate" title={said}>
          {said}
        </span>
      </StateMark>
    ) : (
      <StateMark dot="ok" className="text-[13px] text-muted">
        All safe to use
      </StateMark>
    )
  return (
    <button
      type="button"
      aria-label={`Open ${r.ref}, ${site?.line1 ?? 'gas safety record'}. ${said}`}
      {...props}
      className={cn('-mx-2 flex w-[calc(100%+16px)] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-3 text-left outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring/60 lg:grid lg:py-[11px]', gasCols)}
    >
      <span className="flex w-full items-center gap-2.5 font-mono text-[12px] lg:w-auto">
        {r.ref}
        <span className={cn('ml-auto font-mono text-[11px] lg:hidden', runsTone)}>{r.expires ? `TO ${capDay(r.expires)}` : 'DRAFT'}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] lg:flex-none">{site ? `${site.line1}, ${site.postcode}` : 'Unknown site'}</span>
      <span className="hidden min-w-0 truncate text-[13.5px] text-[#c8c8c8] lg:block">{customer?.name}</span>
      <span className="hidden font-mono text-[12px] text-muted lg:block">{r.issuedAt ? capDay(ukDay(r.issuedAt)) : '--'}</span>
      <span className={cn('hidden font-mono text-[12px] lg:block', runsTone)}>{r.expires ? capDay(r.expires) : '--'}</span>
      <span className="hidden text-[13px] text-muted lg:block">{count}</span>
      <span className="flex w-full min-w-0 lg:w-auto">{verdict}</span>
      <span className="w-full truncate font-mono text-[11px] text-muted uppercase lg:hidden">
        {customer?.name} <span className="text-faint">·</span> {count}
      </span>
    </button>
  )
}

/** The whole record: each appliance's readings and checks, and the checks on the installation. */
function GasRecordDialog({ r, book, children }: { r: GasSafetyRecord; book: Book; children: ReactNode }) {
  const site = find(book.sites, r.siteId)
  const customer = find(book.customers, r.customerId)
  const engineer = find(book.operators, r.operatorId)
  const job = find(book.jobs, r.jobId)
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const line =
    r.status === 'draft'
      ? `Being filled in on site${engineer ? ` by ${engineer.name}` : ''}. It becomes a certificate once it's issued from the phone.`
      : `Issued ${r.issuedAt ? day(ukDay(r.issuedAt)) : ''}${engineer ? ` by ${engineer.name}` : ''}. Runs to ${r.expires ? day(r.expires) : '--'}.`
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto p-2">
        <div className="px-4 pt-4 pb-2">
          <p className="cap pb-2.5">
            CP12 <span className="text-faint">·</span> {r.ref}
            {job && (
              <>
                {' '}
                <span className="text-faint">·</span>{' '}
                <Link to={`/jobs/${job.id}`} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                  {job.ref}
                </Link>
              </>
            )}
          </p>
          <DialogTitle className="op-title pr-8 text-[17px] font-normal tracking-[.14em]">{site ? site.line1 : 'Gas safety record'}</DialogTitle>
          <DialogDescription className="mt-2.5 text-[13px] text-muted">
            {customer ? `${customer.name}, ${site?.postcode ?? ''}. ` : ''}
            {line}
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-5 px-4 pt-2 pb-4">
          <section aria-label="Appliances" className="flex flex-col gap-2">
            <h3 className="cap pb-1">Appliances · {r.appliances.length}</h3>
            {r.appliances.map((a) => (
              <Appliance key={a.id} a={a} />
            ))}
            {!r.appliances.length && <p className="rounded-[10px] bg-inset px-3.5 py-3 text-[13px] text-muted">No appliances on it yet.</p>}
          </section>
          <section aria-label="The installation">
            <h3 className="cap pb-1">The installation</h3>
            <div className="rows">
              {(Object.keys(installName) as (keyof GasInstallation)[]).map((k) => (
                <Fact key={k} label={installName[k]}>
                  <StateMark dot={verdictDot[r.installation[k]]} className={cn(r.installation[k] === 'fail' && 'text-danger')}>
                    {verdictWord[r.installation[k]]}
                  </StateMark>
                </Fact>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Reading({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="cap truncate text-[10.5px]">{label}</dt>
      <dd className="font-mono text-[14px]">
        {value ?? '--'}
        {value !== undefined && unit && <span className="ml-1 text-[11px] text-muted">{unit}</span>}
      </dd>
    </div>
  )
}

/** One appliance: what and where, whether it's safe, the analyser readings and the four checks. */
function Appliance({ a }: { a: GasAppliance }) {
  const s = safety(a)
  const flagged = s.dot === 'danger'
  return (
    <article aria-label={`${a.type}, ${a.location}`} className="flex flex-col gap-3.5 rounded-[10px] bg-inset px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[14px]">
            {a.type} <span className="text-muted">· {a.location}</span>
          </span>
          <span className="font-mono text-[11px] text-muted uppercase">
            {[a.make, a.model].filter(Boolean).join(' ') || 'Make not noted'} <span className="text-faint">·</span> {flueWord[a.flue]}
            {a.landlords && (
              <>
                {' '}
                <span className="text-faint">·</span> Landlord's
              </>
            )}
          </span>
        </div>
        <StateMark dot={s.dot} className={cn('shrink-0 text-[13px]', flagged && 'text-danger')}>
          {s.label}
        </StateMark>
      </div>
      {a.defects && <p className={cn('text-[13px]', flagged ? 'text-danger' : 'text-muted')}>{a.defects}</p>}
      <dl className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-5">
        <Reading label="Pressure" value={a.pressure} unit="mbar" />
        <Reading label="Heat input" value={a.heatInput} unit="kW" />
        <Reading label="CO" value={a.co} unit="ppm" />
        <Reading label="CO2" value={a.co2} unit="%" />
        <Reading label="CO/CO2" value={a.ratio} />
      </dl>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]" aria-label="Checks">
        {(Object.keys(checkName) as (keyof GasAppliance['checks'])[]).map((k) => (
          <li key={k}>
            <StateMark dot={verdictDot[a.checks[k]]}>
              {checkName[k]} <span className={cn('text-muted', a.checks[k] === 'fail' && 'text-danger')}>{verdictWord[a.checks[k]].toLowerCase()}</span>
            </StateMark>
          </li>
        ))}
      </ul>
    </article>
  )
}
