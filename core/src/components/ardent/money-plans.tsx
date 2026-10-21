import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { pounds, shortDate } from '@kit'
import { Card, SectionHead } from '@/components/ardent/parts'
import { StateMark } from '@/components/ardent/money-parts'
import { capDay, greyButton, type Dot } from '@/components/ardent/money-lib'
import { FormDialog } from '@/components/ardent/people-parts'
import { solidButton } from '@/components/ardent/people-kit'
import { penceOf } from '@/components/ardent/price-parts'
import { LinkBox, TestButton, usePretend } from '@/components/ardent/pay-parts'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { fieldClass, selectClass } from '@/components/ui/field'
import { useArdent, useQuery, type Book } from '@/data/ardent'
import type { LedgerLine, ServicePlan } from '@/data/model'
import { act, problem } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * Service plans by Direct Debit, and the Stripe clearing account for Xero.
 * Plans keep to servicing and discounts: one that pays for repairs can count
 * as insurance, and the engine turns that wording down.
 */

const PLAN: Record<ServicePlan['status'], { dot: Dot; text: string }> = {
  awaiting_signature: { dot: 'warn', text: 'Waiting for them to sign' },
  active: { dot: 'ok', text: 'Collecting' },
  payment_failed: { dot: 'danger', text: 'Direct Debit failed' },
  cancelled: { dot: 'faint', text: 'Cancelled' },
}

export function Plans({ book, demo }: { book: Book; demo: boolean }) {
  const { data: plans } = useQuery((c) => c.plans.list())
  const { hash } = useLocation()
  useEffect(() => {
    if (plans && hash === '#plans') document.getElementById('plans')?.scrollIntoView({ block: 'start' })
  }, [plans, hash])
  const rows = plans ?? []
  const live = rows.filter((p) => p.status === 'active' || p.status === 'payment_failed')
  return (
    <Card id="plans" className="min-w-0 scroll-mt-6 px-4 pt-5 pb-2 sm:px-[22px] xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1.5">
        <h2 className="cap">Service plans · {rows.length}</h2>
        <div className="flex items-center gap-3">
          {live.length > 0 && <span className="hidden font-mono text-[11px] text-muted uppercase sm:inline">{pounds(live.reduce((t, p) => t + p.monthly, 0))} a month from {live.length}</span>}
          <NewPlan book={book} />
        </div>
      </div>
      <p className="pb-2 text-[12.5px] text-muted">Customers pay monthly by Direct Debit. Ardent books each yearly service four weeks before it's due.</p>
      {!plans && <div className="h-32 animate-pulse rounded-[10px] bg-inset" />}
      {plans && !rows.length && <p className="py-8 text-center text-[14px] text-muted">No plans yet. A plan is a monthly Direct Debit for a yearly service and a discount on repairs.</p>}
      <ul className="rows">
        {rows.map((p) => (
          <PlanRow key={p.id} plan={p} book={book} demo={demo} />
        ))}
      </ul>
    </Card>
  )
}

