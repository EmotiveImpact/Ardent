/**
 * Taking payments: each firm's own Stripe account, Pay now links, Tap to Pay,
 * deposits, Direct Debit service plans, refunds, disputes, payouts and the
 * Stripe clearing account for Xero.
 *
 * Ardent never holds a firm's money. Every payment is made on the firm's own
 * Stripe account, Stripe bills the firm for its fee, and Ardent's fee (0.2%,
 * capped at £5) rides on the payment as an application fee that Stripe pays
 * to Ardent. Everything Stripe tells Ardent comes through event(), from the
 * webhook on a server or from simulate() in the demo, so both run the same
 * code.
 */
import type { Charge, DemoPayment, Dispute, EvidencePack, Invoice, Ledger, LedgerLine, PayLink, PaymentAccount, PaymentsOverview, Payout, Quote, Refund, ServicePlan, TapToPay } from '../../core/src/data/model.ts'
import { pounds, shortDate, ukDay } from '../kit/format.ts'
import { ardentFee, feeBack, readOffline, stripeFeeEstimate } from '../kit/pay.ts'
import type { AccountState, PaymentEvent, PaymentProvider, PaymentTags, Platform } from './platform.ts'
import type { Data, Owned, Store } from './store.ts'

type Err = (why: string) => Error

export interface PaymentDeps {
  db: Data
  store: Store
  platform: Platform
  newId: (prefix: string) => string
  nextNumber: (orgId: string, kind: string) => number
  invoiceTotals: (inv: Pick<Invoice, 'lines' | 'vatRate'>) => { net: number; vat: number; total: number }
  sign: (text: string) => string
  invalid: Err
  forbidden: Err
  notFound: Err
}

const DAY = 24 * 60 * 60 * 1000
const EVENTS_KEEP = 5000
/** Stripe holds a firm's very first payout this long. */
const FIRST_HOLD_DAYS = 7
/** Then pays out this many working days after each payment. */
const PAYOUT_DAYS = 3
/** A plan's yearly service is booked this long before it's due. */
const BOOK_AHEAD = 28 * DAY
/** Plans that pay for repairs can count as insurance. */
const INSURANCE = /\b(breakdown|insur|cover(s|ed)? (all|any) repairs?|free repairs?|repairs? (included|covered)|parts and labour covered)\b/i

/** Stripe's words for what it still needs, in the firm's words. */
const DUE_WORDS: [RegExp, string][] = [
  [/verification\.document|id_number|verification/, "A director's ID"],
  [/external_account/, 'The bank account for payouts'],
  [/company\.(tax_id|registration_number)/, 'The company number'],
  [/company\.address|address/, 'The business address'],
  [/representative|directors|owners|executives/, 'Details of the directors'],
  [/business_profile/, 'What the business does'],
  [/tos_acceptance/, "Agreeing to Stripe's terms"],
]
const dueWords = (due: string[]) => [...new Set(due.map((d) => DUE_WORDS.find(([re]) => re.test(d))?.[1] ?? 'Something else Stripe asks for'))]

const METHOD_WORD: Record<Charge['method'], string> = { card: 'card', tap: 'Tap to Pay', pay_by_bank: 'pay by bank', direct_debit: 'Direct Debit' }

