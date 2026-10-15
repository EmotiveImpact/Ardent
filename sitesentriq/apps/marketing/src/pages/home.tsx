import { useState, type ElementType } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  ShieldCheck,
  Calendar,
  FileSpreadsheet,
  Activity,
  Workflow,
  Building2,
  Zap,
  ScanLine,
  Users,
  HardHat,
  Plug,
  Lock,
  Mail,
} from 'lucide-react'

/**
 * Marketing home page — full-fidelity FloQast layout replica with
 * Haumea palette + copy, navy where the original is dark green,
 * white where the original is white. Zero grey backgrounds.
 *
 * Structure mirrors the FloQast UK homepage section-for-section:
 *
 *   1. HERO            — dark navy, headline + 2 CTAs over a 4-tab
 *                        product preview carousel
 *   2. LOGOS           — white, 12 customer names in a grid
 *   3. STATS           — white, 2 customer-quote cards (navy fill) +
 *                        6 numeric stats laid out in a 2-col split
 *   4. ACCELERATE      — white, eyebrow + h2 over a collaged product
 *                        preview + 4 icon feature cards
 *   5. WORKFLOWS       — white, vertical tabs left / content panel
 *                        right (interactive)
 *   6. CTA50           — white frame around a navy-on-navy banner
 *                        with heading + button
 *   7. ACCOUNTANTS     — dark navy band, headline + body + arrow link
 *                        on the left, big lifestyle photo on the right
 *   8. LAYOUT360       — white frame around 2 large navy illustration
 *                        cards (Ecosystem + Built for Assurance)
 *   9. FOOTER GRADIENT — dark navy band, gradient headline + email
 *                        capture form
 */
