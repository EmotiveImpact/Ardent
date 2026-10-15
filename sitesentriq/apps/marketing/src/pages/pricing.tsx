import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Check, ArrowRight, HelpCircle, Sparkles, ShieldCheck } from 'lucide-react'
// Marketing pricing page is a static display surface — checkout is
// always deferred to the dashboard's /register flow, so we don't need
// the supabase client or the auth context here. The dashboard handles
// authenticated → Stripe checkout once the user lands there.
import { PLANS, PLAN_ORDER, priceForSeats, type PlanId } from '@/lib/billing/plans'
import { appUrl } from '@/lib/app-url'

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.5, ease: 'easeOut' as const },
}

const stagger = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Subscriptions are month-to-month and you can cancel at any time from the Stripe Billing Portal inside Settings → Billing. You keep access until the end of the current billing period.',
  },
  {
    q: 'What counts as a seat?',
    a: 'A seat is one named user with login access — engineer, scheduler, finance, admin, or auditor. Read-only client portal users do not count toward your seat total. You can change seat counts anytime from the Billing settings.',
  },
  {
    q: 'Can my company manage multiple organisations?',
    a: 'Yes — Enterprise customers can manage multi-org portfolios under a single contract. Starter and Growth plans are scoped to one organisation. If you need to consolidate, talk to sales.',
  },
  {
    q: 'How do you handle GDPR and data residency?',
    a: 'All data is stored in UK-hosted infrastructure (Supabase eu-west). We are a UK-registered controller, sign DPAs on request, and provide data exports and deletion on demand. ISO 27001 certification is in progress.',
  },
  {
    q: 'What is your support response time?',
    a: 'Starter: email support, response within 1 working day. Growth: priority email + chat, response within 4 working hours. Enterprise: dedicated success manager and phone support with a contracted SLA.',
  },
  {
    q: 'Can I change plans mid-month?',
    a: 'Yes. Plan upgrades take effect immediately and we prorate the difference on your next invoice. Downgrades take effect at the start of your next billing cycle so you never lose paid time.',
  },
]

// The dashboard owns checkout. The marketing app's "Start trial" CTA
// just hands off to the dashboard's /register page with the plan +
// seats preserved as query params; the dashboard then runs the
// authenticated Stripe checkout flow once the user signs up.

export default function PricingPage() {
  const navigate = useNavigate()
  const [seats, setSeats] = useState(3)
  const [busyPlan] = useState<PlanId | null>(null)

  const startCheckout = (planId: PlanId) => {
    if (planId === 'enterprise') {
      navigate('/contact?type=enterprise')
      return
    }
    // Always cross-origin into the dashboard — the marketing site has no
    // /register route, so a same-origin navigation would land on a blank
    // SPA fallback.
    window.location.href = appUrl(`/register?plan=${planId}&seats=${seats}`)
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-[#fafafa] to-white pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-500/6 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-wider mb-4">
              Pricing
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.08] tracking-[-0.03em] mb-6">
              Simple, per-seat pricing
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
              No hidden fees. No surprises. Choose the plan that fits your team and scale as you grow.
            </p>

            {/* Trust strip */}
            <div className="inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-brand-500" />
                GDPR
              </span>
              <span className="text-gray-300">·</span>
              <span>UK-hosted</span>
              <span className="text-gray-300">·</span>
              <span>ISO 27001 in progress</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="relative -mt-8 z-10 pb-20 lg:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {PLAN_ORDER.map((id, i) => {
              const tier = PLANS[id]
              const isPopular = !!tier.popular
              const total = priceForSeats(id, seats)
              const showSlider = id !== 'enterprise'
              const isBusy = busyPlan === id

              return (
                <motion.div
                  key={tier.id}
                  {...stagger}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className={`relative rounded-2xl p-8 ${
                    isPopular
                      ? 'bg-surface-card border-2 border-brand-500 shadow-2xl shadow-brand-500/10 scale-[1.02]'
                      : 'bg-surface-card border border-border-default shadow-lg'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-brand-500 text-white text-[12px] font-semibold">
                      Most popular
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-[19px] font-bold text-text-primary">{tier.name}</h3>
                    <p className="text-[14px] text-text-muted mt-1">{tier.tagline}</p>
                  </div>

                  <div className="mb-6 min-h-[68px]">
                    {tier.pricePerSeat != null ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-text-primary">£{tier.pricePerSeat}</span>
                          <span className="text-[14px] text-text-muted">/seat/month</span>
                        </div>
                        {total != null && (
                          <p className="text-[12px] text-text-muted mt-1">
                            {seats} seat{seats === 1 ? '' : 's'} ·{' '}
                            <span className="text-text-secondary font-medium">£{total.toLocaleString('en-GB')}</span>{' '}
                            /month
                          </p>
                        )}
                      </>
                    ) : (
                      <div>
                        <span className="text-3xl font-bold text-text-primary">Contact us</span>
                        <p className="text-[12px] text-text-muted mt-1">Custom pricing for portfolios &amp; SSO.</p>
                      </div>
                    )}
                  </div>

                  {/* Seat slider */}
                  {showSlider && (
                    <div className="mb-6">
                      <label className="flex items-center justify-between text-[12px] text-text-muted mb-1.5">
                        <span>Seats</span>
                        <span className="font-medium text-text-secondary">{seats}</span>
                      </label>
                      <input
                        type="range"
                        min={tier.minSeats}
                        max={tier.maxSeats}
                        value={seats}
                        onChange={(e) => setSeats(Number(e.target.value))}
                        aria-label={`Number of seats for ${tier.name}`}
                        className="w-full h-1.5 rounded-full appearance-none bg-surface-elevated accent-brand-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-text-muted mt-1">
                        <span>{tier.minSeats}</span>
                        <span>{tier.maxSeats}</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => startCheckout(id)}
                    disabled={isBusy}
                    className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                      isPopular
                        ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25'
                        : id === 'enterprise'
                        ? 'bg-surface-elevated text-text-primary hover:bg-surface-elevated/70 border border-border-default'
                        : 'bg-text-primary text-surface-card hover:opacity-90'
                    }`}
                  >
                    {isBusy ? 'Redirecting…' : tier.ctaLabel}
                    <ArrowRight size={15} />
                  </button>

                  <div className="mt-8 pt-8 border-t border-border-subtle">
                    <p className="text-[12px] font-semibold text-text-primary uppercase tracking-wider mb-4">
                      What&apos;s included
                    </p>
                    <ul className="space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check size={16} className="text-brand-500 flex-shrink-0 mt-0.5" />
                          <span className="text-[14px] text-text-secondary">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Cross-plan trial reminder */}
          <motion.div {...fadeUp} className="mt-10 text-center">
            <p className="inline-flex items-center gap-2 text-[13px] text-text-muted">
              <Sparkles size={14} className="text-brand-500" />
              Every plan starts with a <strong className="text-text-secondary">14-day free trial</strong> — no card required to start.
            </p>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 lg:py-32 bg-surface-page">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="text-center mb-12">
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-wider mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-[-0.02em]">
              Frequently asked questions
            </h2>
          </motion.div>

          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <motion.div
                key={faq.q}
                {...stagger}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="bg-surface-card rounded-xl border border-border-subtle p-6"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle size={18} className="text-brand-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-[15px] font-semibold text-text-primary mb-2">{faq.q}</h3>
                    <p className="text-[14px] text-text-secondary leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <p className="text-[13px] text-text-muted">
              Still have questions?{' '}
              <Link to="/contact" className="text-brand-500 font-medium hover:text-brand-400 transition-colors">
                Talk to our team →
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
