import { useTimelineEvents } from '@/hooks/use-timeline'
import { Chip } from '@haumea/ui'
import { TimelineSkeleton } from '@/components/shared/skeletons'
import { formatRelativeTime } from '@haumea/utils'
import {
  CheckCircle,
  FileText,
  Send,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'

interface EventConfig {
  icon: LucideIcon
  bgColor: string
  iconColor: string
  label: string
}

const EVENT_CONFIG: Record<string, EventConfig> = {
  visit_completed: {
    icon: CheckCircle,
    bgColor: 'bg-status-compliant/10',
    iconColor: 'text-status-compliant',
    label: 'Visit Completed',
  },
  document_uploaded: {
    icon: FileText,
    bgColor: 'bg-surface-elevated',
    iconColor: 'text-text-secondary',
    label: 'Document Uploaded',
  },
  quote_sent: {
    icon: Send,
    bgColor: 'bg-brand-500/10',
    iconColor: 'text-text-accent',
    label: 'Quote Sent',
  },
  quote_approved: {
    icon: CheckCircle2,
    bgColor: 'bg-brand-500/10',
    iconColor: 'text-text-accent',
    label: 'Quote Approved',
  },
  quote_rejected: {
    icon: AlertTriangle,
    bgColor: 'bg-status-overdue/10',
    iconColor: 'text-status-overdue',
    label: 'Quote Rejected',
  },
  invoice_issued: {
    icon: Receipt,
    bgColor: 'bg-surface-elevated',
    iconColor: 'text-text-secondary',
    label: 'Invoice Issued',
  },
  action_raised: {
    icon: AlertTriangle,
    bgColor: 'bg-status-due-soon/10',
    iconColor: 'text-status-due-soon',
    label: 'Action Raised',
  },
  action_resolved: {
    icon: CheckCircle,
    bgColor: 'bg-status-compliant/10',
    iconColor: 'text-status-compliant',
    label: 'Action Resolved',
  },
  compliance_updated: {
    icon: ShieldCheck,
    bgColor: 'bg-brand-500/10',
    iconColor: 'text-text-accent',
    label: 'Compliance Updated',
  },
  report_uploaded: {
    icon: FileText,
    bgColor: 'bg-surface-elevated',
    iconColor: 'text-text-secondary',
    label: 'Report Submitted',
  },
  certificate_expired: {
    icon: AlertTriangle,
    bgColor: 'bg-status-overdue/10',
    iconColor: 'text-status-overdue',
    label: 'Certificate Expired',
  },
}

const DEFAULT_CONFIG: EventConfig = {
  icon: Clock,
  bgColor: 'bg-surface-elevated',
  iconColor: 'text-text-muted',
  label: 'Event',
}

interface TimelineProps {
  propertyId?: string
  clientId?: string
  limit?: number
  showViewAll?: boolean
  compact?: boolean
}

export function Timeline({ propertyId, clientId, limit = 100, showViewAll = false, compact = false }: TimelineProps) {
  const { data: events, isLoading } = useTimelineEvents({ property_id: propertyId, client_id: clientId })

  if (isLoading) {
    return <TimelineSkeleton items={4} />
  }

  const displayEvents = events?.slice(0, limit) ?? []

  if (!displayEvents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-text-muted">
        <Clock size={28} strokeWidth={1.5} className="mb-2" />
        <p className="text-label">No activity recorded yet</p>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-0.5">
        {displayEvents.map((event: any, idx: number) => {
          const config = EVENT_CONFIG[event.event_type] ?? DEFAULT_CONFIG
          const Icon = config.icon

          return (
            <div
              key={event.id}
              className={`flex items-start gap-3 ${compact ? 'py-2.5' : 'py-3'} ${
                idx < displayEvents.length - 1 ? 'border-b border-border-subtle' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${config.bgColor}`}
              >
                <Icon size={14} className={config.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label text-text-primary">{event.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-micro text-text-muted">
                    {formatRelativeTime(event.created_at)}
                  </span>
                  {event.profiles?.full_name && (
                    <span className="text-micro text-text-muted">
                      by {event.profiles.full_name}
                    </span>
                  )}
                  {!compact && (
                    <Chip size="sm" variant="soft" className="text-[10px] h-4 px-1.5">
                      {config.label}
                    </Chip>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {showViewAll && events && events.length > limit && (
        <div className="pt-3 border-t border-border-subtle mt-1">
          <Link
            to="/dashboard/audit"
            className="text-caption font-medium text-text-accent hover:opacity-80 transition-opacity"
          >
            View all activity
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Standalone timeline event list for the dashboard.
 * Takes pre-fetched events directly instead of fetching internally.
 */
export function TimelineEventList({
  events,
  limit = 10,
}: {
  events: any[]
  limit?: number
}) {
  const displayEvents = events.slice(0, limit)

  if (!displayEvents.length) {
    return (
      <div className="flex items-center justify-center py-10 text-text-muted text-label">
        No recent activity
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {displayEvents.map((event: any, idx: number) => {
        const config = EVENT_CONFIG[event.event_type] ?? DEFAULT_CONFIG
        const Icon = config.icon

        return (
          <div
            key={event.id}
            className={`flex items-start gap-3 py-3 ${
              idx < displayEvents.length - 1 ? 'border-b border-border-subtle' : ''
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${config.bgColor}`}
            >
              <Icon size={13} className={config.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-label font-medium text-text-primary">{event.description}</p>
              <span className="text-micro text-text-muted mt-0.5 block">
                {formatRelativeTime(event.created_at)}
                {event.profiles?.full_name ? ` · ${event.profiles.full_name}` : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
