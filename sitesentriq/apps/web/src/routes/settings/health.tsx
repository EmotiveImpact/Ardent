// Sprint 2C — Settings → Integrations Health.
//
// Org admins land here to see "is push working? is email configured?
// is Stripe live?" without having to spelunk through edge-function
// logs. Each row tells them either:
//   - configured (green) — the env vars / install are present
//   - misconfigured (amber) — partial: some required vars missing
//   - unconfigured (gray) — nothing set yet, here's what you need
//
// We do NOT actually send a test message from here — that would
// require a test recipient and isn't safely automatable. Instead we
// link to the "Send test" affordances on each per-integration page
// (Slack, Email, etc.).

import { Link } from 'react-router'
import { ListSkeleton } from '@/components/shared/skeletons'
import {
  Bell,
  Smartphone,
  Mail,
  CreditCard,
  MessageSquare,
  CalendarDays,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Circle,
  ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader } from '@haumea/ui'
import {
  useIntegrationsHealth,
  type HealthStatus,
  type IntegrationSection,
} from '@/hooks/use-integrations-health'

interface RowConfig {
  // Limit to keys of IntegrationsHealth so a typo here is a TS error,
  // and so the IDE auto-completes when adding a new row.
  key:
    | 'web_push'
    | 'expo_push'
    | 'email'
    | 'stripe'
    | 'slack'
    | 'calendar'
    | 'ai'
  icon: LucideIcon
  title: string
  description: string
  /** Where to go to fix it. */
  fixHref?: string
  /** Plain-English fix instruction shown when status !== configured. */
  fixHint: string
}

const ROWS: RowConfig[] = [
  {
    key: 'web_push',
    icon: Bell,
    title: 'Browser push notifications',
    description: 'Web Push delivery for browser sessions (engineers + admins on desktop).',
    fixHint:
      'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on the send-push edge function. Generate with `npx web-push generate-vapid-keys --json`.',
  },
  {
    key: 'expo_push',
    icon: Smartphone,
    title: 'Mobile push notifications',
    description: 'Expo push delivery for engineers in the mobile app.',
    fixHint:
      'No env vars needed — once any engineer signs in to the mobile app, their device registers automatically. The count below is the number of devices currently registered.',
  },
  {
    key: 'email',
    icon: Mail,
    title: 'Outbound email',
    description: 'Sends invites, invoices, weekly digests, and notification fan-out.',
    fixHint:
      'Set RESEND_API_KEY on the send-email edge function. Get one from resend.com → API Keys.',
  },
  {
    key: 'stripe',
    icon: CreditCard,
    title: 'Stripe billing',
    description: 'Subscription checkout, customer portal, and webhook ingestion.',
    fixHint:
      'Set STRIPE_SECRET_KEY (server-side) and STRIPE_WEBHOOK_SECRET (validates webhook signatures). Optionally set per-plan price IDs (STRIPE_PRICE_STARTER, etc.).',
  },
  {
    key: 'slack',
    icon: MessageSquare,
    title: 'Slack notifications',
    description: 'Per-org Slack workspace install for posting notifications.',
    fixHref: '/dashboard/integrations/slack',
    fixHint:
      'Slack is installed per organisation, not per platform. Visit the Slack integration page to install it for your workspace.',
  },
  {
    key: 'calendar',
    icon: CalendarDays,
    title: 'Google Calendar sync',
    description: 'Two-way sync between scheduled jobs and Google Calendar.',
    fixHint:
      'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on the platform. Individual users then connect their account from the Calendar integration page.',
  },
  {
    key: 'ai',
    icon: Sparkles,
    title: 'AI suggestions',
    description: 'Compliance suggestions, auto-assign hints, knowledge-base search.',
    fixHint:
      'Set either OPENAI_API_KEY or ANTHROPIC_API_KEY on the platform.',
  },
]

const STATUS_CONFIG: Record<
  HealthStatus,
  { label: string; classes: string; icon: LucideIcon }
> = {
  configured: {
    label: 'Configured',
    classes: 'bg-status-compliant/10 text-status-compliant',
    icon: CheckCircle2,
  },
  misconfigured: {
    label: 'Partial',
    classes: 'bg-status-due-soon/10 text-status-due-soon',
    icon: AlertCircle,
  },
  unconfigured: {
    label: 'Not set up',
    classes: 'bg-text-muted/10 text-text-muted',
    icon: Circle,
  },
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-medium ${cfg.classes}`}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function HealthRow({ row, section }: { row: RowConfig; section: IntegrationSection }) {
  const Icon = row.icon
  return (
    <li className="px-5 py-4 border-b border-border-subtle last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-page flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-label font-semibold text-text-primary">{row.title}</p>
              <p className="text-caption text-text-muted mt-0.5">{row.description}</p>
            </div>
            <StatusBadge status={section.status} />
          </div>

          {/* Configured-state extras (token counts etc.) */}
          {section.status === 'configured' && (
            <div className="mt-2 flex flex-wrap gap-x-3 text-micro text-text-muted">
              {typeof section.tokenCount === 'number' && (
                <span>{section.tokenCount} device{section.tokenCount === 1 ? '' : 's'} registered</span>
              )}
              {typeof section.integrationsCount === 'number' && (
                <span>{section.integrationsCount} workspace{section.integrationsCount === 1 ? '' : 's'} connected</span>
              )}
              {section.provider && <span>via {section.provider}</span>}
            </div>
          )}

          {/* Fix hint */}
          {section.status !== 'configured' && (
            <div className="mt-2 text-caption text-text-muted">
              <p>{row.fixHint}</p>
              {section.missing && section.missing.length > 0 && (
                <p className="mt-1">
                  <span className="text-text-secondary font-medium">Missing:</span>{' '}
                  <code className="text-micro text-status-overdue bg-status-overdue/10 px-1 py-0.5 rounded">
                    {section.missing.join(', ')}
                  </code>
                </p>
              )}
              {row.fixHref && (
                <Link
                  to={row.fixHref}
                  className="inline-flex items-center gap-1 mt-1.5 text-brand-600 hover:underline"
                >
                  Open {row.title} settings <ExternalLink size={11} />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export default function SettingsHealthPage() {
  const { data, isLoading } = useIntegrationsHealth()

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Integrations health' },
        ]}
      />

      <div>
        <PageHeader title="Integrations health" subtitle="Live status of every back-end integration. Reflects deployed env vars, OAuth installs, and registered devices." />
      </div>

      {isLoading || !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <ul>
            {ROWS.map((row) => (
              <HealthRow key={row.key} row={row} section={data[row.key]} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