function PlanRow({ plan: p, book, demo }: { plan: ServicePlan; book: Book; demo: boolean }) {
  const { client } = useArdent()
  const pretend = usePretend()
  const [cancelling, setCancelling] = useState(false)
  const who = find(book.customers, p.customerId)?.name ?? 'Customer'
  const site = find(book.sites, p.siteId)
  const st = PLAN[p.status]
  const collecting = p.status === 'active' || p.status === 'payment_failed'
  return (
    <li className={cn('flex flex-col gap-3 py-4', p.status === 'cancelled' && 'opacity-55')}>
      <div className="flex items-start gap-x-4">
        <span className="hidden w-[52px] shrink-0 pt-0.5 font-mono text-[12px] text-muted sm:block">{p.ref}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px]">
            {who} <span className="text-muted">· {p.name}</span>
          </span>
          <span className="text-[12.5px] text-muted">
            {p.includes.join(', ')}
            {site && `. At ${site.line1}`}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted uppercase">
            <span>{pounds(p.collected)} collected</span>
            {p.status !== 'cancelled' && <span>Next service {capDay(p.nextService)}</span>}
            <span className="sm:hidden">{p.ref}</span>
          </span>
          <StateMark dot={st.dot} className={cn('text-[12.5px] sm:hidden', p.status === 'payment_failed' ? 'text-danger' : 'text-muted')}>
            {st.text}
          </StateMark>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-mono text-[13px] tabular">
            {pounds(p.monthly, { always: true })}
            <span className="text-muted"> a month</span>
          </span>
          <StateMark dot={st.dot} className={cn('hidden text-[12.5px] sm:inline-flex', p.status === 'payment_failed' ? 'text-danger' : 'text-muted')}>
            {st.text}
          </StateMark>
        </span>
      </div>
      {p.failures > 0 && p.status !== 'cancelled' && (
        <p className="text-[12.5px] text-danger sm:pl-[68px]">
          Failed {p.failures === 1 ? 'once' : `${p.failures} times`}
          {p.lastFailedAt && `, last on ${shortDate(p.lastFailedAt)}`}. Give them a ring.
        </p>
      )}
      {p.status === 'awaiting_signature' && p.signLink && (
        <div className="flex flex-col gap-2 sm:pl-[68px]">
          <p className="text-[12.5px] text-muted">Send them this link to sign the Direct Debit. Nothing is collected until they do.</p>
          <LinkBox url={p.signLink} demo={demo} scanLabel="Scan to sign" />
        </div>
      )}
      {p.status !== 'cancelled' && (
        <div className="flex flex-wrap items-center gap-2 sm:pl-[68px]">
          {cancelling ? (
            <>
              <span className="text-[12.5px] text-muted">Stop the Direct Debit and the yearly service bookings?</span>
              <button type="button" className={cn(greyButton, 'h-8 px-3 text-[12.5px] text-danger')} onClick={() => void act(client.plans.cancel(p.id), `${p.ref} cancelled. Nothing more is collected.`)}>
                Yes, cancel it
              </button>
              <button type="button" className="h-8 rounded-lg px-2.5 text-[12.5px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60" onClick={() => setCancelling(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className={cn(greyButton, 'h-8 px-3 text-[12.5px]')} onClick={() => setCancelling(true)}>
              Cancel plan
            </button>
          )}
          {demo && collecting && !cancelling && (
            <>
              <TestButton onClick={() => void pretend({ kind: 'plan_collected', planId: p.id }, `Pretend: ${pounds(p.monthly)} collected on ${p.ref}`)}>Pretend this month's Direct Debit</TestButton>
              {p.status === 'active' && <TestButton onClick={() => void pretend({ kind: 'plan_failed', planId: p.id }, `Pretend: the Direct Debit on ${p.ref} failed`)}>Pretend it failed</TestButton>}
            </>
          )}
        </div>
      )}
    </li>
  )
}

const inYear = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

/** Set up a plan: who, where, what it's called, the monthly amount and what it covers. */
function NewPlan({ book }: { book: Book }) {
  const { client } = useArdent()
  const [open, setOpen] = useState(false)
  const start = () => ({ customerId: '', siteId: '', name: 'Boiler care', monthly: '', includes: '', first: inYear() })
  const [f, setF] = useState(start)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const customers = [...book.customers].sort((a, b) => a.name.localeCompare(b.name))
  const sites = book.sites.filter((s) => s.customerId === f.customerId)
  const monthly = penceOf(f.monthly)
  const includes = f.includes.split('\n').map((x) => x.trim()).filter(Boolean)
  const missing = !f.customerId ? 'a customer' : !f.name.trim() ? 'a name' : monthly === undefined ? 'the monthly amount' : !includes.length ? 'what it covers' : undefined
  const reopen = (on: boolean) => {
    if (on) {
      setF(start())
      setError(undefined)
    }
    setOpen(on)
  }
  const save = async () => {
    if (missing || monthly === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      const plan = await client.plans.create({ customerId: f.customerId, ...(f.siteId ? { siteId: f.siteId } : {}), name: f.name.trim(), monthly, includes, ...(f.first ? { firstService: f.first } : {}) })
      toast(`${plan.ref} set up. Send ${find(book.customers, plan.customerId)?.name.split(' ')[0] ?? 'them'} the link to sign the Direct Debit.`)
      setOpen(false)
    } catch (e) {
      setError(problem(e))
    }
    setBusy(false)
  }
  return (
    <Dialog open={open} onOpenChange={reopen}>
      <DialogTrigger asChild>
        <button type="button" className={greyButton}>
          Set up a plan
        </button>
      </DialogTrigger>
      <FormDialog wide eyebrow="Service plan" title="Set up a plan" line="A monthly Direct Debit for servicing. The customer signs it from a link; Ardent books the yearly service.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="plan-customer" className="cap">
              Customer
            </label>
            <select id="plan-customer" className={selectClass} value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value, siteId: '' })}>
              <option value="">Pick a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="plan-site" className="cap">
              Address (optional)
            </label>
            <select id="plan-site" className={selectClass} value={f.siteId} disabled={!sites.length} onChange={(e) => setF({ ...f, siteId: e.target.value })}>
              <option value="">{sites.length ? 'Their usual address' : f.customerId ? 'No addresses on file' : 'Pick a customer first'}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.line1}, {s.postcode}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_130px_160px]">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="plan-name" className="cap">
              Plan name
            </label>
            <input id="plan-name" className={fieldClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Boiler care" />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="plan-monthly" className="cap">
              Monthly, £
            </label>
            <input id="plan-monthly" inputMode="decimal" className={cn(fieldClass, 'font-mono')} value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value.replace(/[^\d.]/g, '') })} placeholder="12.00" />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="plan-first" className="cap">
              First service
            </label>
            <input id="plan-first" type="date" className={cn(fieldClass, 'font-mono text-[13px]')} value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="plan-includes" className="cap">
            What it covers, one per line
          </label>
          <textarea id="plan-includes" className={cn(fieldClass, 'h-24 py-2.5')} value={f.includes} onChange={(e) => setF({ ...f, includes: e.target.value })} placeholder={'Yearly boiler service\nGas safety check\n10% off any repairs'} />
        </div>
        <p className="text-[12.5px] text-warn">Keep plans to servicing and discounts. A plan that pays for repairs can count as insurance.</p>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        )}
        {missing && (f.customerId || f.monthly || f.includes) && <p className="text-[12.5px] text-muted">Still needs {missing}.</p>}
        <button type="button" className={solidButton} disabled={!!missing || busy} onClick={() => void save()}>
          {monthly ? `Set up ${pounds(monthly, { always: true })} a month` : 'Set up the plan'}
        </button>
      </FormDialog>
    </Dialog>
  )
}