/** Working days after a UK day (weekends skipped). */
function workingDaysAfter(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`)
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--
  }
  return d.toISOString().slice(0, 10)
}

const ddmmyyyy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

export function createPayments(deps: PaymentDeps) {
  const { db, store, platform, newId, nextNumber, invoiceTotals, sign, invalid, forbidden, notFound } = deps
  const provider = (): PaymentProvider | undefined => platform.payments

  const firmName = (orgId: string) => db.orgs.find((o) => o.id === orgId)?.name ?? 'the firm'
  const customerName = (orgId: string, id?: string) => db.customers.find((c) => c.id === id && c.orgId === orgId)?.name ?? 'the customer'
  const log = (orgId: string, summary: string, extra: { jobId?: string; action?: string } = {}) => {
    db.actions.push({ id: newId('act'), at: new Date().toISOString(), by: { kind: 'ardent' }, action: extra.action ?? 'payments.event', summary, ...(extra.jobId ? { jobId: extra.jobId } : {}), orgId })
  }

  /** The firm's account row; a blank one until the owner starts. */
  function account(orgId: string): Owned<PaymentAccount & { accountId?: string }> {
    return (
      db.paymentAccounts.find((a) => a.orgId === orgId) ?? {
        orgId,
        status: 'not_started',
        test: provider()?.test ?? true,
        chargesEnabled: false,
        payoutsEnabled: false,
        due: [],
        depositPercent: 0,
        depositFrom: 0,
      }
    )
  }
  const accountRow = (orgId: string) => {
    let row = db.paymentAccounts.find((a) => a.orgId === orgId)
    if (!row) {
      row = account(orgId)
      db.paymentAccounts.push(row)
    }
    return row
  }
  const active = (orgId: string) => {
    const a = db.paymentAccounts.find((x) => x.orgId === orgId)
    return !!a?.accountId && a.chargesEnabled && !!provider()
  }
  function applyState(row: Owned<PaymentAccount & { accountId?: string }>, s: AccountState) {
    const was = row.status
    row.chargesEnabled = s.chargesEnabled
    row.payoutsEnabled = s.payoutsEnabled
    row.due = dueWords(s.due)
    row.paused = s.disabledReason && s.detailsSubmitted ? 'Stripe has paused this account: check the Stripe dashboard' : undefined
    row.status = row.paused ? 'paused' : s.chargesEnabled && s.payoutsEnabled ? 'active' : s.detailsSubmitted || s.due.length ? 'needs_info' : 'onboarding'
    row.updatedAt = new Date().toISOString()
    if (was !== row.status) {
      if (row.status === 'active') log(row.orgId, 'Payments are switched on: invoices and reminders now carry a Pay now link')
      else if (row.status === 'paused') log(row.orgId, 'Stripe paused payments or payouts on your account')
      else if (row.status === 'needs_info') log(row.orgId, `Stripe needs more to finish payments: ${row.due.join(', ') || 'see Settings, Payments'}`)
    }
  }

  // Links -------------------------------------------------------------------

  const payUrl = (id: string) => (provider()?.demo || !provider()?.publicUrl ? `#/pay/${id}` : `${provider()?.publicUrl}/pay/${id}`)
  const owed = (inv: Invoice) => invoiceTotals(inv).total - inv.paidAmount
  /**
   * The link on an invoice never changes, so one in an old email or a text
   * sent from a phone that was offline still works: opening it makes a fresh
   * Stripe page for whatever is owed then.
   */
  function invoiceLink(inv: Owned<Invoice>): PayLink | undefined {
    if (!active(inv.orgId) || !['draft', 'sent', 'part_paid', 'overdue'].includes(inv.status)) return undefined
    const amount = owed(inv)
    if (amount <= 0) return undefined
    const keep = inv.payLink?.amount === amount ? inv.payLink.createdAt : new Date().toISOString()
    inv.payLink = { url: payUrl(inv.id), amount, fee: ardentFee(amount), createdAt: keep }
    return inv.payLink
  }
  /** "Pay now: <link>" for a message, or nothing when payments aren't on. */
  function payLine(inv: Owned<Invoice>) {
    const link = invoiceLink(inv)
    return link ? ` Pay now by bank or card: ${link.url}` : ''
  }
  const quoteTotal = (q: Quote) => invoiceTotals({ lines: q.lines, vatRate: 2000 }).total

  /** When a customer says yes to a quote, the deposit the firm has set, through the same kind of link. */
  function askDeposit(q: Owned<Quote>) {
    const a = db.paymentAccounts.find((x) => x.orgId === q.orgId)
    if (!a || !active(q.orgId) || !a.depositPercent || q.deposit) return
    const total = quoteTotal(q)
    if (total < a.depositFrom) return
    const amount = Math.round((total * a.depositPercent) / 100)
    if (amount <= 0) return
    q.deposit = { amount, percent: a.depositPercent, status: 'requested', link: { url: payUrl(q.id), amount, fee: ardentFee(amount), createdAt: new Date().toISOString() } }
    log(q.orgId, `Asked ${customerName(q.orgId, q.customerId)} for a ${a.depositPercent}% deposit of ${pounds(amount)} on ${q.ref}`, { jobId: q.jobId })
  }

  /** A paid deposit comes off the job's invoice. */
  function applyDeposits(inv: Owned<Invoice>) {
    if (inv.status === 'void') return
    for (const q of db.quotes.filter((x) => x.orgId === inv.orgId && x.jobId === inv.jobId && x.deposit?.status === 'paid')) {
      const d = q.deposit!
      ;(inv.payments ??= []).push({ amount: d.amount, method: db.charges.find((c) => c.id === d.chargeId)?.method ?? 'card', at: d.paidAt!, chargeId: d.chargeId, deposit: true })
      inv.paidAmount = Math.min(invoiceTotals(inv).total, inv.paidAmount + d.amount)
      d.status = 'deducted'
      d.invoiceId = inv.id
      if (inv.status !== 'draft') inv.status = inv.paidAmount >= invoiceTotals(inv).total ? 'paid' : 'part_paid'
    }
  }

  // What Stripe tells Ardent -------------------------------------------------

  function settleInvoice(inv: Owned<Invoice>, charge: Owned<Charge>) {
    const total = invoiceTotals(inv).total
    const taken = Math.min(total - inv.paidAmount, charge.amount)
    if (taken > 0) (inv.payments ??= []).push({ amount: taken, method: charge.method, at: charge.at, chargeId: charge.id })
    inv.paidAmount = Math.min(total, inv.paidAmount + charge.amount)
    inv.status = inv.paidAmount >= total ? 'paid' : 'part_paid'
    inv.issuedAt ??= charge.at
    const job = db.jobs.find((j) => j.id === inv.jobId && j.orgId === inv.orgId)
    if (job) job.status = inv.status === 'paid' ? 'paid' : 'invoiced'
    if (inv.payLink && owed(inv) <= 0) delete inv.payLink
  }

  function paid(orgId: string, e: Extract<PaymentEvent, { type: 'paid' }>) {
    if (db.charges.some((c) => c.orgId === orgId && c.ref === e.ref)) return
    const { tags } = e
    const inv = tags.invoiceId ? db.invoices.find((i) => i.id === tags.invoiceId && i.orgId === orgId) : undefined
    const q = tags.quoteId ? db.quotes.find((x) => x.id === tags.quoteId && x.orgId === orgId) : undefined
    const plan = tags.planId ? db.plans.find((p) => p.id === tags.planId && p.orgId === orgId) : undefined
    const customerId = inv?.customerId ?? q?.customerId ?? plan?.customerId ?? ''
    const month = new Date(e.at).toLocaleDateString('en-GB', { month: 'long', timeZone: 'Europe/London' })
    const charge: Owned<Charge> = {
      id: newId('chg'),
      kind: tags.kind,
      method: e.method,
      amount: e.amount,
      fee: e.fee,
      ...(e.stripeFee !== undefined ? { stripeFee: e.stripeFee } : {}),
      refunded: 0,
      feeRefunded: 0,
      at: e.at,
      customerId,
      ...(inv ? { invoiceId: inv.id, jobId: inv.jobId } : {}),
      ...(q ? { quoteId: q.id, jobId: q.jobId } : {}),
      ...(plan ? { planId: plan.id } : {}),
      label: inv ? inv.ref : q ? `Deposit on ${q.ref}` : plan ? `${plan.ref}, ${month}` : 'Payment',
      ref: e.ref,
      orgId,
    }
    db.charges.push(charge)
    db.pendingPayments = db.pendingPayments.filter((p) => p.ref !== e.ref)
    const acct = accountRow(orgId)
    acct.firstPaymentAt ??= e.at
    const who = customerName(orgId, customerId)
    if (inv) {
      settleInvoice(inv, charge)
      log(orgId, `${who} paid ${pounds(e.amount)} on ${inv.ref} by ${METHOD_WORD[e.method]}${inv.status === 'paid' ? ', paid in full' : ''}`, { jobId: inv.jobId, action: 'payments.paid' })
    } else if (q?.deposit) {
      q.deposit.status = 'paid'
      q.deposit.paidAt = e.at
      q.deposit.chargeId = charge.id
      delete q.deposit.link
      log(orgId, `${who} paid the ${pounds(e.amount)} deposit on ${q.ref} by ${METHOD_WORD[e.method]}`, { jobId: q.jobId, action: 'payments.paid' })
      const open = db.invoices.find((i) => i.orgId === orgId && i.jobId === q.jobId && i.status !== 'void' && i.status !== 'paid')
      if (open) applyDeposits(open)
    } else if (plan) {
      plan.collected += e.amount
      plan.lastPaidAt = e.at
      if (plan.status === 'payment_failed') {
        plan.status = 'active'
        log(orgId, `${who}'s Direct Debit on ${plan.ref} went through after it failed`, { action: 'payments.paid' })
      }
    }
  }

  function dispute(orgId: string, e: Extract<PaymentEvent, { type: 'dispute' }>) {
    const charge = db.charges.find((c) => c.orgId === orgId && c.ref === e.ref)
    if (!charge) return
    let row = db.disputes.find((d) => d.orgId === orgId && d.ref === e.disputeRef)
    if (!row) {
      row = { id: newId('dsp'), chargeId: charge.id, amount: e.amount, reason: e.reason, status: e.status, openedAt: new Date().toISOString(), replyBy: e.replyBy, ref: e.disputeRef, orgId }
      db.disputes.push(row)
      charge.disputed = true
      log(orgId, `${customerName(orgId, charge.customerId)} disputed ${pounds(e.amount)} on ${charge.label} with their bank: ${e.reason}. Ardent has gathered the evidence from the job; reply by ${shortDate(e.replyBy)}`, { jobId: charge.jobId, action: 'payments.dispute' })
      return
    }
    if (row.status === e.status) return
    row.status = e.status
    if (e.status === 'won') log(orgId, `Won the dispute on ${charge.label}: the ${pounds(row.amount)} stays with you`, { jobId: charge.jobId, action: 'payments.dispute' })
    if (e.status === 'lost') log(orgId, `Lost the dispute on ${charge.label}: ${pounds(row.amount)} went back to the customer`, { jobId: charge.jobId, action: 'payments.dispute' })
  }

  /** Act on what Stripe said, once. Unknown accounts are ignored. */
  function event(e: PaymentEvent): boolean {
    if (db.paymentEvents.includes(e.id)) return false
    const row = db.paymentAccounts.find((a) => a.accountId === e.accountId)
    if (!row) return false
    const orgId = row.orgId
    if (e.type === 'account') applyState(row, e.state)
    else if (e.type === 'paid') {
      if (e.tags.orgId !== orgId) return false
      paid(orgId, e)
    } else if (e.type === 'plan_signed' || e.type === 'plan_failed') {
      const plan = db.plans.find((p) => p.id === e.planId && p.orgId === orgId)
      if (!plan) return false
      if (e.type === 'plan_signed') {
        if (plan.status === 'awaiting_signature') {
          plan.status = 'active'
          plan.startedAt = new Date().toISOString()
          plan.providerRef = e.ref
          delete plan.signLink
          log(orgId, `${customerName(orgId, plan.customerId)} signed the Direct Debit for ${plan.ref}, ${pounds(plan.monthly)} a month`, { action: 'payments.plan' })
        }
      } else {
        plan.status = 'payment_failed'
        plan.failures++
        plan.lastFailedAt = new Date().toISOString()
        log(orgId, `${customerName(orgId, plan.customerId)}'s Direct Debit for ${plan.ref} failed${e.reason ? `: ${e.reason}` : ''}. Give them a ring`, { action: 'payments.plan' })
      }
    } else if (e.type === 'refunded') {
      // Refunds made in Ardent are booked when they're made; this catches ones made in Stripe's dashboard.
      const c = db.charges.find((x) => x.orgId === orgId && x.ref === e.ref)
      if (c && e.amount > c.refunded) bookRefund(c, e.amount - c.refunded, undefined)
    } else if (e.type === 'dispute') dispute(orgId, e)
    db.paymentEvents.push(e.id)
    if (db.paymentEvents.length > EVENTS_KEEP) db.paymentEvents.splice(0, db.paymentEvents.length - EVENTS_KEEP)
    store.commit()
    return true
  }

  // Refunds -----------------------------------------------------------------

  function bookRefund(c: Owned<Charge>, amount: number, refund: Owned<Refund> | undefined) {
    const back = feeBack(c.fee, c.amount, c.refunded + amount) - c.feeRefunded
    c.refunded += amount
    c.feeRefunded += back
    if (refund) {
      refund.status = 'done'
      refund.doneAt = new Date().toISOString()
      refund.feeBack = back
    }
    const inv = db.invoices.find((i) => i.id === (c.invoiceId ?? db.quotes.find((q) => q.id === c.quoteId)?.deposit?.invoiceId) && i.orgId === c.orgId)
    // Money the firm chose to give back is settled, so the invoice isn't
    // reopened and nobody is chased for it; the refund shows in its history.
    if (inv) (inv.payments ??= []).push({ amount: -amount, method: c.method, at: new Date().toISOString(), chargeId: c.id, refund: true })
    log(c.orgId, `Refunded ${pounds(amount)} to ${customerName(c.orgId, c.customerId)} on ${c.label}${back ? `; Ardent gave back ${pounds(back)} of its fee` : ''}`, { jobId: c.jobId, action: 'payments.refunded' })
  }

  /** Carry out a refund someone said yes to in Approvals. */
  async function refundNow(orgId: string, refundId: string) {
    const r = db.refunds.find((x) => x.id === refundId && x.orgId === orgId)
    if (!r || r.status !== 'waiting') throw invalid('that refund is no longer waiting')
    const c = db.charges.find((x) => x.id === r.chargeId && x.orgId === orgId)!
    if (r.amount > c.amount - c.refunded) throw invalid(`only ${pounds(c.amount - c.refunded)} is left to refund on ${c.label}`)
    const p = provider()
    const a = account(orgId)
    if (!p || !a.accountId) throw invalid("payments aren't switched on")
    await p.refund(a.accountId, { ref: c.ref, amount: r.amount })
    bookRefund(c, r.amount, r)
  }

  /** Refunds waiting for a yes, as approvals. People always approve money going out. */
  function refundApprovals(orgId: string) {
    return db.refunds
      .filter((r) => r.orgId === orgId && r.status === 'waiting')
      .map((r) => {
        const c = db.charges.find((x) => x.id === r.chargeId)!
        const back = feeBack(c.fee, c.amount, c.refunded + r.amount) - c.feeRefunded
        return {
          kind: 'refund' as const,
          title: `Refund ${pounds(r.amount)} to ${customerName(orgId, c.customerId)} on ${c.label}`,
          why: `${r.askedBy} asked: ${r.reason}. They paid ${pounds(c.amount)} by ${METHOD_WORD[c.method]} on ${shortDate(c.at)}${c.refunded ? `, ${pounds(c.refunded)} already refunded` : ''}.`,
          preview: `${pounds(r.amount)} goes back to the customer's ${c.method === 'pay_by_bank' ? 'bank account' : c.method === 'direct_debit' ? 'bank account' : 'card'} in 5 to 10 days. Stripe keeps its own fee; Ardent gives back ${pounds(back)} of its fee.`,
          version: `${r.amount}.${c.refunded}`,
          jobId: c.jobId,
          invoiceId: c.invoiceId,
          refundId: r.id,
        }
      })
  }

  // Payouts and the clearing account -----------------------------------------

  const stripeFeeOf = (c: Charge) => c.stripeFee ?? stripeFeeEstimate(c.method, c.amount)

  function payouts(orgId: string, today = ukDay(new Date().toISOString())): Payout[] {
    const a = account(orgId)
    const first = a.firstPaymentAt ? ukDay(a.firstPaymentAt) : undefined
    const days = new Map<string, Payout>()
    const add = (day: string, amount: number, payment: boolean, firstHold = false) => {
      const p = days.get(day) ?? { day, amount: 0, status: day <= today ? 'paid' : 'on_its_way', payments: 0 }
      p.amount += amount
      if (payment) p.payments++
      if (firstHold) p.firstHold = true
      days.set(day, p)
    }
    for (const c of db.charges.filter((x) => x.orgId === orgId)) {
      const day = ukDay(c.at)
      const hold = day === first
      const lands = hold ? workingDaysAfter(new Date(Date.parse(`${day}T12:00:00Z`) + (FIRST_HOLD_DAYS - 1) * DAY).toISOString().slice(0, 10), 1) : workingDaysAfter(day, PAYOUT_DAYS)
      add(lands, c.amount - c.fee - stripeFeeOf(c), true, hold)
    }
    for (const r of db.refunds.filter((x) => x.orgId === orgId && x.status === 'done')) {
      add(workingDaysAfter(ukDay(r.doneAt!), PAYOUT_DAYS), -(r.amount - (r.feeBack ?? 0)), false)
    }
    if (a.status === 'paused') for (const p of days.values()) if (p.status === 'on_its_way') p.firstHold ??= false
    return [...days.values()].filter((p) => p.amount !== 0).sort((x, y) => y.day.localeCompare(x.day))
  }

  function ledger(orgId: string, month: string): Ledger {
    const lines: LedgerLine[] = []
    for (const c of db.charges.filter((x) => x.orgId === orgId && ukDay(x.at).startsWith(month))) {
      const day = ukDay(c.at)
      const payee = customerName(orgId, c.customerId)
      lines.push({ day, amount: c.amount, kind: 'payment', payee, description: `${c.label} by ${METHOD_WORD[c.method]}`, reference: c.label })
      lines.push({ day, amount: -stripeFeeOf(c), kind: 'stripe_fee', payee: 'Stripe', description: `Stripe fee on ${c.label}${c.stripeFee === undefined ? ' (estimate until Stripe says)' : ''}`, reference: c.label })
      if (c.fee) lines.push({ day, amount: -c.fee, kind: 'ardent_fee', payee: 'Ardent', description: `Ardent fee on ${c.label}, 0.2%`, reference: c.label })
    }
    for (const r of db.refunds.filter((x) => x.orgId === orgId && x.status === 'done' && ukDay(x.doneAt!).startsWith(month))) {
      const c = db.charges.find((x) => x.id === r.chargeId)!
      const day = ukDay(r.doneAt!)
      lines.push({ day, amount: -r.amount, kind: 'refund', payee: customerName(orgId, c.customerId), description: `Refund on ${c.label}`, reference: c.label })
      if (r.feeBack) lines.push({ day, amount: r.feeBack, kind: 'ardent_fee', payee: 'Ardent', description: `Ardent fee given back on ${c.label}`, reference: c.label })
    }
    for (const p of payouts(orgId).filter((x) => x.status === 'paid' && x.day.startsWith(month))) {
      lines.push({ day: p.day, amount: -p.amount, kind: 'payout', payee: firmName(orgId), description: `Stripe payout to the bank, ${p.payments} ${p.payments === 1 ? 'payment' : 'payments'}`, reference: `Payout ${p.day}` })
    }
    lines.sort((a, b) => a.day.localeCompare(b.day))
    const csv = ['*Date,*Amount,Payee,Description,Reference', ...lines.map((l) => [ddmmyyyy(l.day), (l.amount / 100).toFixed(2), l.payee, l.description, l.reference].map(csvCell).join(','))].join('\n')
    return { month, lines, balance: lines.reduce((s, l) => s + l.amount, 0), csv }
  }

  // Disputes ----------------------------------------------------------------

  function evidence(orgId: string, id: string): EvidencePack {
    const d = db.disputes.find((x) => x.id === id && x.orgId === orgId)
    if (!d) throw notFound('dispute')
    const c = db.charges.find((x) => x.id === d.chargeId)!
    const cust = db.customers.find((x) => x.id === c.customerId && x.orgId === orgId)
    const job = db.jobs.find((j) => j.id === c.jobId && j.orgId === orgId)
    const site = job && db.sites.find((s) => s.id === job.siteId)
    const quote = job && db.quotes.find((q) => q.orgId === orgId && q.jobId === job.id && q.status === 'accepted')
    const inv = db.invoices.find((i) => i.orgId === orgId && (i.id === c.invoiceId || (job && i.jobId === job.id && i.status !== 'void')))
    const name = (opId: string) => db.operators.find((o) => o.id === opId)?.name ?? 'Engineer'
    const onSite = job ? db.time.filter((t) => t.orgId === orgId && t.jobId === job.id && t.kind === 'labour').map((t) => ({ who: name(t.operatorId), from: t.start, ...(t.end ? { to: t.end } : {}) })) : []
    const sig = job && db.signatures.filter((x) => x.orgId === orgId && x.jobId === job.id).at(-1)
    const report = job && db.reports.find((r) => r.orgId === orgId && r.jobId === job.id && r.status === 'signed')
    const photos = job ? db.photos.filter((p) => p.orgId === orgId && p.jobId === job.id).map((p) => ({ id: p.id, stage: p.stage, takenAt: p.takenAt, ...(p.caption ? { caption: p.caption } : {}) })) : []
    const certificates = job
      ? [
          ...db.certificates.filter((x) => x.orgId === orgId && x.jobId === job.id).map((x) => ({ kind: x.kind, issued: x.issued })),
          ...db.gasRecords.filter((r) => r.orgId === orgId && r.jobId === job.id && r.status === 'issued').map((r) => ({ kind: `Gas safety record ${r.ref}`, issued: r.issuedAt })),
        ]
      : []
    const reportText = report?.sections.flatMap((x) => x.lines.map((l) => l.text)).join(' ') || report?.segments.map((x) => x.text).join(' ')
    const pack: Omit<EvidencePack, 'summary'> = {
      dispute: { id: d.id, chargeId: d.chargeId, amount: d.amount, reason: d.reason, status: d.status, openedAt: d.openedAt, replyBy: d.replyBy, ...(d.sentAt ? { sentAt: d.sentAt } : {}), ...(d.note ? { note: d.note } : {}) },
      charge: (({ orgId: _o, ...rest }) => rest)(c),
      customer: { name: cust?.name ?? 'Customer', ...(cust?.email ? { email: cust.email } : {}), ...(cust?.phone ? { phone: cust.phone } : {}) },
      ...(job ? { job: { ref: job.ref, title: job.title, ...(site ? { address: `${site.line1}, ${site.postcode}` } : {}), start: job.start } } : {}),
      ...(quote ? { quote: { ref: quote.ref, ...(quote.sentAt ? { sentAt: quote.sentAt } : {}), ...(quote.chosen ? { acceptedOption: quote.options?.find((o) => o.key === quote.chosen)?.label ?? quote.chosen } : {}), total: quoteTotal(quote) } } : {}),
      ...(inv ? { invoice: { ref: inv.ref, ...(inv.issuedAt ? { issuedAt: inv.issuedAt } : {}), total: invoiceTotals(inv).total, lines: inv.lines.map((l) => `${l.quantity} x ${l.description}, ${pounds(l.unitPrice)}`) } } : {}),
      onSite,
      ...(sig ? { signOff: { by: sig.signedBy, at: sig.at } } : {}),
      ...(reportText ? { report: reportText } : {}),
      photos,
      certificates,
    }
    const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const parts = [
      `${firmName(orgId)} carried out the work this payment was for.`,
      pack.quote ? `${pack.customer.name} accepted quote ${pack.quote.ref}${pack.quote.acceptedOption ? ` (${pack.quote.acceptedOption})` : ''} for ${pounds(pack.quote.total)}${pack.quote.sentAt ? `, sent on ${when(pack.quote.sentAt)}` : ''}.` : '',
      pack.job ? `Job ${pack.job.ref}, ${pack.job.title}${pack.job.address ? `, at ${pack.job.address}` : ''}, booked for ${when(pack.job.start)}.` : '',
      onSite.length ? `On site: ${onSite.map((t) => `${t.who} from ${when(t.from)}${t.to ? ` to ${when(t.to)}` : ''}`).join('; ')}.` : '',
      pack.report ? `The engineer's report: ${pack.report}` : '',
      certificates.length ? `Certificates issued: ${certificates.map((x) => x.kind).join(', ')}.` : '',
      photos.length ? `${photos.length} photos of the work, taken on site with times (attached).` : '',
      pack.signOff ? `${pack.signOff.by} signed the work off on the engineer's phone${pack.signOff.at ? ` on ${when(pack.signOff.at)}` : ''}.` : '',
      pack.invoice ? `Invoice ${pack.invoice.ref} for ${pounds(pack.invoice.total)}: ${pack.invoice.lines.join('; ')}.` : '',
      `Paid ${pounds(c.amount)} by ${METHOD_WORD[c.method]} on ${when(c.at)}.`,
    ]
    return { ...pack, summary: parts.filter(Boolean).join('\n') }
  }

  // Service plans -----------------------------------------------------------

  /** Book each active plan's yearly service a few weeks before it's due. */
  function syncPlans(orgId: string, now = Date.now()) {
    let changed = false
    for (const plan of db.plans.filter((p) => p.orgId === orgId && (p.status === 'active' || p.status === 'payment_failed'))) {
      if (Date.parse(`${plan.nextService}T09:00:00Z`) - now > BOOK_AHEAD) continue
      const site = db.sites.find((s) => s.id === plan.siteId && s.orgId === orgId) ?? db.sites.find((s) => s.orgId === orgId && s.customerId === plan.customerId)
      if (!site) continue
      const job = {
        id: newId('job'),
        ref: `J-${nextNumber(orgId, 'job')}`,
        title: `${plan.name} (service plan ${plan.ref})`,
        trade: 'gas' as const,
        status: 'enquiry' as const,
        priority: 'normal' as const,
        customerId: plan.customerId,
        siteId: site.id,
        operatorIds: [],
        start: `${plan.nextService}T09:00:00.000Z`,
        end: `${plan.nextService}T10:00:00.000Z`,
        lines: [],
        checks: [],
        notes: `Covered by ${plan.ref}: ${plan.includes.join(', ')}. Nothing to charge for the service.`,
        orgId,
      }
      db.jobs.push(job)
      plan.serviceJobId = job.id
      const next = new Date(`${plan.nextService}T12:00:00Z`)
      next.setUTCFullYear(next.getUTCFullYear() + 1)
      plan.nextService = next.toISOString().slice(0, 10)
      log(orgId, `Booked ${customerName(orgId, plan.customerId)}'s yearly service on ${plan.ref} as ${job.ref}, due ${shortDate(job.start)}: pick a slot and an engineer`, { jobId: job.id, action: 'payments.plan' })
      changed = true
    }
    return changed
  }

  // The demo stands in for Stripe ---------------------------------------------

  function simulate(orgId: string, e: DemoPayment, by: string): { chargeId?: string } {
    const p = provider()
    if (!p?.demo) throw forbidden('only the demo can pretend to be Stripe')
    const a = account(orgId)
    if (!a.accountId) throw invalid('set up payments first')
    const base = { id: newId('evt'), accountId: a.accountId }
    const now = new Date().toISOString()
    const findCharge = (id: string) => {
      const c = db.charges.find((x) => x.id === id && x.orgId === orgId)
      if (!c) throw notFound('payment')
      return c
    }
    switch (e.kind) {
      case 'signed_up':
        event({ ...base, type: 'account', state: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, due: [] } })
        return {}
      case 'paid': {
        const inv = e.invoiceId ? db.invoices.find((i) => i.id === e.invoiceId && i.orgId === orgId) : undefined
        const q = e.quoteId ? db.quotes.find((x) => x.id === e.quoteId && x.orgId === orgId) : undefined
        const amount = inv ? owed(inv) : q?.deposit?.status === 'requested' ? q.deposit.amount : 0
        if (amount <= 0) throw invalid('nothing to pay')
        const ref = `pi_test_${newId('x').slice(2)}`
        event({ ...base, type: 'paid', ref, amount, fee: ardentFee(amount), method: e.method, at: now, tags: inv ? { orgId, kind: 'invoice', invoiceId: inv.id } : { orgId, kind: 'deposit', quoteId: q!.id } })
        return { chargeId: db.charges.find((c) => c.ref === ref)?.id }
      }
      case 'tapped': {
        const pend = db.pendingPayments.find((x) => x.orgId === orgId && x.ref === e.intent)
        if (!pend) throw notFound('payment waiting for a tap')
        event({ ...base, type: 'paid', ref: pend.ref, amount: pend.amount, fee: pend.fee, method: 'tap', at: now, tags: pend.tags })
        return { chargeId: db.charges.find((c) => c.ref === pend.ref)?.id }
      }
      case 'dispute': {
        const c = findCharge(e.chargeId)
        event({ ...base, type: 'dispute', ref: c.ref, disputeRef: `dp_test_${newId('x').slice(2)}`, amount: c.amount - c.refunded, reason: 'Customer says the work wasn’t done as agreed', replyBy: new Date(Date.now() + 9 * DAY).toISOString(), status: 'needs_reply' })
        return { chargeId: c.id }
      }
      case 'dispute_result': {
        const d = db.disputes.find((x) => x.id === e.disputeId && x.orgId === orgId)
        if (!d) throw notFound('dispute')
        const c = findCharge(d.chargeId)
        event({ ...base, type: 'dispute', ref: c.ref, disputeRef: d.ref, amount: d.amount, reason: d.reason, replyBy: d.replyBy, status: e.won ? 'won' : 'lost' })
        return { chargeId: c.id }
      }
      case 'plan_signed':
        event({ ...base, type: 'plan_signed', planId: e.planId, orgId, ref: `sub_test_${newId('x').slice(2)}` })
        return {}
      case 'plan_collected': {
        const plan = db.plans.find((x) => x.id === e.planId && x.orgId === orgId)
        if (!plan || plan.status === 'awaiting_signature' || plan.status === 'cancelled') throw invalid('that plan is not collecting')
        event({ ...base, type: 'paid', ref: `in_test_${newId('x').slice(2)}`, amount: plan.monthly, fee: ardentFee(plan.monthly), method: 'direct_debit', at: now, tags: { orgId, kind: 'plan', planId: plan.id } })
        return {}
      }
      case 'plan_failed':
        event({ ...base, type: 'plan_failed', planId: e.planId, orgId, reason: 'not enough in the account' })
        return {}
    }
    void by
    return {}
  }

  // Opening a pay link ------------------------------------------------------

  /**
   * A customer opened /pay/<id>. Makes a fresh Stripe page for what is owed
   * now. An invoice the engineer raised with no signal isn't here yet, but
   * its code carries the invoice, signed by the engineer's phone, so it is
   * raised here first and the phone's copy joins it when it syncs.
   */
  async function open(id: string, q: { o?: string; s?: string } = {}): Promise<{ url: string } | { message: string }> {
    const p = provider()
    if (!p) return { message: 'Card payments are not switched on yet. Please pay by bank transfer using the details on your invoice.' }
    let inv = db.invoices.find((i) => i.id === id || i.offlineId === id)
    if (!inv && q.o && q.s) {
      const peek = (() => {
        try {
          return JSON.parse(atob(q.o!.replace(/-/g, '+').replace(/_/g, '/'))) as { orgId?: string; operatorId?: string }
        } catch {
          return {}
        }
      })()
      const off = peek.orgId && peek.operatorId ? readOffline(q.o, q.s, offlineKey(peek.orgId, peek.operatorId)) : undefined
      const job = off && db.jobs.find((j) => j.id === off.jobId && j.orgId === off.orgId && j.operatorIds.includes(off.operatorId))
      if (off && job) {
        inv = {
          id: newId('inv'),
          ref: `INV-${nextNumber(off.orgId, 'invoice')}`,
          jobId: job.id,
          customerId: job.customerId,
          lines: off.lines.map(([description, quantity, unitPrice, kind]) => ({ id: newId('li'), kind, description, quantity, unitPrice })),
          vatRate: off.vatRate,
          status: 'sent',
          issuedAt: off.at,
          dueAt: new Date(Date.parse(off.at) + 14 * DAY).toISOString(),
          paidAmount: 0,
          offlineId: off.offlineId,
          orgId: off.orgId,
        }
        db.invoices.push(inv)
        applyDeposits(inv)
        log(off.orgId, `Raised ${inv.ref} from the pay code on ${db.operators.find((o) => o.id === off.operatorId)?.name ?? 'an engineer'}'s phone, which had no signal`, { jobId: job.id, action: 'invoices.create' })
        store.commit()
      }
    }
    const quote = inv ? undefined : db.quotes.find((x) => x.id === id && x.deposit?.status === 'requested')
    if (!inv && !quote) return { message: 'We could not find this invoice. If the engineer has just finished, they will text you a link shortly.' }
    const orgId = (inv ?? quote)!.orgId
    const a = account(orgId)
    if (!active(orgId) || !a.accountId) return { message: `${firmName(orgId)} is not taking card payments yet. Please pay by bank transfer using the details on your invoice.` }
    const amount = inv ? owed(inv) : quote!.deposit!.amount
    if (amount <= 0) return { message: 'This invoice is paid. Thank you.' }
    const ref = inv ? inv.ref : `deposit on ${quote!.ref}`
    const page = await p.checkout(a.accountId, {
      amount,
      fee: ardentFee(amount),
      description: `${firmName(orgId)}, ${ref}`,
      email: db.customers.find((c) => c.id === (inv ?? quote)!.customerId)?.email,
      tags: inv ? { orgId, kind: 'invoice', invoiceId: inv.id } : { orgId, kind: 'deposit', quoteId: quote!.id },
      successUrl: `${p.publicUrl ?? ''}/pay/done`,
      cancelUrl: `${p.publicUrl ?? ''}/pay/${id}`,
    })
    return { url: page.url }
  }

  /** The key a phone signs offline pay codes with: one per engineer per firm. */
  const offlineKey = (orgId: string, operatorId: string) => sign(`pay:${orgId}:${operatorId}`)

  // For a session -------------------------------------------------------------

  interface Session {
    orgId: string
    isOffice: () => boolean
    isOwner: () => boolean
    requireOffice: (what: string) => void
    myOperatorId: () => string | undefined
    findInvoice: (id: string) => Owned<Invoice>
    me: () => { name: string }
    run: <T>(fn: () => T) => Promise<T>
    done: <T>(value: T) => Promise<T>
    out: <T extends object>(row: T) => Omit<T, 'orgId' | 'userId'>
  }

  function client(s: Session) {
    const { orgId, run, done, out, requireOffice } = s
    const pub = (a: Owned<PaymentAccount & { accountId?: string }>): PaymentAccount => {
      const { orgId: _o, accountId: _a, ...rest } = structuredClone(a)
      return { ...rest, test: provider()?.test ?? true }
    }
    const needOwner = (what: string) => {
      if (!s.isOwner()) throw forbidden(`only the owner can ${what}`)
    }
    const needProvider = () => {
      const p = provider()
      if (!p) throw invalid("payments aren't switched on for Ardent yet")
      return p
    }
    const monthOf = (iso: string) => ukDay(iso).slice(0, 7)

    return {
      payments: {
        get: () =>
          run((): PaymentsOverview => {
            const a = pub(account(orgId))
            const opId = s.myOperatorId()
            if (!s.isOffice()) return { account: a, charges: [], refunds: [], disputes: [], month: { taken: 0, fees: 0, stripeFees: 0, count: 0 }, ...(opId ? { offlineKey: offlineKey(orgId, opId) } : {}) }
            const month = monthOf(new Date().toISOString())
            const charges = db.charges.filter((c) => c.orgId === orgId).sort((x, y) => y.at.localeCompare(x.at))
            const thisMonth = charges.filter((c) => monthOf(c.at) === month)
            return {
              account: a,
              charges: charges.map((c) => out(c) as Charge),
              refunds: db.refunds.filter((r) => r.orgId === orgId).map((r) => out(r) as Refund).reverse(),
              disputes: db.disputes.filter((d) => d.orgId === orgId).map((d) => (({ ref: _r, ...rest }) => rest)(out(d)) as Dispute).reverse(),
              month: {
                taken: thisMonth.reduce((t, c) => t + c.amount - c.refunded, 0),
                fees: thisMonth.reduce((t, c) => t + c.fee - c.feeRefunded, 0),
                stripeFees: thisMonth.reduce((t, c) => t + stripeFeeOf(c), 0),
                count: thisMonth.length,
              },
              ...(opId ? { offlineKey: offlineKey(orgId, opId) } : {}),
            }
          }),
        setUp: async (returnUrl: string) => {
          const p = await run(() => (needOwner('set up payments'), needProvider()))
          const row = accountRow(orgId)
          if (!row.accountId) {
            const owner = db.memberships.find((m) => m.orgId === orgId && m.role === 'owner')
            const email = db.users.find((u) => u.id === owner?.userId)?.email
            row.accountId = (await p.createAccount({ name: firmName(orgId), email, orgId })).accountId
            row.status = 'onboarding'
            row.test = p.test
            row.updatedAt = new Date().toISOString()
          }
          const link = await p.onboardingLink(row.accountId, returnUrl, returnUrl)
          return done(link)
        },
        refresh: async () => {
          const p = await run(() => (requireOffice('check payments'), needProvider()))
          const row = accountRow(orgId)
          if (row.accountId && !p.demo) applyState(row, await p.account(row.accountId))
          return done(pub(row))
        },
        settings: (patch: { depositPercent?: number; depositFrom?: number }) =>
          run(() => {
            needOwner('change deposits')
            const row = accountRow(orgId)
            if (patch.depositPercent !== undefined) {
              if (!Number.isInteger(patch.depositPercent) || patch.depositPercent < 0 || patch.depositPercent > 50) throw invalid('a deposit is a whole percentage from 0 to 50')
              row.depositPercent = patch.depositPercent
            }
            if (patch.depositFrom !== undefined) {
              if (!Number.isInteger(patch.depositFrom) || patch.depositFrom < 0) throw invalid('the deposit threshold is whole pence')
              row.depositFrom = patch.depositFrom
            }
            return pub(row)
          }).then(done),
        link: (invoiceId: string) =>
          run(() => {
            const inv = s.findInvoice(invoiceId)
            if (!active(orgId)) throw invalid("payments aren't switched on yet: the invoice shows your bank details instead")
            const link = invoiceLink(inv)
            if (!link) throw invalid(inv.status === 'paid' ? 'that invoice is paid' : 'nothing is owed on that invoice')
            return structuredClone(link)
          }).then(done),
        tap: async (invoiceId: string): Promise<TapToPay> => {
          const { inv, p, a } = await run(() => {
            const inv = s.findInvoice(invoiceId)
            if (!active(orgId)) throw invalid("payments aren't switched on yet")
            if (owed(inv) <= 0) throw invalid('nothing is owed on that invoice')
            return { inv, p: needProvider(), a: account(orgId) }
          })
          const amount = owed(inv)
          const fee = ardentFee(amount)
          const tags: PaymentTags = { orgId, kind: 'invoice', invoiceId: inv.id }
          const t = await p.tap(a.accountId!, { amount, fee, description: `${firmName(orgId)}, ${inv.ref}`, tags })
          db.pendingPayments = db.pendingPayments.filter((x) => !(x.orgId === orgId && x.tags.invoiceId === inv.id))
          db.pendingPayments.push({ ref: t.intent, tags, amount, fee, createdAt: new Date().toISOString(), orgId })
          return done({ ...t, amount, fee, test: p.test, demo: !!p.demo })
        },
        refund: (chargeId: string, amount: number, reason: string) =>
          run(() => {
            requireOffice('refund payments')
            const c = db.charges.find((x) => x.id === chargeId && x.orgId === orgId)
            if (!c) throw notFound('payment')
            if (!Number.isInteger(amount) || amount <= 0) throw invalid('a refund is whole pence above zero')
            const waiting = db.refunds.filter((r) => r.chargeId === c.id && r.status === 'waiting').reduce((t, r) => t + r.amount, 0)
            if (amount > c.amount - c.refunded - waiting) throw invalid(`only ${pounds(c.amount - c.refunded - waiting)} can still be refunded on ${c.label}`)
            if (!reason?.trim()) throw invalid('say why, so whoever approves it knows')
            const r: Owned<Refund> = { id: newId('ref'), chargeId: c.id, amount, reason: reason.trim(), status: 'waiting', askedBy: s.me().name, askedAt: new Date().toISOString(), orgId }
            db.refunds.push(r)
            return out(r) as Refund
          }).then(done),
        simulate: (e: DemoPayment) => run(() => simulate(orgId, e, s.me().name)).then(done),
      },
      payouts: {
        list: () => run(() => (requireOffice('see payouts'), payouts(orgId))),
      },
      disputes: {
        list: () => run(() => (requireOffice('see disputes'), db.disputes.filter((d) => d.orgId === orgId).map((d) => (({ ref: _r, ...rest }) => rest)(out(d)) as Dispute).reverse())),
        get: (id: string) => run(() => (requireOffice('see disputes'), evidence(orgId, id))),
        send: async (id: string, note?: string) => {
          const { d, p, text } = await run(() => {
            needOwner('answer disputes')
            const d = db.disputes.find((x) => x.id === id && x.orgId === orgId)
            if (!d) throw notFound('dispute')
            if (d.status !== 'needs_reply') throw invalid(`that dispute is ${d.status.replace('_', ' ')}`)
            const pack = evidence(orgId, id)
            return { d, p: needProvider(), text: note?.trim() ? `${pack.summary}\n\n${note.trim()}` : pack.summary }
          })
          await p.disputeEvidence(account(orgId).accountId!, { ref: d.ref, text })
          d.status = 'sent'
          d.sentAt = new Date().toISOString()
          if (note?.trim()) d.note = note.trim()
          return done((({ ref: _r, ...rest }) => rest)(out(d)) as Dispute)
        },
      },
      plans: {
        list: () =>
          run(() => {
            requireOffice('see service plans')
            if (syncPlans(orgId)) store.commit()
            return db.plans.filter((p) => p.orgId === orgId).map((p) => (({ providerRef: _r, ...rest }) => rest)(out(p)) as ServicePlan).reverse()
          }),
        create: async (input: { customerId: string; siteId?: string; name: string; monthly: number; includes: string[]; firstService?: string }) => {
          const plan = await run(() => {
            requireOffice('set up service plans')
            const c = db.customers.find((x) => x.id === input.customerId && x.orgId === orgId)
            if (!c) throw notFound('customer')
            if (input.siteId && !db.sites.some((x) => x.id === input.siteId && x.orgId === orgId && x.customerId === c.id)) throw invalid("site doesn't belong to that customer")
            if (!input.name?.trim()) throw invalid('the plan needs a name')
            if (!Number.isInteger(input.monthly) || input.monthly < 100 || input.monthly > 25000) throw invalid('a plan is £1 to £250 a month, in whole pence')
            const includes = (input.includes ?? []).map((x) => x.trim()).filter(Boolean)
            if (!includes.length) throw invalid('say what the plan covers')
            if ([input.name, ...includes].some((x) => INSURANCE.test(x))) throw invalid('plans that pay for repairs or breakdowns can count as insurance: keep to servicing and discounts unless you have checked')
            if (!active(orgId)) throw invalid("payments aren't switched on yet")
            const next = input.firstService ?? (() => {
              const d = new Date()
              d.setUTCFullYear(d.getUTCFullYear() + 1)
              return d.toISOString().slice(0, 10)
            })()
            if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw invalid('the first service is a date, YYYY-MM-DD')
            const row: Owned<ServicePlan & { providerRef?: string }> = {
              id: newId('pln'),
              ref: `SP-${nextNumber(orgId, 'plan')}`,
              customerId: c.id,
              ...(input.siteId ? { siteId: input.siteId } : {}),
              name: input.name.trim(),
              monthly: input.monthly,
              includes,
              status: 'awaiting_signature',
              createdAt: new Date().toISOString(),
              nextService: next,
              collected: 0,
              failures: 0,
              orgId,
            }
            return row
          })
          const p = needProvider()
          const page = await p.directDebit(account(orgId).accountId!, {
            monthly: plan.monthly,
            name: `${firmName(orgId)}: ${plan.name}`,
            email: db.customers.find((c) => c.id === plan.customerId)?.email,
            tags: { orgId, kind: 'plan', planId: plan.id },
            successUrl: provider()?.publicUrl ? `${provider()?.publicUrl}/pay/done` : '#/',
            cancelUrl: provider()?.publicUrl ? `${provider()?.publicUrl}/pay/done` : '#/',
          })
          plan.signLink = p.demo ? `#/plan/${plan.id}` : page.url
          db.plans.push(plan)
          return done((({ providerRef: _r, ...rest }) => rest)(out(plan)) as ServicePlan)
        },
        cancel: async (id: string) => {
          const plan = await run(() => {
            requireOffice('cancel service plans')
            const plan = db.plans.find((p) => p.id === id && p.orgId === orgId)
            if (!plan) throw notFound('plan')
            if (plan.status === 'cancelled') throw invalid('that plan is already cancelled')
            return plan
          })
          if (plan.providerRef) await needProvider().cancelDirectDebit(account(orgId).accountId!, plan.providerRef)
          plan.status = 'cancelled'
          delete plan.signLink
          return done((({ providerRef: _r, ...rest }) => rest)(out(plan)) as ServicePlan)
        },
      },
      ledger: {
        get: (opts: { month?: string } = {}) =>
          run(() => {
            requireOffice('see the Stripe account for Xero')
            const month = opts.month ?? monthOf(new Date().toISOString())
            if (!/^\d{4}-\d{2}$/.test(month)) throw invalid('month is YYYY-MM')
            return ledger(orgId, month)
          }),
      },
    }
  }

  // Ardent HQ: payments across every firm -----------------------------------

  function acrossFirms(month: string, monthlySubscriptions: number) {
    const inMonth = (iso: string) => ukDay(iso).startsWith(month)
    const firms = db.orgs.map((o) => {
      const a = account(o.id)
      const cs = db.charges.filter((c) => c.orgId === o.id && inMonth(c.at))
      return {
        firmId: o.id,
        firmName: o.name,
        status: a.status,
        stuck: a.status === 'needs_info' ? `Stripe needs: ${a.due.join(', ') || 'more details'}` : a.status === 'onboarding' ? 'Started the Stripe sign-up and stopped' : a.status === 'paused' ? (a.paused ?? 'Paused by Stripe') : undefined,
        volume: cs.reduce((t, c) => t + c.amount - c.refunded, 0),
        count: cs.length,
        fee: cs.reduce((t, c) => t + c.fee - c.feeRefunded, 0),
        depositPercent: a.depositPercent,
        plans: db.plans.filter((p) => p.orgId === o.id && p.status === 'active').length,
      }
    })
    const cs = db.charges.filter((c) => inMonth(c.at))
    const byMethod = Object.fromEntries((['card', 'tap', 'pay_by_bank', 'direct_debit'] as const).map((m) => [m, { amount: 0, count: 0 }])) as Record<Charge['method'], { amount: number; count: number }>
    for (const c of cs) {
      byMethod[c.method].amount += c.amount - c.refunded
      byMethod[c.method].count++
    }
    const problems = [
      ...db.disputes.filter((d) => d.status === 'needs_reply').map((d) => ({ kind: 'dispute' as const, firmId: d.orgId, firmName: firmName(d.orgId), title: `Dispute: ${pounds(d.amount)}`, detail: `${d.reason}. Reply by ${shortDate(d.replyBy)}` })),
      ...db.plans.filter((p) => p.status === 'payment_failed').map((p) => ({ kind: 'dd_failed' as const, firmId: p.orgId, firmName: firmName(p.orgId), title: `Direct Debit failed on ${p.ref}`, detail: `${customerName(p.orgId, p.customerId)}, ${pounds(p.monthly)} a month, ${p.failures} ${p.failures === 1 ? 'failure' : 'failures'}` })),
      ...db.paymentAccounts.filter((a) => a.status === 'paused' || (a.accountId && a.chargesEnabled && !a.payoutsEnabled)).map((a) => ({ kind: 'payouts_paused' as const, firmId: a.orgId, firmName: firmName(a.orgId), title: 'Payouts paused', detail: a.paused ?? 'Stripe is holding payouts until it has what it needs' })),
    ]
    const fee = cs.reduce((t, c) => t + c.fee - c.feeRefunded, 0)
    const now = new Date()
    const [y, m] = month.split('-').map(Number)
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const thisMonth = ukDay(now.toISOString()).startsWith(month)
    const daysSoFar = thisMonth ? Number(ukDay(now.toISOString()).slice(8, 10)) : daysIn
    const forecastFee = daysSoFar ? Math.round((fee / daysSoFar) * daysIn) : 0
    return {
      month,
      totals: { volume: cs.reduce((t, c) => t + c.amount - c.refunded, 0), count: cs.length, fee, byMethod },
      firms,
      problems,
      forecast: { payments: forecastFee, subscriptions: monthlySubscriptions, total: forecastFee + monthlySubscriptions, goal: 100_000_000 },
    }
  }

  /** Stripe's webhook: check it's really Stripe, then act on it. */
  async function webhook(raw: string, signature: string) {
    const p = provider()
    if (!p || p.demo) throw notFound('payments')
    const e = await p.event(raw, signature)
    return e ? event(e) : false
  }

  return { event, webhook, open, client, account, invoiceLink, payLine, askDeposit, applyDeposits, refundApprovals, refundNow, acrossFirms, active, syncPlans }
}

export type Payments = ReturnType<typeof createPayments>
