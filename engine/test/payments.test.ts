// Taking payments through each firm's own Stripe account, with Ardent's 0.2% fee.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { connectHqDemo } from '../src/connect-hq.ts'
import { connectDemo, type KeyValue } from '../src/connect.ts'
import { createEngine } from '../src/engine.ts'
import { ardentFee, feeBack, readOffline, signOffline } from '../kit/pay.ts'
import type { PaymentEvent, PaymentProvider } from '../src/platform.ts'
import { nodePlatform } from '../src/platform-node.ts'
import { createServer } from '../src/server.ts'
import { memoryStore } from '../src/store.ts'
import { stripeProvider, verifySignature } from '../src/stripe.ts'
import { freshDemoData } from './helpers.ts'

/** Stripe as a test double: remembers what Ardent asked of it. */
function fakeStripe() {
  const calls: { fn: string; args: unknown[] }[] = []
  let n = 0
  const rec = <T,>(fn: string, value: (...a: never[]) => T) => async (...args: unknown[]) => {
    calls.push({ fn, args })
    return (value as (...a: unknown[]) => T)(...args)
  }
  const provider: PaymentProvider = {
    test: true,
    publicUrl: 'https://app.test',
    createAccount: rec('createAccount', () => ({ accountId: `acct_${++n}` })),
    onboardingLink: rec('onboardingLink', () => ({ url: 'https://connect.stripe.test/setup' })),
    account: rec('account', () => ({ chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: true, due: ['individual.verification.document'] })),
    checkout: rec('checkout', () => ({ id: `cs_${++n}`, url: `https://checkout.stripe.test/${n}` })),
    tap: rec('tap', () => ({ intent: `pi_tap_${++n}`, clientSecret: 'secret', connectionToken: 'pst_test' })),
    directDebit: rec('directDebit', () => ({ id: `cs_${++n}`, url: `https://checkout.stripe.test/dd/${n}` })),
    cancelDirectDebit: rec('cancelDirectDebit', () => undefined),
    refund: rec('refund', () => ({ id: `re_${++n}` })),
    disputeEvidence: rec('disputeEvidence', () => undefined),
    event: rec('event', () => undefined),
  }
  return { provider, calls }
}

function setup() {
  const stripe = fakeStripe()
  const engine = createEngine(memoryStore(freshDemoData()), { ...nodePlatform, payments: stripe.provider })
  const as = (who: string) => engine.as({ userId: `usr_${who}`, orgId: 'org_demo' })
  let e = 0
  const say = (ev: Record<string, unknown>) => engine.paymentEvent({ id: `evt_${++e}`, accountId: 'acct_test_mercer', ...ev } as PaymentEvent)
  return { engine, as, stripe, say }
}

test("Ardent's fee: 0.2% of each payment, never more than £5", () => {
  assert.equal(ardentFee(31200), 62)
  assert.equal(ardentFee(250000), 500)
  assert.equal(ardentFee(1_000_000), 500, 'capped at £5')
  assert.equal(feeBack(62, 31200, 15600), 31, 'half refunded, half the fee back')
})

