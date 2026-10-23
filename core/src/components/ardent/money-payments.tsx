import { useState } from 'react'
import { Link } from 'react-router'
import { clock, pounds, shortDate } from '@kit'
import { Card, RowButton, SectionHead } from '@/components/ardent/parts'
import { GreyButton, StateMark } from '@/components/ardent/money-parts'
import { capDate, capDay, greyButton, type Dot } from '@/components/ardent/money-lib'
import { solidButton } from '@/components/ardent/people-kit'
import { feeWord, methodPhrase, methodWord, TestButton, TestMark, usePayments, usePretend } from '@/components/ardent/pay-parts'
import { Plans, Xero } from '@/components/ardent/money-plans'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { fieldClass } from '@/components/ui/field'
import { useArdent, useQuery, type Book } from '@/data/ardent'
import type { Charge, Dispute, PaymentsOverview, Payout } from '@/data/model'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * Money's payments part: what came in through the firm's own Stripe account
 * this month and what it cost, payouts to the bank, recent payments,
 * disputes with the evidence Ardent gathered, service plans, and the Stripe
 * clearing account for Xero.
 */

export function PaymentsPart({ book }: { book: Book }) {
  const { data: overview, account, demo } = usePayments()
  if (!overview || !account) return <div className="h-64 animate-pulse rounded-[14px] bg-surface/60" />
  const started = account.status === 'active' || account.status === 'paused'

  return (
    <section id="payments" aria-labelledby="payments-title" className="flex scroll-mt-6 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-6">
        <div className="min-w-0">
          <p className="cap">Through your Stripe account</p>
          <h2 id="payments-title" className="op-title mt-3.5 text-[22px] text-foreground sm:text-[26px]">
            Payments
          </h2>
          <p className="mt-3 max-w-[68ch] text-[14px] text-muted">
            {started ? 'What customers paid from Pay now links, deposits and service plans. Stripe pays it into your bank; Ardent never holds it.' : 'Customers can pay by bank or card from a link on each invoice once payments are on.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {account.test && <TestMark />}
          <RowButton to="/settings/payments">Settings</RowButton>
        </div>
      </div>

      {!started ? (
        <Card className="flex flex-col items-start gap-3 px-[22px] py-6">
          <StateMark dot={account.status === 'not_started' ? 'grey' : 'warn'} className="text-[14px]">
            {account.status === 'not_started' ? 'Payments are not set up, so invoices show your bank details only.' : "Stripe's sign-up isn't finished yet."}
          </StateMark>
          <p className="text-[13.5px] text-muted">The owner sets it up in about 10 minutes, through Stripe's own sign-up.</p>
          <GreyButton to="/settings/payments">Settings, Payments</GreyButton>
        </Card>
      ) : (
        <>
          {account.status === 'paused' && (
            <Card className="px-[22px] py-4">
              <StateMark dot="danger" className="text-[14px]">
                {account.paused ?? 'Stripe has paused payments on your account.'}
              </StateMark>
            </Card>
          )}
          <ThisMonth overview={overview} />
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
            <Charges overview={overview} book={book} demo={demo} />
            <Payouts />
          </div>
          {overview.disputes.length > 0 && <Disputes overview={overview} book={book} demo={demo} />}
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
            <Plans book={book} demo={demo} />
            <Xero />
          </div>
        </>
      )}
    </section>
  )
}

/** This month's money through Ardent, and what it cost. */
function ThisMonth({ overview }: { overview: PaymentsOverview }) {
  const m = overview.month
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', timeZone: 'Europe/London' })
  const figures = [
    { label: `Taken in ${month}`, value: pounds(m.taken), unit: `${m.count} ${m.count === 1 ? 'payment' : 'payments'}` },
    { label: "Ardent's fees", value: pounds(m.fees, { always: true }), unit: '0.2%, £5 at most' },
    { label: "Stripe's fees", value: pounds(m.stripeFees, { always: true }), unit: 'billed by Stripe' },
    { label: 'Left for you', value: pounds(m.taken - m.fees - m.stripeFees) },
  ]
  return (
    <Card className="px-[22px] py-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-2.5">
            <dt className="cap truncate">{f.label}</dt>
            <dd className="op-number text-[24px] sm:text-[28px]">{f.value}</dd>
            {f.unit && <span className="font-mono text-[11px] text-muted uppercase">{f.unit}</span>}
          </div>
        ))}
      </dl>
    </Card>
  )
}

