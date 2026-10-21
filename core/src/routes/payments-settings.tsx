import { useState } from 'react'
import { useNavigate } from 'react-router'
import { pounds, relative } from '@kit'
import { capDate } from '@/components/ardent/money-lib'
import { ardentFee, FEE, stripeFeeEstimate } from '@kit/pay.ts'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { EmberButton, Fact, GreyButton, StateMark } from '@/components/ardent/money-parts'
import { solidButton } from '@/components/ardent/people-kit'
import { penceOf, poundsBox } from '@/components/ardent/price-parts'
import { feeWord, TestMark, usePayments } from '@/components/ardent/pay-parts'
import { fieldClass } from '@/components/ui/field'
import { useArdent } from '@/data/ardent'
import type { PaymentAccount } from '@/data/model'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'

/*
 * Settings, Payments: the firm's own Stripe account. The owner opens it from
 * here through Stripe's sign-up; customers then pay into it from the Pay now
 * link on each invoice, and Stripe pays the firm's bank.
 */

const EXAMPLE = 31200

export function PaymentsSettings() {
  const { me } = useArdent()
  const { account, demo } = usePayments()
  const owner = me?.role === 'owner'

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Payments' }]} />
      <PageHead
        title="Payments"
        eyebrow={<span>Settings</span>}
        sub="Customers pay by bank or card from the Pay now link on each invoice. The money goes into your firm's own Stripe account, and Stripe pays it into your bank."
        aside={account?.test && <TestMark />}
        className="pb-0"
      />
      {!account ? (
        <div className="h-80 animate-pulse rounded-[14px] bg-surface/60" />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <AccountCard account={account} owner={owner} demo={demo} />
            <NoSurcharge />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <FeeCard />
            <Deposits account={account} owner={owner} />
          </div>
        </div>
      )}
    </div>
  )
}

