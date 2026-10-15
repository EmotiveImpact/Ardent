import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { appUrl } from '@/lib/app-url'
import {
  ShieldCheck,
  Wrench,
  Calendar,
  BarChart3,
  Users,
  FileText,
  Receipt,
  Building2,
  Briefcase,
  AlertTriangle,
  HardHat,
  Bell,
  ArrowRight,
  Sparkles,
  Award,
  Smartphone,
  Plug,
  Activity,
  Boxes,
  type LucideIcon,
} from 'lucide-react'

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

type Feature = { icon: LucideIcon; title: string; body: string; tag?: string }
type Group = { id: string; title: string; subtitle: string; features: Feature[] }

const GROUPS: Group[] = [
  {
    id: 'compliance',
    title: 'Compliance + maintenance',
    subtitle: 'The reason FM software exists. Done properly.',
    features: [
      {
        icon: ShieldCheck,
        title: 'Compliance tracking',
        body: 'CP12, EICR, FRA, legionella, asbestos surveys, fire alarm, emergency lighting, lift LOLER. UK-specific types out of the box.',
        tag: 'UK-specific',
      },
      {
        icon: Sparkles,
        title: 'AI compliance suggester',
        body: 'Add an asset → Claude Haiku suggests type, frequency, regulatory body in 4 seconds. Audit-logged.',
        tag: 'AI',
      },
      {
        icon: Wrench,
        title: 'Auto-generated PPM',
        body: 'Set the frequency once. Renewal jobs spawn at 30 / 14 / 3 days, drop into the right engineer\'s feed.',
        tag: 'Automated',
      },
      {
        icon: Award,
        title: 'Auto compliance certificates',
        body: 'PPM job complete → branded PDF lands in property folder, emails the client, locks compliance for 12 mo.',
        tag: 'Branded',
      },
    ],
  },
  {
    id: 'workflow',
    title: 'Job + workforce',
    subtitle: 'How work actually gets to engineers and back.',
    features: [
      {
        icon: Calendar,
        title: 'Visual scheduler',
        body: 'Drag-drop calendar with engineer availability + time windows. Conflict detection across overlapping jobs.',
      },
      {
        icon: Briefcase,
        title: 'Auto-assignment rules',
        body: 'Score by skill × distance × availability × familiarity. Suggest top 5, apply best, override anytime.',
        tag: 'Rule engine',
      },
      {
        icon: HardHat,
        title: 'Engineer + subcontractor',
        body: 'Skills, accreditations (Gas Safe / NICEIC / F-Gas), home location, weekly capacity, document expiry.',
      },
      {
        icon: Smartphone,
        title: 'Field engineer mode',
        body: 'Mobile-first job view. GPS check-in, signature capture, photo upload. Offline queue when there\'s no signal.',
        tag: 'Offline-first',
      },
      {
        icon: AlertTriangle,
        title: 'Defects + actions',
        body: 'Log defects on-site, assign priority, link back to compliance item, optionally auto-quote remediation.',
      },
      {
        icon: Activity,
        title: 'SLA tracking',
        body: 'Per-priority response + completion targets. Live countdown chips, breach alerts, business-hours-only support.',
        tag: 'New',
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance + reporting',
    subtitle: 'The bits that turn work into invoiced revenue.',
    features: [
      {
        icon: Receipt,
        title: 'Quotes + invoices',
        body: 'Generate quotes from job data. Convert approved quote → job. PDF invoices. Per-job costs, margin tracking.',
      },
      {
        icon: BarChart3,
        title: 'Custom report builder',
        body: 'Drag-drop builder over 8 datasets. Save org-wide templates. Schedule weekly to email/CSV.',
        tag: 'Drag-drop',
      },
      {
        icon: FileText,
        title: 'Insights dashboards',
        body: 'Compliance rates, SLA performance, engineer utilisation, revenue trends. Plan-gated for Growth+.',
      },
      {
        icon: Boxes,
        title: 'Stock + parts tracking',
        body: 'Stock items with min/max thresholds. Parts-used-on-job auto-deducts on complete. Low-stock alerts.',
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations + identity',
    subtitle: 'Plays with everything your team already uses.',
    features: [
      {
        icon: Plug,
        title: 'Accounting push',
        body: 'Xero + QuickBooks. One-click invoice push on send. Bidirectional ID mapping. Paid status sync.',
        tag: 'OAuth',
      },
      {
        icon: Bell,
        title: 'Slack notifications',
        body: 'Block-Kit posts on every notification type. Per-channel routing rules. Severity threshold per type.',
      },
      {
        icon: Calendar,
        title: 'Calendar sync',
        body: 'iCal feed per engineer (Apple/Outlook). Google Calendar 2-way push via OAuth refresh-token.',
      },
      {
        icon: Users,
        title: 'SSO',
        body: 'Microsoft Entra + Google Workspace via Supabase OAuth. Org-domain auto-provision rule. Growth+ gated.',
      },
      {
        icon: Building2,
        title: 'Client portal',
        body: 'Read-only self-service for clients. Compliance status, visit history, documents, quote approvals.',
      },
    ],
  },
]

export default function FeaturesPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-[#fafafa] to-white pt-32 pb-16 lg:pt-40 lg:pb-20 overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/6 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-4">
              Every feature
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-bold text-gray-900 leading-[1.05] tracking-[-0.035em] mb-6">
              Everything we shipped. Honest list.
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
              No "coming soon" carrots, no roadmap-only features. If it's listed below, it's
              built and you can use it on your trial.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Group nav */}
      <section className="sticky top-16 lg:top-20 z-40 bg-white/95 backdrop-blur-md border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto py-3 -mx-4 px-4 sm:mx-0 sm:px-0">
            {GROUPS.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="shrink-0 px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                {g.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Groups */}
      {GROUPS.map((group, gi) => (
        <section
          key={group.id}
          id={group.id}
          className={`py-16 lg:py-24 ${gi % 2 === 1 ? 'bg-gray-50/60' : ''}`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="mb-12 max-w-2xl">
              <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-3">
                Group {String(gi + 1).padStart(2, '0')}
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-[-0.025em] leading-[1.1] mb-3">
                {group.title}
              </h2>
              <p className="text-lg text-gray-600">{group.subtitle}</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {group.features.map((f, i) => (
                <motion.div
                  key={f.title}
                  {...stagger}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="group relative p-6 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-lg hover:shadow-gray-900/5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                      <f.icon size={20} className="text-brand-600" />
                    </div>
                    {f.tag && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                        {f.tag}
                      </span>
                    )}
                  </div>
                  <h3 className="text-[16px] font-semibold text-gray-900 mb-2 tracking-[-0.01em] leading-tight">
                    {f.title}
                  </h3>
                  <p className="text-[13.5px] text-gray-600 leading-relaxed">{f.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Final CTA */}
      <section className="py-20 lg:py-24 bg-gradient-to-br from-gray-50 to-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl sm:text-[40px] font-bold text-gray-900 tracking-[-0.025em] leading-[1.1] mb-5">
              See it on your real portfolio.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed mb-8 max-w-2xl mx-auto">
              Spin up a trial in 60 seconds. Import a property, run one PPM through, see the
              certificate generate.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={appUrl('/register')}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/15"
              >
                Start your free trial
                <ArrowRight size={16} />
              </a>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-gray-900 bg-white border border-gray-200 hover:border-gray-300 transition-all"
              >
                See pricing
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
