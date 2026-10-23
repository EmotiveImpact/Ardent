import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { initials, pounds, totals } from '@kit'
import { EmberButton } from '@/components/ardent/money-parts'
import { greyButton } from '@/components/ardent/money-lib'
import { fieldClass } from '@/components/ui/field'
import { useArdent, useQuery } from '@/data/ardent'
import type { Invoice, Quote, ServicePlan } from '@/data/model'
import { problem } from '@/lib/act'
import { invoiceOwed } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * The demo's stand-ins for Stripe's own pages: the firm's sign-up, the pay
 * page a customer opens from an invoice or a deposit, and the Direct Debit
 * form for a service plan. Nothing leaves the browser. Each one tells the
 * engine what Stripe would have said (payments.simulate), the same way
 * Stripe's webhook does on a server.
 */

/** The page around a stand-in: who would really show it, and the way back to Core. */
function StandIn({ what, back, children }: { what: string; back: { to: string; label: string }; children: ReactNode }) {
  useEffect(() => {
    document.title = `Stripe test stand-in · ${what}`
    return () => {
      document.title = 'Ardent Core'
    }
  }, [what])
  return (
    <div className="app-atmosphere grain h-full overflow-y-auto">
      <div className="bg-violet/12 px-4 py-2.5">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
          <p className="flex min-w-0 flex-1 basis-[280px] items-baseline gap-2.5 text-[12.5px] text-[#d6caff]">
            <span aria-hidden className="size-[6px] shrink-0 -translate-y-[1px] rounded-full bg-violet" />
            <span>
              <span className="cap text-[11px] text-[#d6caff]">Stripe test mode stand-in</span>
              <span className="ml-2 text-[#bfb3e6]">{what}. In the live app this is Stripe's own page. Nothing here is real.</span>
            </span>
          </p>
          <Link to={back.to} className="shrink-0 rounded-sm text-[12.5px] text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
            {back.label}
          </Link>
        </div>
      </div>
      <main className="mx-auto flex max-w-[520px] flex-col gap-5 px-4 pt-8 pb-16">{children}</main>
    </div>
  )
}

/** A filled-in field on a stand-in form: the test values Stripe accepts. */
function TestField({ label, value, onChange, mono, id }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; id: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="cap">
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, mono && 'font-mono')} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[14px] bg-surface p-5">
      <h2 className="cap pb-1 text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Done({ title, children, back }: { title: string; children: ReactNode; back: { to: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-[14px] bg-surface p-6">
      <span className="flex size-11 items-center justify-center rounded-full bg-ok/15">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--ok)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h1 className="op-title text-[20px]">{title}</h1>
      <div className="flex flex-col gap-2 text-[14px] text-muted">{children}</div>
      <Link to={back.to} className={cn(greyButton, 'mt-2')}>
        {back.label}
      </Link>
    </div>
  )
}

function Problem({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p role="alert" className="text-[13px] text-danger">
      {text}
    </p>
  )
}

/* ---------- The firm's sign-up ---------- */

export function StripeSignUp() {
  const { me, client } = useArdent()
  const navigate = useNavigate()
  const firm = me?.organisation.name ?? 'Your firm'
  const [f, setF] = useState({
    name: firm,
    number: '00000000',
    address: '1 Test Street, Manchester M1 1AA',
    does: 'Heating, plumbing and electrical work',
    director: me?.user.name ?? '',
    born: '01/01/1901',
    id: 'Test passport (passes the check)',
    sort: '10-88-00',
    account: '00012345',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v })
  const back = { to: '/settings/payments', label: 'Back to Ardent' }

  const finish = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await client.payments.simulate({ kind: 'signed_up' })
      navigate('/settings/payments')
    } catch (e) {
      setError(problem(e))
      setBusy(false)
    }
  }

  return (
    <StandIn what="Stripe's sign-up for your firm" back={back}>
      <div className="flex flex-col gap-2 pb-1">
        <p className="cap">Stripe</p>
        <h1 className="op-title text-[19px] leading-[1.45] sm:text-[21px]">Set up payments for {firm}</h1>
        <p className="text-[14px] text-muted">Stripe asks for these to open the firm's account. They're filled in with Stripe's test values.</p>
      </div>
      <Section title="Your company">
        <TestField id="su-name" label="Legal name" value={f.name} onChange={set('name')} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
          <TestField id="su-number" label="Company number" value={f.number} onChange={set('number')} mono />
          <TestField id="su-address" label="Business address" value={f.address} onChange={set('address')} />
        </div>
        <TestField id="su-does" label="What the business does" value={f.does} onChange={set('does')} />
      </Section>
      <Section title="A director">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
          <TestField id="su-director" label="Full name" value={f.director} onChange={set('director')} />
          <TestField id="su-born" label="Date of birth" value={f.born} onChange={set('born')} mono />
        </div>
        <TestField id="su-id" label="Photo ID" value={f.id} onChange={set('id')} />
      </Section>
      <Section title="Bank account for payouts">
        <div className="grid grid-cols-2 gap-3">
          <TestField id="su-sort" label="Sort code" value={f.sort} onChange={set('sort')} mono />
          <TestField id="su-account" label="Account number" value={f.account} onChange={set('account')} mono />
        </div>
        <p className="text-[12.5px] text-muted">Stripe pays what customers pay into this account, a few working days after each payment.</p>
      </Section>
      <Problem text={error} />
      <EmberButton onClick={() => void finish()} disabled={busy}>
        Finish
      </EmberButton>
    </StandIn>
  )
}