const chargeLink = (c: Charge) => (c.invoiceId ? `/invoices/${c.invoiceId}` : c.quoteId ? `/quotes/${c.quoteId}` : undefined)

/** Recent payments through Stripe: who, what for, how, and Ardent's fee. */
function Charges({ overview, book, demo }: { overview: PaymentsOverview; book: Book; demo: boolean }) {
  const pretend = usePretend()
  const [all, setAll] = useState(false)
  const rows = all ? overview.charges : overview.charges.slice(0, 8)
  // Card payments are the ones customers dispute with their bank.
  const canPretend = (c: Charge) => demo && !c.disputed && c.refunded < c.amount && (c.method === 'card' || c.method === 'tap')
  return (
    <Card className="min-w-0 px-4 pt-5 pb-2 sm:px-[22px] xl:col-span-2">
      <SectionHead title={`Recent payments · ${overview.charges.length}`} aside="Newest first. Each shows how they paid and Ardent's fee." className="pb-1.5" />
      {!rows.length && <p className="py-8 text-center text-[14px] text-muted">Nothing paid through Ardent yet. Payments show here the moment Stripe says.</p>}
      <ul className="rows">
        {rows.map((c) => {
          const to = chargeLink(c)
          const who = find(book.customers, c.customerId)?.name ?? 'Customer'
          const state = c.disputed ? { dot: 'danger' as Dot, text: 'Disputed' } : c.refunded >= c.amount ? { dot: 'faint' as Dot, text: 'Refunded' } : c.refunded ? { dot: 'warn' as Dot, text: `${pounds(c.refunded)} refunded` } : undefined
          return (
            <li key={c.id} className="flex items-start gap-x-3.5 py-3 sm:items-center sm:gap-x-4">
              <span className="w-[48px] shrink-0 pt-0.5 font-mono text-[11px] text-muted sm:w-[52px] sm:pt-0">{capDate(c.at)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[14px]">
                  {who}
                  <span className="text-muted">
                    {' '}
                    ·{' '}
                    {to ? (
                      <Link to={to} className="rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
                        {c.label}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted uppercase">
                  <span>{methodWord[c.method]}</span>
                  <span>Ardent {feeWord(c.fee - c.feeRefunded)}</span>
                  {state && (
                    <StateMark dot={state.dot} className={cn(state.dot === 'danger' && 'text-danger')}>
                      {state.text}
                    </StateMark>
                  )}
                </span>
                {canPretend(c) && (
                  <TestButton className="mt-1.5 self-start sm:hidden" onClick={() => void pretend({ kind: 'dispute', chargeId: c.id }, `Pretend dispute opened on ${c.label}`)}>
                    Pretend a dispute
                  </TestButton>
                )}
              </span>
              {canPretend(c) && (
                <TestButton className="hidden sm:inline-flex" onClick={() => void pretend({ kind: 'dispute', chargeId: c.id }, `Pretend dispute opened on ${c.label}`)}>
                  Pretend a dispute
                </TestButton>
              )}
              <span className="shrink-0 text-right font-mono text-[13px] tabular sm:w-[84px]">{pounds(c.amount, { always: true })}</span>
            </li>
          )
        })}
      </ul>
      {overview.charges.length > 8 && (
        <div className="py-3">
          <button type="button" className={greyButton} onClick={() => setAll(!all)}>
            {all ? 'Fewer' : `All ${overview.charges.length}`}
          </button>
        </div>
      )}
    </Card>
  )
}

/** Money on its way to the bank, and what's landed. */
function Payouts() {
  const { data } = useQuery((c) => c.payouts.list())
  const rows = data ?? []
  const coming = rows.filter((p) => p.status === 'on_its_way')
  const landed = rows.filter((p) => p.status === 'paid').slice(0, 6)
  return (
    <Card className="min-w-0 px-[22px] pt-5 pb-2">
      <SectionHead title="Payouts to your bank" className="pb-1.5" />
      {!data && <div className="h-32 animate-pulse rounded-[10px] bg-inset" />}
      {data && !rows.length && <p className="pt-2 pb-4 text-[14px] text-muted">Nothing paid out yet. Stripe pays each payment into your bank 3 working days later. The very first waits 7 days.</p>}
      {coming.length > 0 && <PayoutRows title="On its way" rows={[...coming].reverse()} />}
      {landed.length > 0 && <PayoutRows title="In your bank" rows={landed} />}
    </Card>
  )
}

function PayoutRows({ title, rows }: { title: string; rows: Payout[] }) {
  return (
    <div className="pb-2">
      <h3 className="cap pt-2 pb-1 text-[11px] text-faint">{title}</h3>
      <ul className="rows">
        {rows.map((p) => (
          <li key={p.day} className="flex items-center gap-3.5 py-3">
            <span className="w-[64px] shrink-0 font-mono text-[11px] text-muted">{capDay(p.day)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <StateMark dot={p.status === 'paid' ? 'ok' : 'info'} className="text-[13.5px]">
                {p.status === 'paid' ? 'Landed' : 'Lands'} {new Date(`${p.day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
              </StateMark>
              <span className="text-[12px] text-muted">
                {p.payments} {p.payments === 1 ? 'payment' : 'payments'}
                {p.firstHold ? ', the first payout: Stripe holds it 7 days' : ''}
              </span>
            </span>
            <span className={cn('shrink-0 font-mono text-[13px] tabular', p.amount < 0 && 'text-warn')}>{pounds(p.amount, { always: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const DISPUTE: Record<Dispute['status'], { dot: Dot; text: string }> = {
  needs_reply: { dot: 'danger', text: 'Needs your reply' },
  sent: { dot: 'info', text: 'Evidence sent, waiting for the bank' },
  won: { dot: 'ok', text: 'Won: the money stays with you' },
  lost: { dot: 'faint', text: 'Lost: the money went back' },
}

/** Card payments a customer disputed with their bank, with the evidence to answer. */
function Disputes({ overview, book, demo }: { overview: PaymentsOverview; book: Book; demo: boolean }) {
  const pretend = usePretend()
  return (
    <Card className="px-4 pt-5 pb-2 sm:px-[22px]">
      <SectionHead title={`Disputes · ${overview.disputes.length}`} aside="Ardent gathers the evidence from the job. You send it." className="pb-1.5" />
      <ul className="rows">
        {overview.disputes.map((d) => {
          const c = overview.charges.find((x) => x.id === d.chargeId)
          const who = find(book.customers, c?.customerId)?.name ?? 'Customer'
          const st = DISPUTE[d.status]
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3.5">
              <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1">
                <span className="text-[14px]">
                  {who} <span className="text-muted">· {c?.label ?? 'a payment'}</span>
                </span>
                <span className="text-[12.5px] text-muted">{d.reason}</span>
                <StateMark dot={st.dot} className={cn('text-[12.5px]', d.status === 'needs_reply' && 'text-danger')}>
                  {st.text}
                  {d.status === 'needs_reply' && `, by ${shortDate(d.replyBy)}`}
                  {d.status === 'sent' && d.sentAt && ` since ${shortDate(d.sentAt)}`}
                </StateMark>
              </span>
              <span className="font-mono text-[13px] tabular">{pounds(d.amount, { always: true })}</span>
              <div className="flex flex-wrap gap-2">
                <EvidenceDialog dispute={d}>
                  <button type="button" className={greyButton}>
                    {d.status === 'needs_reply' ? 'Look at the evidence' : 'The evidence'}
                  </button>
                </EvidenceDialog>
                {demo && (d.status === 'needs_reply' || d.status === 'sent') && (
                  <>
                    <TestButton className="h-10" onClick={() => void pretend({ kind: 'dispute_result', disputeId: d.id, won: true }, 'Pretend: the bank found for you')}>
                      Pretend it was won
                    </TestButton>
                    <TestButton className="h-10" onClick={() => void pretend({ kind: 'dispute_result', disputeId: d.id, won: false }, 'Pretend: the bank found for the customer')}>
                      Pretend it was lost
                    </TestButton>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function EvidenceDialog({ dispute, children }: { dispute: Dispute; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto p-2">{open && <Evidence dispute={dispute} onSent={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  )
}

const when = (iso: string) => `${shortDate(iso)}, ${clock(iso)}`

/** What Ardent gathered from the job, ready to send to Stripe. */
function Evidence({ dispute, onSent }: { dispute: Dispute; onSent: () => void }) {
  const { client, me } = useArdent()
  const { data: pack } = useQuery((c) => c.disputes.get(dispute.id), [dispute.id])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const owner = me?.role === 'owner'
  const send = async () => {
    setBusy(true)
    const done = await act(client.disputes.send(dispute.id, note.trim() || undefined), 'Evidence sent to Stripe. The bank usually decides within a few weeks.')
    setBusy(false)
    if (done) onSent()
  }
  const facts: [string, string | undefined][] = pack
    ? [
        ['Customer', [pack.customer.name, pack.customer.email, pack.customer.phone].filter(Boolean).join(', ')],
        ['Job', pack.job && `${pack.job.ref}, ${pack.job.title}${pack.job.address ? `, ${pack.job.address}` : ''}`],
        ['Quote', pack.quote && `${pack.quote.ref}${pack.quote.acceptedOption ? `, ${pack.quote.acceptedOption}` : ''}, ${pounds(pack.quote.total)}`],
        ['Invoice', pack.invoice && `${pack.invoice.ref}, ${pounds(pack.invoice.total)}${pack.invoice.issuedAt ? `, sent ${shortDate(pack.invoice.issuedAt)}` : ''}`],
        ['On site', pack.onSite.length ? pack.onSite.map((t) => `${t.who} ${when(t.from)}${t.to ? ` to ${clock(t.to)}` : ''}`).join('; ') : undefined],
        ['Signed off', pack.signOff && `${pack.signOff.by}${pack.signOff.at ? `, ${when(pack.signOff.at)}` : ''}`],
        ['Photos', pack.photos.length ? `${pack.photos.length}, taken on site with times` : undefined],
        ['Certificates', pack.certificates.length ? pack.certificates.map((c) => c.kind).join(', ') : undefined],
        ['Paid', `${pounds(pack.charge.amount, { always: true })} by ${methodPhrase(pack.charge.method)}, ${when(pack.charge.at)}`],
      ]
    : []
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-4">
      <div>
        <p className="cap pb-2.5">Dispute · {pounds(dispute.amount, { always: true })}</p>
        <DialogTitle className="op-title text-[17px] font-normal tracking-[.14em]">The evidence</DialogTitle>
        <DialogDescription className="mt-2.5 text-[13px] text-muted">
          {dispute.reason}. {dispute.status === 'needs_reply' ? `Reply by ${shortDate(dispute.replyBy)}.` : DISPUTE[dispute.status].text + '.'}
        </DialogDescription>
      </div>
      {!pack ? (
        <div className="h-60 animate-pulse rounded-[10px] bg-inset" />
      ) : (
        <>
          <dl className="rows">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2.5 text-[13.5px]">
                  <dt className="cap pt-0.5 text-[11px]">{k}</dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
          </dl>
          {pack.report && (
            <figure className="rounded-[12px] bg-inset px-4 py-3.5">
              <figcaption className="cap pb-2 text-[11px] text-faint">The engineer's report</figcaption>
              <blockquote className="text-[13.5px] leading-[1.5]">{pack.report}</blockquote>
            </figure>
          )}
          <figure className="rounded-[12px] bg-inset px-4 py-3.5">
            <figcaption className="cap pb-2 text-[11px] text-faint">What goes to Stripe, word for word</figcaption>
            <p className="text-[13.5px] leading-[1.55] whitespace-pre-line">{pack.summary}</p>
            {dispute.note && <p className="mt-3 text-[13.5px] leading-[1.55] text-muted">Your note: {dispute.note}</p>}
          </figure>
          {dispute.status === 'needs_reply' &&
            (owner ? (
              <>
                <div className="flex flex-col gap-2">
                  <label htmlFor={`note-${dispute.id}`} className="cap">
                    Anything to add (optional)
                  </label>
                  <textarea id={`note-${dispute.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The customer rang to say thanks on the day." className={cn(fieldClass, 'h-20 py-2.5')} />
                </div>
                <button type="button" className={solidButton} disabled={busy} onClick={() => void send()}>
                  Send to Stripe
                </button>
              </>
            ) : (
              <p className="text-[12.5px] text-muted">Only the owner sends evidence to Stripe.</p>
            ))}
          {dispute.status === 'sent' && dispute.sentAt && <p className="text-[12.5px] text-muted">Sent to Stripe {when(dispute.sentAt)}.</p>}
        </>
      )}
    </div>
  )
}
