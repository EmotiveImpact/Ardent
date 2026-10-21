/**
 * The few things the engine needs from where it runs: password hashing,
 * session tokens and link signing. The engine itself imports nothing from
 * Node, so the same records and rules can also run inside a browser for the
 * published demos (see kit/demo in the apps).
 */
export interface Platform {
  hashPassword(password: string): string
  verifyPassword(password: string, stored: string | undefined): boolean
  newToken(): string
  hashToken(token: string): string
  /** HMAC-SHA256, base64url. */
  sign(secret: string, text: string): string
  /** Constant-time string comparison. */
  same(a: string, b: string): boolean
  randomSecret(): string
  /**
   * Minutes by road from each start to one place, with live traffic. Only
   * there when the firm's engine has a TomTom key; otherwise distances are
   * shown as the crow flies. An undefined entry means that route failed.
   */
  driveMinutes?(from: { lat: number; lng: number }[], to: { lat: number; lng: number }): Promise<(number | undefined)[]>
  /**
   * Stripe, when the engine has Ardent's Stripe keys (test or live). Without
   * it the firm's payments screens say payments aren't switched on yet.
   */
  payments?: PaymentProvider
}

/** What Stripe says about a firm's account. */
export interface AccountState {
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  /** What Stripe still needs, in Stripe's words (e.g. "individual.verification.document"). */
  due: string[]
  /** Why Stripe has paused the account, when it has. */
  disabledReason?: string
}

/** What a payment carries, so the engine can find its record when Stripe says it's paid. */
export interface PaymentTags {
  orgId: string
  kind: 'invoice' | 'deposit' | 'plan'
  invoiceId?: string
  quoteId?: string
  planId?: string
}

/**
 * Stripe Connect, the way Ardent uses it: each firm has its own account that
 * Stripe bills directly, payments are made on the firm's account ("direct
 * charges") and Ardent's fee rides on each one as an application fee. So the
 * firm's money is never Ardent's to hold.
 */
export interface PaymentProvider {
  /** Test mode keys: nothing real moves. */
  test: boolean
  /** The in-page demo: no Stripe at all, the demo's own pages stand in for it. */
  demo?: boolean
  /** Where customers open pay links, e.g. https://app.ardentcompute.com (the engine serves /pay/<id>). */
  publicUrl?: string
  createAccount(firm: { name: string; email?: string; orgId: string }): Promise<{ accountId: string }>
  /** Stripe's own sign-up page for the firm. */
  onboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }>
  account(accountId: string): Promise<AccountState>
  /** A hosted checkout page for one payment, pay by bank first. */
  checkout(accountId: string, p: { amount: number; fee: number; description: string; email?: string; tags: PaymentTags; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>
  /** A payment for the phone to take with Tap to Pay. */
  tap(accountId: string, p: { amount: number; fee: number; description: string; tags: PaymentTags }): Promise<{ intent: string; clientSecret: string; connectionToken: string; locationId?: string }>
  /** A monthly Bacs Direct Debit the customer signs up to online. */
  directDebit(accountId: string, p: { monthly: number; name: string; email?: string; tags: PaymentTags; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>
  cancelDirectDebit(accountId: string, ref: string): Promise<void>
  /** Give money back; Ardent's fee goes back in proportion. */
  refund(accountId: string, p: { ref: string; amount: number }): Promise<{ id: string }>
  /** Send the evidence for a dispute. */
  disputeEvidence(accountId: string, p: { ref: string; text: string }): Promise<void>
  /** Read and check a webhook from Stripe. Undefined when it's not one Ardent acts on. */
  event(raw: string, signature: string): Promise<PaymentEvent | undefined>
}

/** What Stripe tells the engine, boiled down to what the engine acts on. */
export type PaymentEvent = { id: string; accountId: string } & (
  | { type: 'account'; state: AccountState }
  | { type: 'paid'; ref: string; amount: number; fee: number; stripeFee?: number; method: 'card' | 'tap' | 'pay_by_bank' | 'direct_debit'; tags: PaymentTags; at: string }
  | { type: 'plan_signed'; planId: string; orgId: string; ref: string }
  | { type: 'plan_failed'; planId: string; orgId: string; reason?: string }
  | { type: 'refunded'; ref: string; amount: number }
  | { type: 'dispute'; ref: string; disputeRef: string; amount: number; reason: string; replyBy: string; status: 'needs_reply' | 'sent' | 'won' | 'lost' }
)
