import { useNavigate } from 'react-router'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell,
  ShieldAlert,
  ShieldX,
  CalendarCheck,
  CalendarClock,
  FileText,
  FileCheck,
  FileX,
  DollarSign,
  AlertTriangle,
  Award,
  CircleAlert,
  Briefcase,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NOTIFICATION_TYPES } from '@/lib/constants'
import { useSwipe } from '@/hooks/use-swipe'

/** Map each notification type to an icon and colour class */
const NOTIFICATION_ICON_MAP: Record<string, { icon: LucideIcon; className: string }> = {
  [NOTIFICATION_TYPES.COMPLIANCE_DUE]: { icon: ShieldAlert, className: 'text-status-due-soon' },
  [NOTIFICATION_TYPES.COMPLIANCE_OVERDUE]: { icon: ShieldX, className: 'text-status-overdue' },
  [NOTIFICATION_TYPES.VISIT_BOOKED]: { icon: CalendarCheck, className: 'text-brand-500' },
  [NOTIFICATION_TYPES.VISIT_REMINDER]: { icon: CalendarClock, className: 'text-brand-500' },
  [NOTIFICATION_TYPES.REPORT_UPLOADED]: { icon: FileText, className: 'text-brand-500' },
  [NOTIFICATION_TYPES.QUOTE_AWAITING]: { icon: FileText, className: 'text-status-due-soon' },
  [NOTIFICATION_TYPES.QUOTE_APPROVED]: { icon: FileCheck, className: 'text-status-compliant' },
  [NOTIFICATION_TYPES.QUOTE_REJECTED]: { icon: FileX, className: 'text-status-overdue' },
  [NOTIFICATION_TYPES.INVOICE_DUE]: { icon: DollarSign, className: 'text-status-due-soon' },
  [NOTIFICATION_TYPES.INVOICE_OVERDUE]: { icon: AlertTriangle, className: 'text-status-overdue' },
  [NOTIFICATION_TYPES.CERTIFICATE_EXPIRING]: { icon: Award, className: 'text-status-due-soon' },
  [NOTIFICATION_TYPES.ACTION_OVERDUE]: { icon: CircleAlert, className: 'text-status-overdue' },
  [NOTIFICATION_TYPES.JOB_COMPLETED]: { icon: Briefcase, className: 'text-status-compliant' },
  [NOTIFICATION_TYPES.DOCUMENT_UPLOADED]: { icon: Upload, className: 'text-brand-500' },
}

export function getNotificationIcon(type?: string) {
  const mapping = type ? NOTIFICATION_ICON_MAP[type] : undefined
  if (!mapping) return { icon: Bell, className: 'text-text-muted' }
  return mapping
}

export interface NotificationLike {
  id: string
  read: boolean
  title: string
  message?: string
  created_at: string
  notification_type?: string
  link?: string | null
}

interface NotificationRowProps {
  notification: NotificationLike
  /** Called when the user activates the row (click / tap / Enter). */
  onActivate?: (notification: NotificationLike) => void
  /** Called on swipe (mobile) — typically used to mark-as-read / archive. */
  onSwipeArchive?: (notification: NotificationLike) => void
  /** Called after navigation has been kicked off (e.g. close popover). */
  afterNavigate?: () => void
}

/**
 * Shared notification list row. Renders the notification icon, title,
 * message, and relative timestamp. When the notification has a `link`,
 * tapping the row marks it read AND navigates to that link. Otherwise it
 * just calls onActivate (which usually marks-as-read).
 *
 * The mark-then-navigate ordering matters: we trigger the optimistic
 * mark-as-read mutation BEFORE calling navigate(), so the cache update
 * lands before React Router unmounts this view.
 */
export function NotificationRow({
  notification,
  onActivate,
  onSwipeArchive,
  afterNavigate,
}: NotificationRowProps) {
  const navigate = useNavigate()
  const { icon: Icon, className: iconClass } = getNotificationIcon(notification.notification_type)
  const swipe = useSwipe({
    threshold: 60,
    onSwipedLeft: () => onSwipeArchive?.(notification),
    onSwipedRight: () => onSwipeArchive?.(notification),
  })

  const handleActivate = () => {
    // Mark first so the optimistic cache write commits before we unmount.
    onActivate?.(notification)
    if (notification.link) {
      afterNavigate?.()
      navigate(notification.link)
    }
  }

  return (
    <button
      {...swipe}
      type="button"
      className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-surface-page transition-colors text-left border-b border-border-default last:border-b-0 touch-pan-y cursor-pointer"
      onClick={handleActivate}
    >
      <span className="mt-0.5 flex-shrink-0 relative">
        <Icon size={14} className={notification.read ? 'text-text-muted' : iconClass} />
        {!notification.read && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-label truncate ${
            !notification.read ? 'font-medium text-text-primary' : 'text-text-secondary'
          }`}
        >
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-micro text-text-muted truncate">{notification.message}</p>
        )}
        <p className="text-micro text-text-muted mt-0.5">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
    </button>
  )
}
