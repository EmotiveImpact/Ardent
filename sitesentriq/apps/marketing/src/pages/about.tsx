import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { appUrl } from '@/lib/app-url'
import { ArrowRight, CheckCircle2, X, Sparkles, Database, Smartphone, Lock } from 'lucide-react'

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.5, ease: 'easeOut' as const },
}

const stagger = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
}

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-[#fafafa] to-white pt-32 pb-16 lg:pt-40 lg:pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-brand-500/6 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-500/6 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-4">
              Why we built this
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-bold text-gray-900 leading-[1.05] tracking-[-0.035em] mb-7">
              UK FM software is{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-brand-500 to-brand-700">stuck in 2014</span>.
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl">
              Every CAFM platform we tried felt like a desktop tool ported to a browser. Spreadsheet
              imports as the only "integration." Mobile that's a mobile-shaped page. Compliance certs
              created in Word. We thought facilities teams deserved better.
            </p>
          </motion.div>
        </div>
      </section>

      {/* The honest story */}
      <section className="py-20 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="prose prose-gray max-w-none">
            <div className="space-y-6 text-[17px] text-gray-700 leading-[1.7]">
              <p>
                Haumea started because the founder ran an FM contracting business and burned a year
                trying to find software that didn't suck. The market splits into three buckets:
              </p>
              <ul className="space-y-3 not-prose pl-0 list-none">
                <li className="flex items-start gap-3">
                  <X size={18} className="text-gray-400 mt-1.5 shrink-0" />
                  <span>Enterprise CAFM at £20k+/year, designed for procurement officers, takes 3 months to onboard.</span>
                </li>
                <li className="flex items-start gap-3">
                  <X size={18} className="text-gray-400 mt-1.5 shrink-0" />
                  <span>Generic field service tools (Jobber, ServiceM8) that don't understand UK-specific compliance like CP12 / EICR / FRA.</span>
                </li>
                <li className="flex items-start gap-3">
                  <X size={18} className="text-gray-400 mt-1.5 shrink-0" />
                  <span>Excel + WhatsApp + paper certs, which is what most small UK FM firms still use in practice.</span>
                </li>
              </ul>
              <p>
                There's a clear gap: a modern, mobile-first, AI-native platform that handles UK FM
                compliance properly, integrates with the tools your finance person already uses, and
                doesn't require a 4-figure setup fee.
              </p>
              <p className="text-gray-900 font-semibold text-[18px] pt-2">
                That's the gap Haumea fills.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* What we won't do — opinionated commitments */}
      <section className="py-20 lg:py-24 bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-3">
              What we won't do
            </p>
            <h2 className="text-3xl sm:text-[40px] font-bold text-gray-900 tracking-[-0.025em] leading-[1.1]">
              Hard commitments to our customers.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-4 lg:gap-5">
            {[
              {
                title: "We won't lock your data in.",
                body: "Every entity has full CSV/JSON export. Database schema is documented. If you ever leave Haumea, you take everything with you.",
              },
              {
                title: "We won't charge per property.",
                body: "Per-seat only. The number of buildings you manage shouldn't punish you with bigger bills. £49 or £99 per engineer using the tool.",
              },
              {
                title: "We won't pretend AI is magic.",
                body: "Where AI helps (compliance type suggestion, report drafting), we use it. Where it's a chatbot gimmick, we don't. Every prompt is audit-logged.",
              },
              {
                title: "We won't ship a 30-page contract.",
                body: "Standard MSA, monthly billing, cancel anytime. No 12-month minimum, no \"talk to sales\" for things that should be self-serve.",
              },
              {
                title: "We won't sell your data.",
                body: "GDPR-compliant by default. Your data stays in UK Supabase regions. Multi-tenant isolation enforced at row-level security in Postgres.",
              },
              {
                title: "We won't roadmap-trap you.",
                body: "Public roadmap on GitHub. If a feature you need is on the cards, you can vote. If it's not, ask — we're a small team and we move fast.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                {...stagger}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="bg-white rounded-2xl border border-gray-100 p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 shrink-0 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
                    <CheckCircle2 size={15} className="text-brand-600" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-gray-900 mb-1.5 tracking-[-0.01em]">{item.title}</h3>
                    <p className="text-[14px] text-gray-600 leading-relaxed">{item.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What we built (honest spec) */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-3">
              What we built
            </p>
            <h2 className="text-3xl sm:text-[40px] font-bold text-gray-900 tracking-[-0.025em] leading-[1.1] mb-5">
              The technical pillars.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Haumea is built on Supabase (Postgres + Auth + Storage + Edge Functions), React 19,
              and Tailwind v4. We picked technology that lets a small team move fast without
              cutting corners on the things that matter.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Database,
                title: '29 migrations',
                body: 'Every schema change is versioned and tracked. RLS policies on every table. No "trust the application" security holes.',
              },
              {
                icon: Sparkles,
                title: 'AI where it earns its keep',
                body: 'Claude Haiku 4.5 for compliance type suggestion. Cheap, fast, audit-logged. Not bolted on — designed in.',
              },
              {
                icon: Smartphone,
                title: 'Mobile-first field mode',
                body: 'PWA with offline queue. GPS check-in, signature capture, photo upload. Designed for engineers who actually go to sites.',
              },
              {
                icon: Lock,
                title: 'Enterprise-ready security',
                body: 'SSO via Microsoft Entra + Google Workspace. Audit log surfaced in-product. Per-org RLS. UK data residency.',
              },
            ].map((p, i) => (
              <motion.div
                key={p.title}
                {...stagger}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                className="p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-gray-900/5 hover:border-gray-200 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                  <p.icon size={20} className="text-brand-600" />
                </div>
                <h3 className="text-[16px] font-semibold text-gray-900 mb-2 tracking-[-0.01em]">{p.title}</h3>
                <p className="text-[13.5px] text-gray-600 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-24 bg-gradient-to-br from-gray-50 to-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl sm:text-[40px] font-bold text-gray-900 tracking-[-0.025em] leading-[1.1] mb-5">
              The category needed a re-think.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed mb-8 max-w-2xl mx-auto">
              See if it works for the way you actually run your FM business. Two weeks free, your real
              data, decide from there.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={appUrl('/register')}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/15"
              >
                Start your trial
                <ArrowRight size={16} />
              </a>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-gray-900 bg-white border border-gray-200 hover:border-gray-300 transition-all"
              >
                Talk to the team
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
