/**
 * Stripe for the engine on a server, talking to Stripe's REST API with
 * fetch. Only used when the engine has Ardent's keys (STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET); a test key (sk_test_...) keeps everything in
 * Stripe's test mode.
 *
 * How Ardent uses Stripe Connect: each firm's account is created with Stripe
 * billing the firm for its fees and carrying the losses, Stripe collecting
 * the sign-up details, and the full Stripe dashboard for the firm. Every
 * payment is made on the firm's account (Stripe-Account header) with
 * Ardent's fee as the application fee, so the firm's money never sits with
 * Ardent.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AccountState, PaymentEvent, PaymentProvider, PaymentTags } from './platform.ts'

const API = 'https://api.stripe.com/v1'
/** Stripe's webhook signatures are good for this long. */
const TOLERANCE_S = 300

type Params = Record<string, string | number | boolean | undefined>

/** Stripe's form encoding, with nested keys already written as a[b][c]. */
const form = (p: Params) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')

const tagParams = (prefix: string, tags: PaymentTags): Params => Object.fromEntries(Object.entries(tags).filter(([, v]) => v).map(([k, v]) => [`${prefix}[${k}]`, v]))

type StripeObject = Record<string, unknown> & { id: string }

/** Check Stripe's signature header (t=...,v1=...) on the raw body. */
export function verifySignature(raw: string, header: string, secret: string, now = Date.now()) {
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=') as [string, string]))
  const t = Number(parts.t)
  const given = header.split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3))
  if (!t || !given.length || Math.abs(now / 1000 - t) > TOLERANCE_S) return false
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'))
  return given.some((g) => g.length === want.length && timingSafeEqual(Buffer.from(g), want))
}

const methodOf = (types: string[] | undefined): Extract<PaymentEvent, { type: 'paid' }>['method'] => {
  const t = types?.[0]
  if (t === 'card_present' || t === 'interac_present') return 'tap'
  if (t === 'pay_by_bank') return 'pay_by_bank'
  if (t === 'bacs_debit') return 'direct_debit'
  return 'card'
}

const DISPUTE_REASON: Record<string, string> = {
  fraudulent: "Customer says they didn't make the payment",
  product_not_received: "Customer says the work wasn't done",
  product_unacceptable: 'Customer says the work was not as agreed',
  duplicate: 'Customer says they were charged twice',
  subscription_canceled: 'Customer says they cancelled',
  credit_not_processed: 'Customer says a refund was promised',
  unrecognized: "Customer doesn't recognise the payment",
}