/* ---------- The customer's pay page ---------- */

type Paying = { kind: 'invoice'; invoice: Invoice } | { kind: 'deposit'; quote: Quote }

/** What a pay link is for: an invoice (or one raised on a phone with no signal), or a quote's deposit. */
function usePaying(id: string | undefined) {
  return useQuery(
    async (c): Promise<Paying | undefined> => {
      const invoice = (await c.invoices.list()).find((i) => i.id === id || i.offlineId === id)
      if (invoice) return { kind: 'invoice', invoice }
      const quote = (await c.quotes.list()).find((q) => q.id === id)
      return quote ? { kind: 'deposit', quote } : undefined
    },
    [id],
  )
}

type Way = 'pay_by_bank' | 'card' | 'apple_pay' | 'google_pay'
const WAYS: { key: Way; label: string; line: string }[] = [
  { key: 'pay_by_bank', label: 'Pay by bank', line: 'Straight from your banking app. No card details to type.' },
  { key: 'card', label: 'Card', line: 'Debit or credit card.' },
  { key: 'apple_pay', label: 'Apple Pay', line: 'On an iPhone, iPad or Mac.' },
  { key: 'google_pay', label: 'Google Pay', line: 'On an Android phone or in Chrome.' },
]

const paidBy: Record<Way, string> = { pay_by_bank: 'from your bank account', card: 'by card', apple_pay: 'with Apple Pay', google_pay: 'with Google Pay' }