/* ---------- Xero ---------- */

const KIND: Record<LedgerLine['kind'], string> = { payment: 'Payment', stripe_fee: 'Stripe fee', ardent_fee: 'Ardent fee', refund: 'Refund', payout: 'Payout' }

/** The last 12 months, newest first, as "2026-10". */
function lastMonths() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
  })
}

/** The Stripe clearing account a month at a time, and the file Xero imports. */
export function Xero() {
  const months = lastMonths()
  const [month, setMonth] = useState(months[0].value)
  const { data: ledger } = useQuery((c) => c.ledger.get({ month }), [month])
  const shown = ledger?.month === month ? ledger : undefined
  const download = () => {
    if (!shown) return
    const url = URL.createObjectURL(new Blob([shown.csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `stripe-clearing-${month}.csv`
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <Card className="flex min-w-0 flex-col gap-3 px-[22px] pt-5 pb-4">
      <SectionHead title="For Xero" className="pb-0" />
      <p className="text-[12.5px] leading-[1.5] text-muted">
        Payments land in a Stripe clearing account in Xero, with Stripe's and Ardent's fees booked as costs. Each payout then matches the bank line in one click.
      </p>
      <label className="sr-only" htmlFor="xero-month">
        Month
      </label>
      <select id="xero-month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      {!shown ? (
        <div className="h-40 animate-pulse rounded-[10px] bg-inset" />
      ) : (
        <>
          {!shown.lines.length ? (
            <p className="py-4 text-[13.5px] text-muted">Nothing through Stripe this month.</p>
          ) : (
            <ul className="rows max-h-[340px] overflow-y-auto">
              {shown.lines.map((l, i) => (
                <li key={i} className="flex items-baseline gap-3 py-2.5">
                  <span className="w-[44px] shrink-0 font-mono text-[11px] text-muted">{capDay(l.day).slice(0, -3)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px]">{l.description}</span>
                    <span className="truncate font-mono text-[10.5px] text-muted uppercase">
                      {KIND[l.kind]} <span className="text-faint">·</span> {l.payee}
                    </span>
                  </span>
                  <span className={cn('shrink-0 font-mono text-[12.5px] tabular', l.amount < 0 && 'text-muted')}>{pounds(l.amount, { always: true })}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between gap-3 pt-3 shadow-[inset_0_1px_0_var(--line)]">
            <span className="cap text-[11px]">Left in the account</span>
            <span className="font-mono text-[15px] tabular">{pounds(shown.balance, { always: true })}</span>
          </div>
          <p className="text-[12px] text-faint">Money paid in that hasn't reached the bank yet, at the month's end.</p>
          <button type="button" className={greyButton} disabled={!shown.lines.length} onClick={download}>
            Download for Xero
          </button>
        </>
      )}
    </Card>
  )
}