test('without Stripe keys, payments say so and invoices show bank details', async () => {
  const engine = createEngine(memoryStore(freshDemoData()), nodePlatform)
  const dan = engine.as({ userId: 'usr_dan', orgId: 'org_demo' }).client
  await assert.rejects(dan.payments.setUp('https://x'), /payments aren't switched on/)
  await assert.rejects(dan.payments.link('inv_2207'), /payments aren't switched on/)
  const sent = await dan.invoices.send('inv_2208', 'email')
  assert.equal(sent.payLink, undefined)
})

test('the owner opens the firm’s own Stripe account; Stripe bills the firm and Ardent never holds money', async () => {
  const { engine, as, stripe } = setup()
  engine.data.paymentAccounts = engine.data.paymentAccounts.filter((a) => a.orgId !== 'org_demo')
  await assert.rejects(as('jo').client.payments.setUp('https://app.test/#/settings/payments'), { code: 'forbidden' })
  const { url } = await as('dan').client.payments.setUp('https://app.test/#/settings/payments')
  assert.equal(url, 'https://connect.stripe.test/setup')
  assert.equal(stripe.calls[0].fn, 'createAccount')
  let acct = (await as('dan').client.payments.get()).account
  assert.equal(acct.status, 'onboarding')
  assert.equal(acct.test, true)
  // Stripe says it needs the director's ID, in the owner's words.
  acct = await as('jo').client.payments.refresh()
  assert.equal(acct.status, 'needs_info')
  assert.deepEqual(acct.due, ["A director's ID"])
  // Then the account is ready.
  engine.paymentEvent({ id: 'evt_a', accountId: 'acct_1', type: 'account', state: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, due: [] } })
  assert.equal((await as('dan').client.payments.get()).account.status, 'active')
  assert.ok((await as('dan').client.log.list()).some((x) => /Payments are switched on/.test(x.summary)))
})

test('every invoice carries a Pay now link; paying it marks it paid the moment Stripe says', async () => {
  const { engine, as, stripe, say } = setup()
  const dan = as('dan').client
  const inv = await dan.invoices.send('inv_2208', 'email')
  assert.equal(inv.payLink?.url, 'https://app.test/pay/inv_2208', 'a link that never goes stale')
  assert.equal(inv.payLink?.fee, ardentFee(inv.payLink!.amount))
  // The customer opens it: a fresh Stripe page for what's owed, with Ardent's fee on it.
  const opened = await engine.openPayLink('inv_2208')
  assert.ok('url' in opened && opened.url.startsWith('https://checkout.stripe.test/'))
  const co = stripe.calls.find((c) => c.fn === 'checkout')!.args as [string, { amount: number; fee: number; tags: { invoiceId: string } }]
  assert.equal(co[0], 'acct_test_mercer', "made on the firm's own account")
  assert.equal(co[1].amount, inv.payLink!.amount)
  assert.equal(co[1].fee, ardentFee(co[1].amount))
  // Stripe says it's paid, twice; Ardent books it once.
  const paid = { type: 'paid', ref: 'pi_1', amount: co[1].amount, fee: co[1].fee, stripeFee: 120, method: 'pay_by_bank', tags: { orgId: 'org_demo', kind: 'invoice', invoiceId: 'inv_2208' }, at: new Date().toISOString() }
  say(paid)
  say(paid)
  const after = (await dan.invoices.list()).find((i) => i.id === 'inv_2208')!
  assert.equal(after.status, 'paid')
  assert.equal(after.payLink, undefined)
  assert.equal(after.payments!.at(-1)!.method, 'pay_by_bank')
  assert.equal((await dan.jobs.get('job_1039'))!.status, 'paid')
  const overview = await dan.payments.get()
  assert.equal(overview.charges.filter((c) => c.ref === 'pi_1').length, 1, 'Stripe saying it twice books it once')
  assert.ok((await dan.log.list()).some((x) => /paid .* on INV-2208 by pay by bank, paid in full/.test(x.summary)))
  // A reminder carries the link too.
  const chase = (await dan.approvals.list()).find((a) => a.kind === 'chase_invoice' && a.invoiceId === 'inv_2198')
  assert.match(chase!.preview, /Pay now by bank or card: https:\/\/app\.test\/pay\/inv_2198/)
})

test('refunds wait in Approvals; Ardent gives back its share of the fee', async () => {
  const { as, stripe } = setup()
  const dan = as('dan').client
  const charge = (await dan.payments.get()).charges.find((c) => c.invoiceId === 'inv_2206')!
  await assert.rejects(dan.payments.refund(charge.id, charge.amount + 1, 'too much'), /can still be refunded/)
  await assert.rejects(dan.payments.refund(charge.id, 100, ' '), /say why/)
  await assert.rejects(as('kofi').client.payments.refund(charge.id, 100, 'x'), { code: 'forbidden' })
  const refund = await dan.payments.refund(charge.id, 10000, 'Two fittings were not replaced')
  assert.equal(refund.status, 'waiting')
  assert.equal(stripe.calls.some((c) => c.fn === 'refund'), false, 'nothing moves without a yes')
  const ask = (await dan.approvals.list()).find((a) => a.kind === 'refund')!
  assert.match(ask.title, /Refund £100 to .* on INV-2206/)
  assert.match(ask.preview, /Ardent gives back £0.20 of its fee/)
  await as('jo').client.approvals.approve(ask.id, ask.version)
  assert.deepEqual(stripe.calls.find((c) => c.fn === 'refund')!.args, ['acct_test_mercer', { ref: charge.ref, amount: 10000 }])
  const inv = (await dan.invoices.list()).find((i) => i.id === 'inv_2206')!
  assert.equal(inv.status, 'paid', 'a refund is settled, so the customer is not chased for it')
  assert.equal(inv.paidAmount, 50400)
  assert.equal(inv.payments!.at(-1)!.amount, -10000)
  const after = (await dan.payments.get()).refunds[0]
  assert.equal(after.status, 'done')
  assert.equal(after.feeBack, 20)
  // Turned down: it stays where it was.
  const second = await dan.payments.refund(charge.id, 500, 'Goodwill')
  const ask2 = (await dan.approvals.list()).find((a) => a.refundId === second.id)!
  await dan.approvals.reject(ask2.id, 'No')
  assert.equal((await dan.payments.get()).refunds.find((r) => r.id === second.id)!.status, 'turned_down')
})

test('a deposit is asked for when a quote is accepted, and comes off the final invoice', async () => {
  const { as, say } = setup()
  const dan = as('dan').client
  await assert.rejects(as('jo').client.payments.settings({ depositPercent: 30 }), { code: 'forbidden' })
  await assert.rejects(dan.payments.settings({ depositPercent: 80 }), /0 to 50/)
  await dan.payments.settings({ depositPercent: 25, depositFrom: 100000 })
  const q = await dan.quotes.respond('quo_311', 'accepted', 'B')
  assert.equal(q.deposit?.status, 'requested')
  assert.equal(q.deposit?.amount, Math.round(1030800 * 0.25))
  assert.equal(q.deposit?.link?.url, 'https://app.test/pay/quo_311')
  say({ type: 'paid', ref: 'pi_dep', amount: q.deposit!.amount, fee: ardentFee(q.deposit!.amount), method: 'card', tags: { orgId: 'org_demo', kind: 'deposit', quoteId: 'quo_311' }, at: new Date().toISOString() })
  const inv = await dan.invoices.create('job_1051')
  assert.equal(inv.paidAmount, q.deposit!.amount)
  assert.ok(inv.payments?.[0].deposit)
  assert.equal((await dan.quotes.list()).find((x) => x.id === 'quo_311')!.deposit!.status, 'deducted')
})

test('Tap to Pay on the engineer’s phone, for their own job', async () => {
  const { as, say, stripe } = setup()
  const kofi = as('kofi').client
  await assert.rejects(kofi.payments.tap('inv_2204'), { code: 'not_found' }, 'not his job')
  const t = await kofi.payments.tap('inv_2207')
  assert.equal(t.amount, 31200)
  assert.equal(t.fee, 62)
  assert.equal(t.connectionToken, 'pst_test')
  assert.equal((stripe.calls.find((c) => c.fn === 'tap')!.args[0]), 'acct_test_mercer')
  say({ type: 'paid', ref: t.intent, amount: t.amount, fee: t.fee, method: 'tap', tags: { orgId: 'org_demo', kind: 'invoice', invoiceId: 'inv_2207' }, at: new Date().toISOString() })
  assert.equal((await kofi.invoices.forJob('job_1036'))[0].status, 'paid')
})

test('"Pay on your own phone" still works for an invoice raised with no signal', async () => {
  const { engine, as } = setup()
  const kofi = as('kofi').client
  const key = (await kofi.payments.get()).offlineKey!
  assert.ok(key)
  assert.equal((await as('dan').client.payments.get()).offlineKey, (await as('dan').client.payments.get()).offlineKey)
  const offline = { offlineId: 'local_inv_1', orgId: 'org_demo', jobId: 'job_1045', operatorId: 'opr_02', vatRate: 2000, lines: [['RCBO board', 1, 26800, 'material'], ['Swap board', 4, 5000, 'labour']] as [string, number, number, 'material' | 'labour'][], at: new Date().toISOString() }
  const qs = new URLSearchParams(signOffline(offline, key))
  assert.ok(readOffline(qs.get('o')!, qs.get('s')!, key))
  // Tampered: the customer gets a polite message, nothing is raised.
  const bad = await engine.openPayLink('local_inv_1', { o: qs.get('o')!, s: 'f'.repeat(64) })
  assert.ok('message' in bad)
  assert.equal(engine.data.invoices.some((i) => i.offlineId === 'local_inv_1'), false)
  // Genuine: the invoice is raised from the code and the customer goes to Stripe.
  const good = await engine.openPayLink('local_inv_1', { o: qs.get('o')!, s: qs.get('s')! })
  assert.ok('url' in good)
  const raised = engine.data.invoices.find((i) => i.offlineId === 'local_inv_1')!
  assert.equal(raised.status, 'sent')
  // When the phone syncs, its invoice is the same one.
  const synced = await kofi.invoices.create('job_1045', { vatRate: 2000, offlineId: 'local_inv_1' })
  assert.equal(synced.id, raised.id)
})

test('a dispute alerts the owner with the evidence gathered from the job', async () => {
  const { as, say, stripe } = setup()
  const dan = as('dan').client
  const charge = (await dan.payments.get()).charges.find((c) => c.invoiceId === 'inv_2204')!
  say({ type: 'dispute', ref: charge.ref, disputeRef: 'dp_1', amount: charge.amount, reason: "Customer says the work wasn't done", replyBy: new Date(Date.now() + 7 * 86_400_000).toISOString(), status: 'needs_reply' })
  const [d] = await dan.disputes.list()
  assert.equal(d.status, 'needs_reply')
  assert.ok((await dan.attention.list()).some((x) => x.rule === 'Card dispute'))
  const pack = await dan.disputes.get(d.id)
  assert.equal(pack.invoice?.ref, 'INV-2204')
  assert.match(pack.summary, /Paid £198 by card/)
  await assert.rejects(as('jo').client.disputes.send(d.id), { code: 'forbidden' })
  const sent = await dan.disputes.send(d.id, 'The customer rang to say thanks on the day.')
  assert.equal(sent.status, 'sent')
  const ev = stripe.calls.find((c) => c.fn === 'disputeEvidence')!.args[1] as { ref: string; text: string }
  assert.equal(ev.ref, 'dp_1')
  assert.match(ev.text, /rang to say thanks/)
  say({ type: 'dispute', ref: charge.ref, disputeRef: 'dp_1', amount: charge.amount, reason: 'x', replyBy: d.replyBy, status: 'won' })
  assert.equal((await dan.disputes.list())[0].status, 'won')
})

test('service plans by Direct Debit: servicing only, signed online, collected monthly, service booked', async () => {
  const { engine, as, say } = setup()
  const dan = as('dan').client
  await assert.rejects(dan.plans.create({ customerId: 'cus_02', name: 'Boiler breakdown cover', monthly: 1500, includes: ['Yearly service'] }), /count as insurance/)
  await assert.rejects(dan.plans.create({ customerId: 'cus_02', name: 'Care', monthly: 1500, includes: ['Free repairs'] }), /count as insurance/)
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const plan = await dan.plans.create({ customerId: 'cus_02', name: 'Boiler care', monthly: 1500, includes: ['Yearly boiler service', '10% off repairs'], firstService: soon })
  assert.equal(plan.status, 'awaiting_signature')
  assert.ok(plan.signLink?.startsWith('https://checkout.stripe.test/dd/'))
  say({ type: 'plan_signed', planId: plan.id, orgId: 'org_demo', ref: 'sub_1' })
  say({ type: 'paid', ref: 'in_1', amount: 1500, fee: 3, method: 'direct_debit', tags: { orgId: 'org_demo', kind: 'plan', planId: plan.id }, at: new Date().toISOString() })
  let row = (await dan.plans.list()).find((p) => p.id === plan.id)!
  assert.equal(row.status, 'active')
  assert.equal(row.collected, 1500)
  // Due within 4 weeks, so Ardent books it.
  assert.ok(row.serviceJobId)
  assert.equal(engine.data.jobs.find((j) => j.id === row.serviceJobId)!.status, 'enquiry')
  assert.ok(row.nextService > soon)
  say({ type: 'plan_failed', planId: plan.id, orgId: 'org_demo', reason: 'not enough in the account' })
  row = (await dan.plans.list()).find((p) => p.id === plan.id)!
  assert.equal(row.status, 'payment_failed')
  assert.ok((await dan.attention.list()).some((x) => x.rule === 'Direct Debit failed'))
  assert.equal((await dan.plans.cancel(plan.id)).status, 'cancelled')
})

test('payouts on their way, and the Stripe clearing account for Xero', async () => {
  const { as } = setup()
  const dan = as('dan').client
  const payouts = await dan.payouts.list()
  assert.ok(payouts.length > 0)
  assert.ok(payouts.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day)))
  const charges = (await dan.payments.get()).charges
  const month = charges[0].at.slice(0, 7)
  const l = await dan.ledger.get({ month })
  assert.ok(l.lines.some((x) => x.kind === 'payment') && l.lines.some((x) => x.kind === 'stripe_fee') && l.lines.some((x) => x.kind === 'ardent_fee'))
  assert.equal(l.balance, l.lines.reduce((t, x) => t + x.amount, 0))
  assert.match(l.csv, /^\*Date,\*Amount,Payee,Description,Reference\n/)
  await assert.rejects(as('kofi').client.ledger.get(), { code: 'forbidden' })
})