export function PayPage() {
  const { id } = useParams()
  const { me, client } = useArdent()
  const { data: paying, loading } = usePaying(id)
  const { data: overview } = useQuery((c) => c.payments.get())
  const [way, setWay] = useState<Way>('pay_by_bank')
  const [card, setCard] = useState({ number: '4242 4242 4242 4242', expiry: '12 / 34', cvc: '123' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [paid, setPaid] = useState<{ amount: number; way: Way }>()
  const firm = me?.organisation.name ?? 'The firm'

  const back =
    paying?.kind === 'invoice' ? { to: `/invoices/${paying.invoice.id}`, label: `Back to ${paying.invoice.ref} in Ardent` } : paying?.kind === 'deposit' ? { to: `/quotes/${paying.quote.id}`, label: `Back to ${paying.quote.ref} in Ardent` } : { to: '/money', label: 'Back to Ardent' }

  if (!paying || !overview)
    return (
      <StandIn what="The customer's pay page" back={back}>
        {loading || !overview ? <div className="h-80 animate-pulse rounded-[14px] bg-surface/60" /> : <Message>We could not find this invoice. If the engineer has just finished, they will text you a link shortly.</Message>}
      </StandIn>
    )

  const ref = paying.kind === 'invoice' ? paying.invoice.ref : `Deposit on ${paying.quote.ref}`
  const amount = paying.kind === 'invoice' ? invoiceOwed(paying.invoice) : paying.quote.deposit?.status === 'requested' ? paying.quote.deposit.amount : 0

  if (paid)
    return (
      <StandIn what="The customer's pay page" back={back}>
        <Done title="Paid. Thank you." back={back}>
          <p>
            {pounds(paid.amount, { always: true })} to {firm} for {ref}, {paidBy[paid.way]}.
          </p>
          <p>A receipt is on its way to your email. {firm} can see it's paid straight away.</p>
        </Done>
      </StandIn>
    )

  if (overview.account.status !== 'active')
    return (
      <StandIn what="The customer's pay page" back={back}>
        <Message>{firm} is not taking card payments yet. Please pay by bank transfer using the details on your invoice.</Message>
      </StandIn>
    )
  if (amount <= 0)
    return (
      <StandIn what="The customer's pay page" back={back}>
        <Message>{paying.kind === 'invoice' ? 'This invoice is paid. Thank you.' : paying.quote.deposit ? 'This deposit is paid. Thank you.' : 'There is nothing to pay on this quote.'}</Message>
      </StandIn>
    )

  const pay = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const method = way === 'pay_by_bank' ? 'pay_by_bank' : 'card'
      await client.payments.simulate(paying.kind === 'invoice' ? { kind: 'paid', invoiceId: paying.invoice.id, method } : { kind: 'paid', quoteId: paying.quote.id, method })
      setPaid({ amount, way })
    } catch (e) {
      setError(problem(e))
    }
    setBusy(false)
  }

  const what = paying.kind === 'invoice' ? (paying.invoice.paidAmount > 0 ? `What's left on ${paying.invoice.ref}` : `Invoice ${paying.invoice.ref}`) : `${paying.quote.deposit!.percent}% deposit on quote ${paying.quote.ref}, of ${pounds(totals(paying.quote).total)}`

  return (
    <StandIn what="The customer's pay page" back={back}>
      <div className="flex flex-col gap-4 rounded-[14px] bg-surface p-6">
        <div className="flex items-center gap-3">
          <FirmMark firm={firm} />
          <span className="text-[15px]">{firm}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] text-muted">{what}</span>
          <span className="op-number text-[38px]">{pounds(amount, { always: true })}</span>
        </div>
      </div>

      <section className="flex flex-col gap-2" aria-label="How to pay">
        <h2 className="cap px-1 pb-1">How would you like to pay?</h2>
        <div role="radiogroup" aria-label="How to pay" className="flex flex-col gap-1.5">
          {WAYS.map((w) => {
            const on = way === w.key
            return (
              <button
                key={w.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setWay(w.key)}
                className={cn('flex min-h-[60px] items-center gap-3.5 rounded-[12px] px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', on ? 'bg-raised' : 'bg-surface hover:bg-[#161616]')}
              >
                <span aria-hidden className={cn('flex size-[18px] shrink-0 items-center justify-center rounded-full', on ? 'bg-foreground' : 'bg-inset')}>
                  {on && <span className="size-[7px] rounded-full bg-background" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-[14.5px]">
                    {w.label}
                    {w.key === 'pay_by_bank' && <span className="cap rounded-full bg-ok/15 px-2 py-0.5 text-[10px] text-ok">Recommended</span>}
                  </span>
                  <span className="text-[12.5px] text-muted">{w.line}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {way === 'card' && (
        <Section title="Card details">
          <TestField id="pay-card" label="Card number" value={card.number} onChange={(v) => setCard({ ...card, number: v })} mono />
          <div className="grid grid-cols-2 gap-3">
            <TestField id="pay-expiry" label="Expiry" value={card.expiry} onChange={(v) => setCard({ ...card, expiry: v })} mono />
            <TestField id="pay-cvc" label="Security code" value={card.cvc} onChange={(v) => setCard({ ...card, cvc: v })} mono />
          </div>
          <p className="text-[12.5px] text-muted">Stripe's test card. It always goes through.</p>
        </Section>
      )}
      {way === 'pay_by_bank' && <p className="px-1 text-[13px] text-muted">You'll pick your bank, then approve the payment in its app. In test mode, Stripe's test bank says yes straight away.</p>}

      <Problem text={error} />
      <EmberButton onClick={() => void pay()} disabled={busy}>
        {way === 'pay_by_bank' ? `Pay ${pounds(amount, { always: true })} by bank` : way === 'card' ? `Pay ${pounds(amount, { always: true })}` : `Pay with ${WAYS.find((w) => w.key === way)!.label}`}
      </EmberButton>
      <p className="px-1 text-[12px] text-faint">Payments go to {firm}'s own account, through Stripe.</p>
    </StandIn>
  )
}

/** The firm's initials where its logo would be. */
function FirmMark({ firm }: { firm: string }) {
  return (
    <span aria-hidden className="op-title flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-raised text-[11px] tracking-[.08em]">
      {initials(firm)}
    </span>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <div className="rounded-[14px] bg-surface p-6 text-[15px]">{children}</div>
}

/* ---------- The customer's Direct Debit ---------- */

export function PlanSign() {
  const { id } = useParams()
  const { me, client } = useArdent()
  const { data } = useQuery(
    async (c) => {
      const [plans, customers] = await Promise.all([c.plans.list(), c.customers.list()])
      const plan = plans.find((p) => p.id === id)
      return { plan, customer: customers.find((x) => x.id === plan?.customerId) }
    },
    [id],
  )
  const [f, setF] = useState<{ name?: string; sort: string; account: string }>({ sort: '10-88-00', account: '00012345' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [signed, setSigned] = useState<ServicePlan>()
  const firm = me?.organisation.name ?? 'The firm'
  const back = { to: '/money#plans', label: 'Back to Ardent' }
  const plan = data?.plan
  const name = f.name ?? data?.customer?.name ?? ''

  if (signed)
    return (
      <StandIn what="The customer's Direct Debit form" back={back}>
        <Done title="Direct Debit set up" back={back}>
          <p>
            {pounds(signed.monthly, { always: true })} a month to {firm} for {signed.name}, from the account ending {f.account.slice(-4)}.
          </p>
          <p>The first payment is taken in the next few days. You'll get an email before each one.</p>
        </Done>
      </StandIn>
    )
  if (!data)
    return (
      <StandIn what="The customer's Direct Debit form" back={back}>
        <div className="h-80 animate-pulse rounded-[14px] bg-surface/60" />
      </StandIn>
    )
  if (!plan || plan.status !== 'awaiting_signature')
    return (
      <StandIn what="The customer's Direct Debit form" back={back}>
        <Message>{!plan ? 'We could not find this plan. Ask the firm to send the link again.' : plan.status === 'cancelled' ? 'This plan was cancelled.' : 'This Direct Debit is already set up. Thank you.'}</Message>
      </StandIn>
    )

  const sign = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await client.payments.simulate({ kind: 'plan_signed', planId: plan.id })
      setSigned(plan)
    } catch (e) {
      setError(problem(e))
    }
    setBusy(false)
  }
  const ok = name.trim() && /^\d{2}-?\d{2}-?\d{2}$/.test(f.sort.trim()) && /^\d{8}$/.test(f.account.trim())

  return (
    <StandIn what="The customer's Direct Debit form" back={back}>
      <div className="flex flex-col gap-4 rounded-[14px] bg-surface p-6">
        <div className="flex items-center gap-3">
          <FirmMark firm={firm} />
          <span className="text-[15px]">{firm}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] text-muted">
            {plan.name}, {plan.ref}
          </span>
          <span className="op-number text-[34px]">
            {pounds(plan.monthly, { always: true })}
            <span className="ml-2 font-mono text-[13px] text-muted">a month</span>
          </span>
        </div>
        <ul className="flex flex-col gap-1.5 text-[13.5px]">
          {plan.includes.map((x) => (
            <li key={x} className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] size-[5px] shrink-0 rounded-full bg-foreground" />
              {x}
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted">First service due {new Date(`${plan.nextService}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}. Cancel any time by telling {firm} or your bank.</p>
      </div>

      <Section title="Your bank account">
        <TestField id="dd-name" label="Account holder's name" value={name} onChange={(v) => setF({ ...f, name: v })} />
        <div className="grid grid-cols-2 gap-3">
          <TestField id="dd-sort" label="Sort code" value={f.sort} onChange={(v) => setF({ ...f, sort: v })} mono />
          <TestField id="dd-account" label="Account number" value={f.account} onChange={(v) => setF({ ...f, account: v })} mono />
        </div>
        <p className="text-[12.5px] text-muted">Stripe's test account. It always goes through.</p>
      </Section>

      <div className="flex gap-3 rounded-[14px] bg-surface p-5">
        <span aria-hidden className="cap mt-0.5 shrink-0 self-start rounded-[6px] bg-raised px-2 py-1 text-[10px] text-foreground">DD</span>
        <p className="text-[12.5px] leading-[1.5] text-muted">
          Your payments are protected by the <span className="text-foreground">Direct Debit Guarantee</span>. If an error is made in the payment of your Direct Debit, you're entitled to a full and immediate refund from your bank.
        </p>
      </div>

      <Problem text={error} />
      <EmberButton onClick={() => void sign()} disabled={busy || !ok}>
        Set up Direct Debit
      </EmberButton>
      <p className="px-1 text-[12px] text-faint">Collected by Stripe for {firm}. Bacs Direct Debit.</p>
    </StandIn>
  )
}
