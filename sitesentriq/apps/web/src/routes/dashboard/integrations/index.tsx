import { Link } from 'react-router'
import { Chip } from '@haumea/ui'
import {
  CalendarDays,
  FileSpreadsheet,
  Receipt,
  ShieldCheck,
  MessageSquare,
  Plug,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { PageHeader, Heading } from '@haumea/ui'

type IntegrationStatus = 'active' | 'coming-soon'

interface Integration {
  key: string
  title: string
  description: string
  icon: LucideIcon
  status: IntegrationStatus
  link?: string
}

const integrations: Integration[] = [
  {
    key: 'calendar',
    title: 'Calendar Sync',
    description:
      'Subscribe to your assigned jobs in Apple Calendar, Outlook, or any iCal client. Optionally push events to Google Calendar.',
    icon: CalendarDays,
    status: 'active',
    link: '/dashboard/integrations/calendar',
  },
  {
    key: 'xero',
    title: 'Xero',
    description: 'Sync invoices, contacts, and payments with your Xero accounting workspace.',
    icon: FileSpreadsheet,
    status: 'active',
    link: '/dashboard/integrations/xero',
  },
  {
    key: 'quickbooks',
    title: 'QuickBooks',
    description: 'Sync invoices and customers with QuickBooks Online for unified bookkeeping.',
    icon: Receipt,
    status: 'active',
    link: '/dashboard/integrations/quickbooks',
  },
  {
    key: 'entra',
    title: 'Microsoft Entra (SSO)',
    description: 'Single sign-on via Microsoft Entra ID with SCIM provisioning for enterprise teams.',
    icon: ShieldCheck,
    status: 'active',
    link: '/dashboard/integrations/sso',
  },
  {
    key: 'slack',
    title: 'Slack',
    description: 'Post job, compliance, and invoice events to a Slack channel of your choice.',
    icon: MessageSquare,
    status: 'active',
    link: '/dashboard/integrations/slack',
  },
]

export default function IntegrationsHubPage() {
  return (
    <div className="max-w-6xl">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Integrations' },
        ]}
      />

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Plug size={18} className="text-brand-500" />
          </div>
          <PageHeader title="Integrations" />
        </div>
        <p className="text-label text-text-secondary">
          Connect Facilities OS to the tools your team already lives in.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((integ) => {
          const Icon = integ.icon
          const isActive = integ.status === 'active'
          const innerClasses = `relative bg-surface-card border border-border-default rounded-xl p-4 h-full transition-all ${
            isActive
              ? 'hover:border-brand-500/40 hover:shadow-md'
              : 'opacity-70'
          }`

          const inner = (
            <div className={innerClasses}>
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-surface-elevated flex items-center justify-center flex-shrink-0">
                  <Icon size={20} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Heading level={3} scale="body" className="truncate">
                      {integ.title}
                    </Heading>
                    {isActive ? (
                      <Chip size="sm" color="success" variant="soft">Active</Chip>
                    ) : (
                      <Chip size="sm" variant="soft">Coming soon</Chip>
                    )}
                  </div>
                  <p className="text-[12.5px] text-text-secondary leading-snug">
                    {integ.description}
                  </p>
                </div>
                {isActive && (
                  <ChevronRight size={16} className="text-text-muted mt-2" />
                )}
              </div>
            </div>
          )

          if (isActive && integ.link) {
            return (
              <Link key={integ.key} to={integ.link} className="block">
                {inner}
              </Link>
            )
          }
          return <div key={integ.key}>{inner}</div>
        })}
      </div>
    </div>
  )
}