test('HQ sees money through Ardent, its fee, stuck sign-ups and problems', async () => {
  const { engine } = setup()
  const month = engine.data.charges.map((c) => c.at.slice(0, 7)).sort().at(-1)!
  const p = await engine.hq('usr_edem').payments(month)
  assert.ok(p.totals.volume > 0 && p.totals.fee > 0)
  assert.equal(p.totals.fee, engine.data.charges.filter((c) => c.at.startsWith(month)).reduce((t, c) => t + c.fee, 0))
  const by = Object.fromEntries(p.firms.map((f) => [f.firmId, f]))
  assert.equal(by.org_ashby.status, 'needs_info')
  assert.match(by.org_ashby.stuck!, /director's ID/)
  assert.equal(by.org_calder.status, 'not_started')
  assert.ok(p.problems.some((x) => x.kind === 'dispute' && x.firmId === 'org_hollins'))
  assert.ok(p.problems.some((x) => x.kind === 'dd_failed'))
  assert.ok(p.forecast.subscriptions > 0)
  assert.equal(p.forecast.total, p.forecast.payments + p.forecast.subscriptions)
  await assert.rejects(engine.hq('usr_dan').payments(), { code: 'forbidden' })
})

test('the demo stands in for Stripe: sign-up, pay page, tap, dispute and plans', async () => {
  const m = new Map<string, string>()
  const storage: KeyValue = { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) }
  const c = await connectDemo(storage, { today: '2026-10-21' })
  await c.signIn('dan@demo.ardent.local', 'ardent-demo')
  const dan = c.client
  const inv = await dan.invoices.send('inv_2208', 'email')
  assert.equal(inv.payLink?.url, '#/pay/inv_2208')
  const { chargeId } = await dan.payments.simulate({ kind: 'paid', invoiceId: 'inv_2208', method: 'card' })
  assert.equal((await dan.invoices.list()).find((i) => i.id === 'inv_2208')!.status, 'paid')
  await dan.payments.simulate({ kind: 'dispute', chargeId: chargeId! })
  assert.equal((await dan.disputes.list())[0].status, 'needs_reply')
  const t = await dan.payments.tap('inv_2207')
  assert.equal(t.demo, true)
  await dan.payments.simulate({ kind: 'tapped', intent: t.intent })
  assert.equal((await dan.invoices.list()).find((i) => i.id === 'inv_2207')!.status, 'paid')
  await dan.payments.simulate({ kind: 'plan_signed', planId: 'pln_102' })
  assert.equal((await dan.plans.list()).find((p) => p.id === 'pln_102')!.status, 'active')
  // The real engine never lets anyone pretend to be Stripe.
  const { as } = setup()
  await assert.rejects(as('dan').client.payments.simulate({ kind: 'signed_up' }), { code: 'forbidden' })
  const hq = await connectHqDemo(storage, { today: '2026-10-21' })
  await hq.signIn('edem@ardent.local', 'ardent-demo')
  assert.ok((await hq.hq.payments()).firms.length === 4)
})

