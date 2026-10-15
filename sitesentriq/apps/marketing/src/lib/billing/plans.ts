// Stripe billing plans — canonical metadata used by:
//   - marketing pricing page (display)
//   - in-app billing settings (current plan, upgrade/downgrade copy)
//   - stripe-checkout edge function (looks up the env var named in
//     `stripeProductEnvKey` to find the live Stripe price ID)
//
// Plans live here (not in the DB) so we can ship copy changes via
// a deploy without a migration. Stripe price IDs live in env vars
// so we never leak them into the bundle.

export type PlanId = 'starter' | 'growth' | 'enterprise'

export interface BillingPlan {
  id: PlanId
  name: string
  /** Short tagline shown beneath the plan name. */
  tagline: string
  /** Per-seat monthly price in GBP. `null` for Enterprise (sales-led). */
  pricePerSeat: number | null
  /** Currency code shown in the UI. Stripe price object owns the truth. */
  currency: 'GBP'
  /** Lowest seat count selectable in the UI. Enterprise has no slider. */
  minSeats: number
  /** Highest seat count selectable in the UI. Enterprise has no slider. */
  maxSeats: number
  /** Approx. property limit — surfaced on the card. Enforcement is roadmap. */
  propertyLimit: number | null
  /** Bullet-list features shown on the card. */
  features: string[]
  /** "Most popular" highlight — only one plan should set this. */
  popular?: boolean
  /**
   * Name of the env var that holds the Stripe Price ID for this plan.
   * Read server-side only (Supabase Edge Function secrets), NEVER from
   * the client bundle. Enterprise has no Stripe price → `null`.
   */
  stripeProductEnvKey: string | null
  /**
   * What the primary CTA does on the marketing page.
   *  - 'checkout' → POST /functions/v1/stripe-checkout (or redirect to /register)
   *  - 'contact' → /contact?type=enterprise
   */
  ctaKind: 'checkout' | 'contact'
  /** Label for the primary CTA button on the marketing card. */
  ctaLabel: string
}

export const PLANS: Record<PlanId, BillingPlan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'Everything a small FM team needs to digitise compliance.',
    pricePerSeat: 49,
    currency: 'GBP',
    minSeats: 1,
    maxSeats: 50,
    propertyLimit: 25,
    features: [
      'Up to 25 properties',
      'Compliance tracking & reminders',
      'Job & visit management',
      'Mobile field mode',
      'Client portal (read-only)',
      'Email support',
    ],
    stripeProductEnvKey: 'STRIPE_PRICE_STARTER',
    ctaKind: 'checkout',
    ctaLabel: 'Start 14-day trial',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'For teams scaling beyond 25 sites who need insights & integrations.',
    pricePerSeat: 99,
    currency: 'GBP',
    minSeats: 1,
    maxSeats: 50,
    propertyLimit: 250,
    popular: true,
    features: [
      'Up to 250 properties',
      'Everything in Starter',
      'Insights & operational signals',
      'Integrations (API + webhooks)',
      'Audit log',
      'Priority support',
      'Quote-to-invoice automation',
      'Custom reports & exports',
    ],
    stripeProductEnvKey: 'STRIPE_PRICE_GROWTH',
    ctaKind: 'checkout',
    ctaLabel: 'Start 14-day trial',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Multi-org portfolios, SSO, custom SLA.',
    pricePerSeat: null,
    currency: 'GBP',
    minSeats: 1,
    maxSeats: 1,
    propertyLimit: null,
    features: [
      'Unlimited properties',
      'Everything in Growth',
      'SSO & SAML',
      'Multi-org portfolios',
      'Dedicated success manager',
      'Custom SLA & uptime guarantees',
      'On-prem / private cloud (on request)',
      'Procurement support (DPA, SOC2, vendor forms)',
    ],
    stripeProductEnvKey: null,
    ctaKind: 'contact',
    ctaLabel: 'Talk to sales',
  },
}

/** Stable ordered list for rendering. */
export const PLAN_ORDER: PlanId[] = ['starter', 'growth', 'enterprise']

export function getPlan(id: string | null | undefined): BillingPlan {
  if (id && (PLANS as Record<string, BillingPlan>)[id]) return PLANS[id as PlanId]
  return PLANS.starter
}

/** Returns monthly total for a given plan + seat count, in pence. */
export function priceForSeats(planId: PlanId, seats: number): number | null {
  const p = PLANS[planId]
  if (p.pricePerSeat == null) return null
  const clamped = Math.max(p.minSeats, Math.min(p.maxSeats, seats))
  return p.pricePerSeat * clamped
}

/** UI helper — formats a per-seat plan total as "£X / month". */
export function formatPlanTotal(planId: PlanId, seats: number): string {
  const total = priceForSeats(planId, seats)
  if (total == null) return 'Custom pricing'
  return `£${total.toLocaleString('en-GB')}/month`
}