/** One clear state for where the Stripe account stands, and the one thing to do about it. */
function AccountCard({ account: a, owner, demo }: { account: PaymentAccount; owner: boolean; demo: boolean }) {
  const { client } = useArdent()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const setUp = async () => {
    setBusy(true)
    const back = `${window.location.origin}${window.location.pathname}#/settings/payments`
    const link = await act(client.payments.setUp(back))
    setBusy(false)
    if (!link) return
    if (link.url.startsWith('#')) navigate(link.url.slice(1))
    else window.location.assign(link.url)
  }
  const check = () => void act(client.payments.refresh(), (x) => (x.status === 'active' ? 'Payments are on' : x.status === 'needs_info' ? 'Stripe still needs a few things' : 'Checked with Stripe'))
  const ownerOnly = <p className="text-[12.5px] text-muted">Only the owner can do this, as it opens an account in the firm's name.</p>
  const checked = a.updatedAt && <span className="text-[12px] text-faint">Last checked with Stripe {relative(a.updatedAt)}</span>

  if (a.status === 'not_started')
    return (
      <Card className="flex flex-col gap-4 p-6">
        <SectionHead title="Take payments through Ardent" className="pb-0" />
        <ol className="flex flex-col gap-2.5 text-[14px]">
          {[
            'Every invoice and reminder gets a Pay now link. Customers pay by bank or card.',
            "The money goes into your firm's own Stripe account, and Stripe pays it into your bank.",
            `Ardent takes ${FEE.rate * 100}% of each payment, never more than ${pounds(FEE.cap)}.`,
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-4 shrink-0 font-mono text-[12px] text-muted">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="text-[13.5px] leading-[1.5] text-muted">
          The sign-up is Stripe's own and takes about 10 minutes. Have your company details, a director's ID and the bank account for payouts to hand. Until it's done, invoices show your bank details only.
        </p>
        {owner ? (
          <EmberButton onClick={() => void setUp()} disabled={busy}>
            Set up payments
          </EmberButton>
        ) : (
          ownerOnly
        )}
      </Card>
    )

  if (a.status === 'onboarding' || a.status === 'needs_info')
    return (
      <Card className="flex flex-col gap-4 p-6">
        <SectionHead title={<StateMark dot="warn">Stripe's sign-up isn't finished</StateMark>} className="pb-0" />
        {a.due.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px]">Stripe still needs:</p>
            <ul className="rows">
              {a.due.map((d) => (
                <li key={d} className="flex items-center gap-3 py-2.5 text-[14px]">
                  <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-warn" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[14px] text-muted">You started the sign-up. Carry on where you left off; Stripe keeps what you've filled in.</p>
        )}
        <p className="text-[13px] text-muted">Until it's done, invoices show your bank details only.</p>
        {owner ? (
          <EmberButton onClick={() => void setUp()} disabled={busy}>
            Carry on with Stripe
          </EmberButton>
        ) : (
          ownerOnly
        )}
        <div className="flex flex-wrap items-center gap-3">
          <GreyButton onClick={check}>Check again</GreyButton>
          {checked}
        </div>
      </Card>
    )

  const dashboard = a.test ? 'https://dashboard.stripe.com/test/dashboard' : 'https://dashboard.stripe.com/dashboard'
  const paused = a.status === 'paused'
  return (
    <Card className="flex flex-col gap-4 p-6">
      <SectionHead title={paused ? <StateMark dot="danger">Stripe has paused payments</StateMark> : <StateMark dot="ok">Payments are on</StateMark>} className="pb-0" />
      {paused ? (
        <p className="text-[14px]">{a.paused ?? 'Stripe has paused payments or payouts on your account.'} Customers see your bank details until it's sorted.</p>
      ) : (
        <p className="text-[14px] text-muted">Every invoice and reminder carries a Pay now link. Payments show on the invoice the moment Stripe says, and on Money.</p>
      )}
      <div className="rows">
        <Fact label="Taking payments">{a.chargesEnabled ? 'Yes' : <span className="text-warn">No</span>}</Fact>
        <Fact label="Paying your bank">{a.payoutsEnabled ? 'Yes' : <span className="text-warn">On hold</span>}</Fact>
        <Fact label="First payment">{a.firstPaymentAt ? <span className="font-mono">{capDate(a.firstPaymentAt)}</span> : 'None yet'}</Fact>
        <Fact label="Payouts">{a.firstPaymentAt ? '3 working days after each payment' : 'The first waits 7 days, then 3 working days'}</Fact>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {demo ? (
          <span className="text-[12.5px] text-muted">The demo firm has no real Stripe account, so there's no dashboard to open.</span>
        ) : (
          <GreyButton href={dashboard}>Open your Stripe dashboard</GreyButton>
        )}
        <GreyButton onClick={check}>Check again</GreyButton>
      </div>
      {checked}
    </Card>
  )
}

/** Ardent's fee in plain words, with a worked example. */
function FeeCard() {
  const card = stripeFeeEstimate('card', EXAMPLE)
  const bank = stripeFeeEstimate('pay_by_bank', EXAMPLE)
  const fee = ardentFee(EXAMPLE)
  const capAt = Math.round(FEE.cap / FEE.rate)
  return (
    <Card className="flex flex-col gap-4 p-6">
      <SectionHead title="What it costs" className="pb-0" />
      <p className="text-[14px] leading-[1.5]">
        Ardent's fee is {FEE.rate * 100}% of each payment, and never more than {pounds(FEE.cap)}. Stripe takes it off the payment as it comes in, so there's no bill from Ardent for it. Stripe charges its own fee as well, and bills you for that.
      </p>
      <div className="rounded-[12px] bg-inset px-4 py-3.5">
        <p className="cap pb-2 text-[11px]">On a {pounds(EXAMPLE)} invoice</p>
        <dl className="rows font-mono text-[13px]">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Ardent's fee, {FEE.rate * 100}%</dt>
            <dd className="shrink-0 whitespace-nowrap tabular">{feeWord(fee)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Stripe's fee, pay by bank</dt>
            <dd className="shrink-0 whitespace-nowrap tabular">about {pounds(bank, { always: true })}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Stripe's fee, card</dt>
            <dd className="shrink-0 whitespace-nowrap tabular">about {pounds(card, { always: true })}</dd>
          </div>
        </dl>
      </div>
      <p className="text-[13px] leading-[1.5] text-muted">
        Ardent's fee stops at {pounds(FEE.cap)} on anything from {pounds(capAt)}. Pay by bank costs you less than card, so the pay page offers it first. Refund part of a payment and Ardent gives back the same share of its fee.
      </p>
    </Card>
  )
}

function NoSurcharge() {
  return (
    <Card className="flex flex-col gap-2.5 p-6">
      <SectionHead title="No surcharge switch" className="pb-0" />
      <p className="text-[13.5px] leading-[1.5] text-muted">UK law bans adding a fee for paying by card when the customer is a homeowner, so Ardent has no setting to pass the fee on. Build it into your prices instead.</p>
    </Card>
  )
}

/** The deposit asked for when a customer says yes to a quote. */
function Deposits({ account: a, owner }: { account: PaymentAccount; owner: boolean }) {
  const { client } = useArdent()
  const [percent, setPercent] = useState(String(a.depositPercent))
  const [from, setFrom] = useState(a.depositFrom ? poundsBox(a.depositFrom).replace(/\.00$/, '') : '')
  const [busy, setBusy] = useState(false)
  const p = Number(percent)
  const fromPence = from.trim() ? penceOf(from) : 0
  const pOk = /^\d+$/.test(percent.trim()) && p >= 0 && p <= 50
  const ok = pOk && fromPence !== undefined
  const dirty = ok && (p !== a.depositPercent || fromPence !== a.depositFrom)
  const example = Math.max(fromPence ?? 0, 100000)
  const save = async () => {
    if (!ok) return
    setBusy(true)
    await act(client.payments.settings({ depositPercent: p, depositFrom: fromPence }), p ? `Deposits set to ${p}%${fromPence ? ` on quotes from ${pounds(fromPence)}` : ''}` : 'Stopped asking for deposits')
    setBusy(false)
  }
  const now = a.depositPercent ? `${a.depositPercent}% on quotes${a.depositFrom ? ` from ${pounds(a.depositFrom)}` : ''}, with VAT` : 'Off: no deposit is asked for'

  return (
    <Card className="flex flex-col gap-4 p-6">
      <SectionHead title="Deposits on quotes" aside={now} className="pb-0" />
      <p className="text-[13.5px] leading-[1.5] text-muted">When a customer says yes to a quote, Ardent asks for a deposit through a pay link like the invoice's. Once paid, it comes off the final invoice.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="deposit-percent" className="cap">
            Deposit, %
          </label>
          <input id="deposit-percent" inputMode="numeric" disabled={!owner} value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" className={cn(fieldClass, 'font-mono', !pOk && 'text-warn')} />
          <span className="text-[12px] text-muted">0 to 50. 0 for none.</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="deposit-from" className="cap">
            Quotes from, £
          </label>
          <input id="deposit-from" inputMode="decimal" disabled={!owner} value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Any amount" className={cn(fieldClass, 'font-mono')} />
          <span className="text-[12px] text-muted">Only quotes at or over this, with VAT.</span>
        </div>
      </div>
      {pOk && p > 0 && <p className="text-[13px] text-muted">On a {pounds(example)} quote that's {pounds(Math.round((example * p) / 100))} up front.</p>}
      {owner ? (
        <button type="button" className={solidButton} disabled={!dirty || busy} onClick={() => void save()}>
          {dirty ? 'Save deposits' : 'Saved'}
        </button>
      ) : (
        <p className="text-[12.5px] text-muted">Only the owner changes deposits.</p>
      )}
    </Card>
  )
}