export function stripeProvider(opts: { secretKey: string; webhookSecret: string; publicUrl: string; fetch?: typeof fetch }): PaymentProvider {
  const doFetch = opts.fetch ?? fetch
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, params: Params = {}, account?: string): Promise<StripeObject> => {
    const body = form(params)
    const res = await doFetch(`${API}${path}${method === 'GET' && body ? `?${body}` : ''}`, {
      method,
      headers: {
        authorization: `Bearer ${opts.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        ...(account ? { 'stripe-account': account } : {}),
      },
      ...(method === 'POST' ? { body } : {}),
    })
    const json = (await res.json()) as StripeObject & { error?: { message?: string } }
    if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`)
    return json
  }

  const state = (a: StripeObject): AccountState => {
    const req = (a.requirements ?? {}) as { currently_due?: string[]; past_due?: string[]; disabled_reason?: string | null }
    return {
      chargesEnabled: !!a.charges_enabled,
      payoutsEnabled: !!a.payouts_enabled,
      detailsSubmitted: !!a.details_submitted,
      due: [...(req.past_due ?? []), ...(req.currently_due ?? [])],
      ...(req.disabled_reason ? { disabledReason: req.disabled_reason } : {}),
    }
  }

  /** Stripe's own fee on a payment, from its balance transaction. */
  const stripeFee = async (account: string, intentId: string) => {
    try {
      const pi = await call('GET', `/payment_intents/${intentId}`, { 'expand[]': 'latest_charge.balance_transaction' }, account)
      const bt = ((pi.latest_charge as StripeObject | undefined)?.balance_transaction ?? {}) as { fee_details?: { type: string; amount: number }[] }
      return bt.fee_details?.filter((f) => f.type === 'stripe_fee').reduce((t, f) => t + f.amount, 0)
    } catch {
      return undefined
    }
  }

  return {
    test: opts.secretKey.startsWith('sk_test_') || opts.secretKey.startsWith('rk_test_'),
    publicUrl: opts.publicUrl,
    async createAccount(firm) {
      const a = await call('POST', '/accounts', {
        country: 'GB',
        email: firm.email,
        'business_profile[name]': firm.name,
        'controller[fees][payer]': 'account',
        'controller[losses][payments]': 'stripe',
        'controller[requirement_collection]': 'stripe',
        'controller[stripe_dashboard][type]': 'full',
        'metadata[orgId]': firm.orgId,
      })
      return { accountId: a.id }
    },
    async onboardingLink(accountId, returnUrl, refreshUrl) {
      const l = await call('POST', '/account_links', { account: accountId, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl })
      return { url: String(l.url) }
    },
    async account(accountId) {
      return state(await call('GET', `/accounts/${accountId}`))
    },
    async checkout(accountId, p) {
      const s = await call(
        'POST',
        '/checkout/sessions',
        {
          mode: 'payment',
          // Pay by bank costs the firm least, so it comes first.
          'payment_method_types[0]': 'pay_by_bank',
          'payment_method_types[1]': 'card',
          'line_items[0][quantity]': 1,
          'line_items[0][price_data][currency]': 'gbp',
          'line_items[0][price_data][unit_amount]': p.amount,
          'line_items[0][price_data][product_data][name]': p.description,
          'payment_intent_data[application_fee_amount]': p.fee,
          ...tagParams('payment_intent_data[metadata]', p.tags),
          ...tagParams('metadata', p.tags),
          customer_email: p.email,
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
        },
        accountId,
      )
      return { id: s.id, url: String(s.url) }
    },
    async tap(accountId, p) {
      const pi = await call(
        'POST',
        '/payment_intents',
        { amount: p.amount, currency: 'gbp', 'payment_method_types[0]': 'card_present', capture_method: 'automatic', application_fee_amount: p.fee, description: p.description, ...tagParams('metadata', p.tags) },
        accountId,
      )
      const token = await call('POST', '/terminal/connection_tokens', {}, accountId)
      const locations = await call('GET', '/terminal/locations', { limit: 1 }, accountId)
      const locationId = ((locations.data as StripeObject[] | undefined) ?? [])[0]?.id
      return { intent: pi.id, clientSecret: String(pi.client_secret), connectionToken: String(token.secret), ...(locationId ? { locationId } : {}) }
    },
    async directDebit(accountId, p) {
      const s = await call(
        'POST',
        '/checkout/sessions',
        {
          mode: 'subscription',
          'payment_method_types[0]': 'bacs_debit',
          'line_items[0][quantity]': 1,
          'line_items[0][price_data][currency]': 'gbp',
          'line_items[0][price_data][unit_amount]': p.monthly,
          'line_items[0][price_data][recurring][interval]': 'month',
          'line_items[0][price_data][product_data][name]': p.name,
          // 0.2%; plans are at most £250 a month, so the £5 cap never bites.
          'subscription_data[application_fee_percent]': 0.2,
          ...tagParams('subscription_data[metadata]', p.tags),
          ...tagParams('metadata', p.tags),
          customer_email: p.email,
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
        },
        accountId,
      )
      return { id: s.id, url: String(s.url) }
    },
    async cancelDirectDebit(accountId, ref) {
      await call('DELETE', `/subscriptions/${ref}`, {}, accountId)
    },
    async refund(accountId, p) {
      const r = await call('POST', '/refunds', { payment_intent: p.ref, amount: p.amount, refund_application_fee: true }, accountId)
      return { id: r.id }
    },
    async disputeEvidence(accountId, p) {
      await call('POST', `/disputes/${p.ref}`, { 'evidence[uncategorized_text]': p.text.slice(0, 20000), submit: true }, accountId)
    },
    async event(raw, signature) {
      if (!verifySignature(raw, signature, opts.webhookSecret)) throw new Error('Stripe signature does not match')
      const e = JSON.parse(raw) as { id: string; type: string; account?: string; data: { object: StripeObject } }
      const o = e.data.object
      const accountId = e.account ?? ''
      const base = { id: e.id, accountId }
      const meta = (o.metadata ?? {}) as Partial<PaymentTags>
      const tags = (m: Partial<PaymentTags>): PaymentTags | undefined => (m.orgId && m.kind ? (m as PaymentTags) : undefined)
      switch (e.type) {
        case 'account.updated':
          return { ...base, accountId: o.id, type: 'account', state: state(o) }
        case 'payment_intent.succeeded': {
          const t = tags(meta)
          // Direct Debit collections arrive as invoice.paid, with the plan on the subscription.
          if (!t || t.kind === 'plan') return undefined
          return { ...base, type: 'paid', ref: o.id, amount: Number(o.amount_received ?? o.amount), fee: Number(o.application_fee_amount ?? 0), stripeFee: await stripeFee(accountId, o.id), method: methodOf(o.payment_method_types as string[]), tags: t, at: new Date(Number(o.created) * 1000).toISOString() }
        }
        case 'checkout.session.completed': {
          const t = tags(meta)
          if (!t || o.mode !== 'subscription' || !t.planId) return undefined
          return { ...base, type: 'plan_signed', planId: t.planId, orgId: t.orgId, ref: String(o.subscription) }
        }
        case 'invoice.paid':
        case 'invoice.payment_failed': {
          const details = (o.parent as { subscription_details?: { metadata?: Partial<PaymentTags> } } | undefined)?.subscription_details ?? (o.subscription_details as { metadata?: Partial<PaymentTags> } | undefined)
          const t = tags(details?.metadata ?? {})
          if (!t?.planId) return undefined
          if (e.type === 'invoice.payment_failed') return { ...base, type: 'plan_failed', planId: t.planId, orgId: t.orgId, reason: 'the Direct Debit was refused' }
          const amount = Number(o.amount_paid ?? 0)
          if (!amount) return undefined
          return { ...base, type: 'paid', ref: o.id, amount, fee: Math.round(amount * 0.002), method: 'direct_debit', tags: t, at: new Date(Number(o.created) * 1000).toISOString() }
        }
        case 'charge.refunded':
          return { ...base, type: 'refunded', ref: String(o.payment_intent), amount: Number(o.amount_refunded ?? 0) }
        case 'charge.dispute.created':
        case 'charge.dispute.updated':
        case 'charge.dispute.closed': {
          const st = String(o.status)
          const status = st === 'won' ? 'won' : st === 'lost' ? 'lost' : st === 'under_review' ? 'sent' : 'needs_reply'
          const due = (o.evidence_details as { due_by?: number } | undefined)?.due_by
          return {
            ...base,
            type: 'dispute',
            ref: String(o.payment_intent),
            disputeRef: o.id,
            amount: Number(o.amount),
            reason: DISPUTE_REASON[String(o.reason)] ?? 'Customer disputed the payment with their bank',
            replyBy: due ? new Date(due * 1000).toISOString() : new Date(Date.now() + 7 * 86_400_000).toISOString(),
            status,
          }
        }
      }
      return undefined
    },
  }
}