export default function HomePage() {
  return (
    <div className="overflow-hidden bg-surface-sidebar">
      <Hero />
      <LogoStrip />
      <Stats />
      <Accelerate />
      <WorkflowTabs />
      <MidCta />
      <AccountantsBand />
      <IntegrationsAndAssurance />
      <FooterGradient />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 1. HERO — full-bleed navy with tabbed product preview
// ─────────────────────────────────────────────────────────────────

const HERO_TABS = [
  {
    key: 'plan',
    label: 'Plan Maintenance',
    desc: 'PPM plans, fixed/rolling schedules, asset compliance categories.',
  },
  {
    key: 'run',
    label: 'Run Field Ops',
    desc: 'Drag-and-drop scheduler, mobile field mode, parts and signatures.',
  },
  {
    key: 'compliance',
    label: 'Live Compliance',
    desc: 'Auto-renewing items, certificates against jobs, audit-ready trail.',
  },
  {
    key: 'reporting',
    label: 'Real-Time Reporting',
    desc: 'Dashboards refresh in under a second when any browser changes a row.',
  },
]

function Hero() {
  const [activeTab, setActiveTab] = useState(HERO_TABS[0].key)

  return (
    <section className="relative bg-surface-sidebar text-white overflow-hidden pt-32 lg:pt-40 pb-24 lg:pb-32">
      {/* Single soft cool-white light source from upper-right.
          Replaces two competing radials — orange now reserved for CTAs. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px circle at 78% -10%, rgba(255,255,255,0.06), transparent 55%)',
        }}
      />
      {/* Fine dot-grid texture — adds craft without adding noise.
          ~2% white at 24px intervals; reads as subtle "mesh" under the type. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.6]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          {/* Eyebrow — subtle white, no orange dot. The "live" signal lives
              in the activity feed below where it actually means something. */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-[0.14em] bg-white/[0.04] border border-white/10 text-white/55 mb-7">
            Real-time facilities OS
          </div>
          {/* H1 down from 72→60 desktop, scale tightened for hierarchy.
              Accent line in white (not orange) — sheer size carries it. */}
          <h1 className="text-[40px] sm:text-[52px] lg:text-[60px] font-semibold tracking-[-0.03em] leading-[1.03]">
            The first facilities platform
            <span className="block text-white/85">built on live compliance</span>
          </h1>
          <p className="mt-6 text-[17px] sm:text-[19px] text-white/65 leading-[1.55] max-w-xl mx-auto">
            See every job, certificate and invoice across your portfolio
            update the second they happen — without a single page reload.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[15px] font-semibold transition-colors shadow-lg shadow-brand-500/30"
            >
              Watch a demo
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-white/70 hover:text-white text-[15px] font-medium transition-colors"
            >
              See how it works
              <ArrowRight size={14} className="opacity-60" />
            </Link>
          </div>

          {/* Stat strip — instant proof under the CTAs. Each pill has a
              vertical divider so it reads as a single bar, not three pills. */}
          <div className="mt-12 inline-flex items-stretch divide-x divide-white/10 text-left">
            {[
              { v: '400+', l: 'FM teams' },
              { v: '12k+', l: 'properties' },
              { v: '99.97%', l: 'uptime' },
            ].map((s) => (
              <div key={s.l} className="px-5 first:pl-0 last:pr-0">
                <div className="text-[18px] font-semibold tracking-tight">{s.v}</div>
                <div className="text-[11px] text-white/40 uppercase tracking-[0.1em] mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Underline-tab pattern. Inactive = ghost text, active = white
            text + orange underline. No more 4-CTA-pretender pills. */}
        <div className="mt-20 lg:mt-24">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-10 border-b border-white/10 pb-1">
            {HERO_TABS.map((t) => {
              const active = t.key === activeTab
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`relative pb-3 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    active
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {t.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -bottom-px left-0 right-0 h-[2px] bg-brand-500"
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Live activity preview — fake browser frame with real-feeling
              pulsing event row. Demonstrates "live" instead of stating it. */}
          <LiveActivityMock activeTabKey={activeTab} />
        </div>
      </div>
    </section>
  )
}

/**
 * Fake "live activity feed" panel framed inside a browser chrome.
 * Replaces the previous void-with-an-icon placeholder with something
 * that demonstrates "live" instead of stating it. The pulsing top
 * row + a static event log below give a credible glimpse of the
 * product without requiring real screenshots.
 */
function LiveActivityMock({ activeTabKey }: { activeTabKey: string }) {
  const eventsByTab: Record<string, { time: string; who: string; what: string; icon: ElementType; tone: 'compliant' | 'amber' | 'rose' | 'brand' }[]> = {
    plan: [
      { time: 'just now', who: 'Sarah M.', what: 'PPM plan generated for ACME HQ — Tower A', icon: ClipboardCheck, tone: 'brand' },
      { time: '12s ago', who: 'auto', what: 'Annual Fire Alarm scheduled for 5 properties', icon: Calendar, tone: 'compliant' },
      { time: '34s ago', who: 'James O.', what: 'Schedule mode set to rolling on 12 plans', icon: Workflow, tone: 'amber' },
    ],
    run: [
      { time: 'just now', who: 'Mike R.', what: 'Job #4128 — assigned to Engineer "Tom W."', icon: HardHat, tone: 'brand' },
      { time: '8s ago', who: 'auto', what: 'Auto-assign matched 3 jobs by skill + travel', icon: Zap, tone: 'compliant' },
      { time: '47s ago', who: 'Tom W.', what: 'Captured 2 photos + signature on /jobs/4128', icon: ScanLine, tone: 'amber' },
    ],
    compliance: [
      { time: 'just now', who: 'auto', what: 'Gas Safety certificate uploaded on Hickeys Site 3', icon: ShieldCheck, tone: 'compliant' },
      { time: '15s ago', who: 'auto', what: '7 compliance items renewed on schedule', icon: ShieldCheck, tone: 'compliant' },
      { time: '1m ago', who: 'auditor', what: 'Audit log exported for Q2 2026', icon: FileSpreadsheet, tone: 'amber' },
    ],
    reporting: [
      { time: 'just now', who: 'live', what: 'Compliance score updated: 94% → 96% (Beacon Estates)', icon: Activity, tone: 'compliant' },
      { time: '4s ago', who: 'live', what: 'Open jobs count: 38 → 37 across the portfolio', icon: Activity, tone: 'amber' },
      { time: '22s ago', who: 'live', what: 'Overdue items: 3 → 2 (Hickeys Pharmacy)', icon: Activity, tone: 'rose' },
    ],
  }

  const events = eventsByTab[activeTabKey] || eventsByTab.plan

  return (
    <div className="relative max-w-5xl mx-auto rounded-2xl border border-white/10 bg-[#0d0e16] shadow-2xl shadow-black/50 overflow-hidden">
      {/* Browser chrome — traffic-light dots + URL pill */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0a0b12]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] border border-white/10 text-[11px] text-white/40 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-status-compliant" />
            haumea.app/dashboard/jobs
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/30 hidden sm:block">
          Live · org sync
        </div>
      </div>

      {/* Activity feed body */}
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-semibold text-white">
            Live activity feed
          </h3>
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-compliant opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-status-compliant" />
            </span>
            Connected · 4 browsers
          </div>
        </div>

        <ul className="space-y-2">
          {events.map((e, i) => {
            const Icon = e.icon
            const tone =
              e.tone === 'compliant' ? 'bg-status-compliant/10 text-status-compliant'
              : e.tone === 'amber' ? 'bg-status-due-soon/10 text-status-due-soon'
              : e.tone === 'rose' ? 'bg-status-overdue/10 text-status-overdue'
              : 'bg-brand-500/10 text-brand-400'
            return (
              <li
                key={`${activeTabKey}-${i}`}
                className="relative flex items-start gap-3 p-3.5 rounded-lg border border-white/5 bg-white/[0.02]"
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg flex-shrink-0 ${tone}`}>
                  <Icon size={15} strokeWidth={2.1} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] text-white/85 leading-snug">
                    <span className="font-semibold text-white">{e.who}</span>{' '}
                    <span className="text-white/60">{e.what}</span>
                  </p>
                  <p className="text-[11px] text-white/35 mt-1 font-mono uppercase tracking-[0.05em]">
                    {e.time}
                  </p>
                </div>
                {i === 0 && (
                  <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-status-compliant flex-shrink-0 mt-1">
                    new
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-5 pt-5 border-t border-white/5 flex items-center justify-between text-[11px] text-white/40">
          <span>Showing 3 of 1,287 events from the last 24h</span>
          <span className="font-mono">↻ updated &lt; 1s ago</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 2. LOGO STRIP — white bg, customer names
// ─────────────────────────────────────────────────────────────────

const CUSTOMER_NAMES = [
  'ACME HQ',
  'Hickeys Pharmacy',
  'NorthRail',
  'Beacon Estates',
  'Greyland Group',
  'Westferry FM',
  'Sentinel Group',
  'Riverford',
  'Clearwell',
  'Bramwell Trust',
  'Atria Living',
  'Halestar',
]

function LogoStrip() {
  return (
    <section className="bg-surface-sidebar py-16 lg:py-20 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[15px] font-medium text-white/70 mb-10">
          Trusted by 400+ facilities teams across the UK and Ireland
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-6 items-center justify-items-center">
          {CUSTOMER_NAMES.map((name) => (
            <span
              key={name}
              className="text-[14px] sm:text-[15px] font-semibold tracking-[-0.01em] text-white/55 opacity-70 hover:opacity-100 transition-opacity"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 3. STATS — white frame, 2 navy quote cards + 6 numeric stats
// ─────────────────────────────────────────────────────────────────

function Stats() {
  return (
    <section className="bg-surface-sidebar py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-400 mb-3">
            Operational Impact
          </p>
          <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.025em] text-white leading-[1.05]">
            We deliver material impact
          </h2>
          <p className="mt-5 text-[16px] text-white/70">
            Real numbers from the first 90 days with our reference customers.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 lg:gap-10">
          {/* Left — 2 customer quote cards on dark navy */}
          <div className="space-y-4">
            <QuoteCard
              quote="Our compliance overdue rate dropped from 18% to 4% in the first quarter. Auditors now spend half a day on us instead of two."
              attribution="Sarah Mensah"
              role="Head of FM, Hickeys Pharmacy"
            />
            <QuoteCard
              quote="The realtime sync alone replaced three of our spreadsheets. My engineers see schedule changes the second they happen."
              attribution="James O'Connor"
              role="Operations Director, Beacon Estates"
            />
          </div>

          {/* Right — 2x3 numeric stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-12 sm:gap-y-14 self-center">
            {[
              { value: '42%', label: 'Reduction in compliance overdue rate' },
              { value: '30%', label: 'Reduction in audit prep time' },
              { value: '25%', label: 'Fewer site-visit no-shows' },
              { value: '3.2×', label: 'Faster quote → approval' },
              { value: '18 hrs', label: 'Saved per engineer per month' },
              { value: '120+', label: 'Properties under live compliance per org' },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[44px] sm:text-[56px] font-semibold tracking-[-0.03em] text-white leading-none">
                  {s.value}
                </div>
                <p className="mt-3 text-[13px] text-white/70 leading-snug max-w-[20ch]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function QuoteCard({
  quote,
  attribution,
  role,
}: {
  quote: string
  attribution: string
  role: string
}) {
  return (
    <div className="rounded-2xl bg-surface-sidebar text-white p-7 lg:p-8 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 w-60 h-60 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgba(232,119,46,0.15), transparent)',
        }}
      />
      <p className="relative text-[15px] leading-relaxed text-white/85">
        <span className="text-brand-400 font-semibold text-[20px] mr-1 align-top leading-none">"</span>
        {quote}
      </p>
      <div className="relative mt-6 pt-6 border-t border-white/10">
        <p className="text-[13px] font-semibold text-white">{attribution}</p>
        <p className="text-[12px] text-white/55 mt-0.5">{role}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 4. ACCELERATE — white, hero collage + 4 feature cards
// ─────────────────────────────────────────────────────────────────

function Accelerate() {
  return (
    <section className="relative bg-surface-sidebar overflow-hidden py-24 lg:py-32 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] bg-brand-500/15 text-brand-400 mb-4">
            Accelerate Your Operations
          </span>
          <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.025em] text-white leading-[1.05]">
            Operations that run themselves
          </h2>
          <p className="mt-5 text-[16px] text-white/70 leading-relaxed">
            Plans that generate, schedules that self-optimise, compliance that
            renews — so your engineers spend their day on site, not in
            spreadsheets.
          </p>
        </div>

        {/* Hero collage area — placeholder for product screenshot with floating callouts */}
        <div className="relative max-w-5xl mx-auto mb-16 lg:mb-20">
          <div className="rounded-2xl bg-surface-sidebar border border-white/10 shadow-xl overflow-hidden aspect-[16/9] grid place-items-center">
            <div className="text-center text-white/30">
              <FileSpreadsheet size={56} strokeWidth={1.4} className="mx-auto mb-3" />
              <p className="text-[12px] uppercase tracking-[0.18em]">Product preview area</p>
            </div>
          </div>
          {/* Floating callout chips — 5 small annotations layered on the screenshot */}
          <FloatingCallout className="-top-3 -left-3 lg:top-6 lg:-left-10" icon={ClipboardCheck} label="PPM plans auto-generated" />
          <FloatingCallout className="top-1/3 -right-3 lg:-right-12" icon={ShieldCheck} label="Compliance auto-renewing" />
          <FloatingCallout className="bottom-1/4 -left-3 lg:-left-14" icon={Calendar} label="Engineers self-optimised" />
          <FloatingCallout className="bottom-3 right-6 lg:bottom-8 lg:right-1/4" icon={Zap} label="Live across all browsers" />
        </div>

        {/* 4-up icon cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: ClipboardCheck,
              title: 'PPM plans built to your asset register',
              body: 'Haumea generates the checklist, frequency, and engineer trade match — tailored to your asset categories and your team.',
            },
            {
              icon: ShieldCheck,
              title: 'Compliance items renew themselves',
              body: 'Certificates, gas safety, fire-alarm tests — every recurring item tracks itself and raises a job when due.',
            },
            {
              icon: Calendar,
              title: 'Engineer schedules self-optimise',
              body: 'Drag, drop, or let auto-assign do it. Skill match, travel time, time windows, and SLA all factored in.',
            },
            {
              icon: FileSpreadsheet,
              title: 'Quote → job → invoice in one flow',
              body: 'Approve in the portal, generate the job, capture parts and labour on site, ship a Stripe invoice — no re-keying.',
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-white/10 bg-navy-800 p-7 hover:border-white/20 hover:bg-navy-700 transition-all"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground mb-5">
                <c.icon size={20} strokeWidth={2} />
              </div>
              <h3 className="text-[16px] font-semibold text-white mb-2 leading-snug">
                {c.title}
              </h3>
              <p className="text-[13px] text-white/70 leading-relaxed">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FloatingCallout({
  className = '',
  icon: Icon,
  label,
}: {
  className?: string
  icon: React.ElementType
  label: string
}) {
  return (
    <div
      className={`hidden md:flex absolute z-10 items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-xl shadow-black/40 border border-white/10 text-[12px] font-semibold text-surface-sidebar whitespace-nowrap ${className}`}
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon size={11} strokeWidth={2.4} />
      </span>
      {label}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 5. WORKFLOW TABS — vertical tabs left, content panel right
// ─────────────────────────────────────────────────────────────────

const WORKFLOW_TABS = [
  {
    key: 'plan',
    icon: Workflow,
    title: 'Plan maintenance',
    bullets: [
      'PPM plans linked to assets and frequencies',
      'Fixed and rolling schedule modes',
      'Compliance categories per asset type',
    ],
  },
  {
    key: 'run',
    icon: HardHat,
    title: 'Run field ops',
    bullets: [
      'Drag-and-drop engineer assignment',
      'Mobile field mode with photos and signatures',
      'Parts and time captured against the job',
    ],
  },
  {
    key: 'compliance',
    icon: Activity,
    title: 'Live compliance',
    bullets: [
      'Auto-renewing certificates against jobs',
      'Per-property compliance score',
      'Audit trail you can hand to ICO',
    ],
  },
  {
    key: 'report',
    icon: ScanLine,
    title: 'Real-time reporting',
    bullets: [
      'Dashboards refresh in <1 second on any change',
      'No polling, no F5',
      'Saved views, smart filters, CSV export',
    ],
  },
]

function WorkflowTabs() {
  const [activeKey, setActiveKey] = useState(WORKFLOW_TABS[0].key)
  const active = WORKFLOW_TABS.find((t) => t.key === activeKey) || WORKFLOW_TABS[0]
  const ActiveIcon = active.icon

  return (
    <section className="bg-surface-sidebar py-24 lg:py-32 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] bg-brand-500/15 text-brand-400 mb-4">
            Live, connected facilities workflows
          </span>
          <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.025em] text-white leading-[1.05]">
            Four pillars. One platform. Real-time everywhere.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6 lg:gap-10">
          {/* Vertical tab list */}
          <div className="space-y-2">
            {WORKFLOW_TABS.map((t) => {
              const isActive = t.key === activeKey
              const TabIcon = t.icon
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveKey(t.key)}
                  className={`w-full text-left p-5 rounded-2xl border transition-all ${
                    isActive
                      ? 'bg-surface-sidebar text-white border-surface-sidebar shadow-lg shadow-black/10'
                      : 'bg-navy-800 text-white border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-lg ${
                        isActive
                          ? 'bg-brand-500/15 text-brand-400'
                          : 'bg-accent text-accent-foreground'
                      }`}
                    >
                      <TabIcon size={16} strokeWidth={2.1} />
                    </span>
                    <span className="text-[15px] font-semibold flex-1">{t.title}</span>
                    <ArrowRight
                      size={15}
                      className={isActive ? 'text-white/60' : 'text-white/55'}
                    />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Content panel — placeholder showing active tab */}
          <div className="relative rounded-3xl bg-surface-sidebar text-white p-8 lg:p-12 overflow-hidden min-h-[420px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(600px circle at 100% 0%, rgba(232,119,46,0.16), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/15 text-brand-400 mb-5">
                <ActiveIcon size={24} strokeWidth={1.8} />
              </div>
              <h3 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.02em] mb-5">
                {active.title}
              </h3>
              <ul className="space-y-3 mb-8">
                {active.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-[15px] text-white/80">
                    <CheckCircle2 size={18} className="text-brand-400 flex-shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                to="/features"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
              >
                See solution
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 6. MID CTA — white frame around a navy banner
// ─────────────────────────────────────────────────────────────────

function MidCta() {
  return (
    <section className="bg-surface-sidebar py-20 lg:py-24 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-surface-sidebar text-white p-10 lg:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(600px circle at 95% 25%, rgba(232,119,46,0.20), transparent 60%), radial-gradient(500px circle at 5% 100%, rgba(255,255,255,0.05), transparent 70%)',
            }}
          />
          <div className="relative grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
            <div>
              <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-[-0.025em] leading-[1.05]">
                Lead the future of
                <span className="text-brand-400"> facilities management</span>
              </h2>
              <p className="mt-5 text-[16px] text-white/70 leading-relaxed max-w-xl">
                Replace your patchwork of spreadsheets, scheduling tools and
                compliance trackers with one live platform. We migrate your
                data and onboard your team in a fortnight.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[15px] font-semibold transition-colors"
              >
                Book a demo
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[15px] font-semibold border border-white/20 transition-colors"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 7. ACCOUNTANTS BAND — "By FMs, for FMs" — dark navy band, photo right
// ─────────────────────────────────────────────────────────────────

function AccountantsBand() {
  return (
    <section className="bg-surface-sidebar py-12 lg:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-surface-sidebar text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(600px circle at 0% 100%, rgba(232,119,46,0.14), transparent 60%)',
            }}
          />
          <div className="relative grid lg:grid-cols-2">
            {/* Copy left */}
            <div className="p-10 lg:p-16 flex items-center">
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] bg-brand-500/15 text-brand-400 mb-5">
                  By facilities managers, for facilities managers
                </span>
                <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0.025em] leading-[1.05]">
                  Built by people who actually run portfolios
                </h2>
                <p className="mt-5 text-[15px] text-white/70 leading-relaxed">
                  Our founders ran a 60-property managed-services contract for
                  six years. Every workflow in Haumea is a paper-cut we've
                  felt — from the audit request you got at 4 pm on a Friday to
                  the engineer who can't find the last service report.
                </p>
                <p className="mt-4 text-[15px] text-white/70 leading-relaxed">
                  Real-time isn't a feature here. It's the substrate.
                </p>
                <Link
                  to="/about"
                  className="mt-7 inline-flex items-center gap-2 text-[14px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Read our story
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>

            {/* Photo placeholder right — lifestyle image of FM team */}
            <div className="relative min-h-[320px] lg:min-h-0 bg-navy-900 grid place-items-center">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(closest-side, rgba(232,119,46,0.16), transparent 75%)',
                }}
              />
              <div className="relative text-center text-white/30">
                <Users size={64} strokeWidth={1.3} className="mx-auto mb-3" />
                <p className="text-[12px] uppercase tracking-[0.18em]">
                  Lifestyle photo — FM team on site
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 8. INTEGRATIONS + ASSURANCE — 2 large navy cards on white
// ─────────────────────────────────────────────────────────────────

function IntegrationsAndAssurance() {
  return (
    <section className="bg-surface-sidebar py-24 lg:py-32 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] bg-brand-500/15 text-brand-400 mb-4">
            Connected and Compliant
          </span>
          <h2 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.025em] text-white leading-[1.05]">
            Plugs into your stack. Built for your auditor.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1 — Ecosystem */}
          <div className="relative overflow-hidden rounded-3xl bg-surface-sidebar text-white p-10 lg:p-12 min-h-[420px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(500px circle at 100% 100%, rgba(232,119,46,0.16), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/15 text-brand-400 mb-6">
                <Plug size={22} strokeWidth={1.8} />
              </div>
              <h3 className="text-[26px] sm:text-[32px] font-semibold tracking-[-0.02em] mb-4">
                Ecosystem of integrations
              </h3>
              <p className="text-[15px] text-white/70 leading-relaxed mb-7 max-w-md">
                Stripe, Xero, QuickBooks, Sage, Slack, Microsoft 365, Google
                Workspace — connect once and let Haumea push invoices, sync
                contacts, and post status updates automatically.
              </p>
              <div className="flex flex-wrap gap-2 mb-8 max-w-md">
                {['Stripe', 'Xero', 'QuickBooks', 'Sage', 'Slack', 'M365', 'Google'].map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-white/10 border border-white/15 text-white"
                  >
                    {n}
                  </span>
                ))}
              </div>
              <Link
                to="/features"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
              >
                See integrations
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>

          {/* Card 2 — Assurance */}
          <div className="relative overflow-hidden rounded-3xl bg-surface-sidebar text-white p-10 lg:p-12 min-h-[420px]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(500px circle at 0% 0%, rgba(232,119,46,0.16), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/15 text-brand-400 mb-6">
                <Lock size={22} strokeWidth={1.8} />
              </div>
              <h3 className="text-[26px] sm:text-[32px] font-semibold tracking-[-0.02em] mb-4">
                Built for assurance
              </h3>
              <p className="text-[15px] text-white/70 leading-relaxed mb-7 max-w-md">
                Row-level multi-tenancy, an immutable audit log, GDPR
                self-service exports, and a role model your auditor can read.
                Compliance is the substrate, not a feature.
              </p>
              <ul className="space-y-2.5 mb-8">
                {[
                  'SOC 2 in flight (Q3 2026)',
                  'GDPR + UK ICO compliant',
                  'EU/UK data residency',
                  'Audit log retained for 7 years',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-center gap-2.5 text-[14px] text-white/80"
                  >
                    <CheckCircle2 size={16} className="text-brand-400 flex-shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
              >
                See trust &amp; security
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 9. FOOTER GRADIENT — dark navy, gradient headline + email capture
// ─────────────────────────────────────────────────────────────────

function FooterGradient() {
  const [email, setEmail] = useState('')

  return (
    <section className="relative bg-surface-sidebar text-white overflow-hidden py-24 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px circle at 50% 100%, rgba(232,119,46,0.22), transparent 60%), radial-gradient(800px circle at 20% 0%, rgba(255,255,255,0.05), transparent 70%)',
        }}
      />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Building2
          size={44}
          strokeWidth={1.6}
          className="mx-auto mb-8 text-brand-400"
        />
        <h2
          className="text-[44px] sm:text-[60px] lg:text-[76px] font-semibold tracking-[-0.03em] leading-[1.02]"
          style={{
            backgroundImage:
              'linear-gradient(135deg, #ffffff 0%, #f0944a 60%, #e8772e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          One platform for every property
        </h2>
        <p className="mt-7 text-[16px] sm:text-[18px] text-white/70 max-w-2xl mx-auto leading-relaxed">
          From a single property to a regional portfolio — Haumea scales with
          you, and stays live with every change.
        </p>

        {/* Email capture form */}
        <form
          className="mt-10 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          onSubmit={(e) => {
            e.preventDefault()
            // Future: pipe to /contact with prefilled email
            window.location.href = `/contact${email ? `?email=${encodeURIComponent(email)}` : ''}`
          }}
        >
          <div className="relative flex-1">
            <Mail
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="What's your email?"
              aria-label="Email address"
              className="w-full pl-10 pr-4 py-3.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[14px] font-semibold transition-colors"
          >
            Book a demo
            <ArrowRight size={15} />
          </button>
        </form>

        <p className="mt-6 text-[12px] text-white/40">
          14-day free trial · No credit card · Onboarding in a fortnight
        </p>
      </div>
    </section>
  )
}