test('Stripe on a server: signed webhooks only, and pay links go on to Stripe', async (t) => {
  const secret = 'whsec_test'
  const body = JSON.stringify({ id: 'evt_x', type: 'payment_intent.succeeded', account: 'acct_test_mercer', data: { object: { id: 'pi_srv', amount: 31200, amount_received: 31200, application_fee_amount: 62, payment_method_types: ['card_present'], created: 1760000000, metadata: { orgId: 'org_demo', kind: 'invoice', invoiceId: 'inv_2207' } } } })
  const ts = Math.floor(Date.now() / 1000)
  const header = `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`
  assert.equal(verifySignature(body, header, secret), true)
  assert.equal(verifySignature(body.replace('31200', '1'), header, secret), false)
  assert.equal(verifySignature(body, header, secret, Date.now() + 10 * 60_000), false, 'too old')

  const asked: { url: string; init: RequestInit }[] = []
  const fakeFetch = (async (url: string, init: RequestInit) => {
    asked.push({ url, init })
    if (url.includes('/payment_intents/pi_srv')) return new Response(JSON.stringify({ id: 'pi_srv', latest_charge: { id: 'ch', balance_transaction: { fee_details: [{ type: 'stripe_fee', amount: 54 }, { type: 'application_fee', amount: 62 }] } } }))
    if (url.endsWith('/checkout/sessions')) return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }))
    return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 })
  }) as typeof fetch
  const provider = stripeProvider({ secretKey: 'sk_test_123', webhookSecret: secret, publicUrl: 'https://app.test', fetch: fakeFetch })
  assert.equal(provider.test, true)
  const engine = createEngine(memoryStore(freshDemoData()), { ...nodePlatform, payments: provider })
  const server = createServer(engine, { filesDir: '/nonexistent' })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const forged = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', body, headers: { 'stripe-signature': 't=1,v1=00' } })
  assert.equal(forged.status, 400)
  const ok = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', body, headers: { 'stripe-signature': header } })
  assert.equal(ok.status, 200)
  const charge = engine.data.charges.find((c) => c.ref === 'pi_srv')!
  assert.equal(charge.method, 'tap')
  assert.equal(charge.stripeFee, 54, "Stripe's real fee, from its balance transaction")
  assert.equal(engine.data.invoices.find((i) => i.id === 'inv_2207')!.status, 'paid')

  const go = await fetch(`${base}/pay/inv_2198`, { redirect: 'manual' })
  assert.equal(go.status, 303)
  assert.equal(go.headers.get('location'), 'https://checkout.stripe.com/c/cs_1')
  const sent = asked.find((a) => a.url.endsWith('/checkout/sessions'))!
  assert.equal((sent.init.headers as Record<string, string>)['stripe-account'], 'acct_test_mercer')
  const form = new URLSearchParams(String(sent.init.body))
  assert.equal(form.get('payment_method_types[0]'), 'pay_by_bank', 'pay by bank first')
  assert.equal(form.get('payment_intent_data[application_fee_amount]'), String(ardentFee(Number(form.get('line_items[0][price_data][unit_amount]')))))
  const gone = await fetch(`${base}/pay/inv_nothing`)
  assert.match(await gone.text(), /could not find this invoice/)
})
