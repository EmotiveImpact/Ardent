// Block Kit message templates for Slack notifications.
//
// Block Kit is plain JSON — no SDK needed. We mirror the same logic on the
// edge function (`slack-post-notification`) for in-app callers, but keep this
// module here so other client code (e.g. the "Test message" button) can
// preview a payload without round-tripping through the edge function.
//
// Slack reference: https://api.slack.com/block-kit

import type { SlackSeverity } from './types'
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/constants'

export interface BlockKitBlock {
  type: string
  // Block Kit is plain JSON — permissive on purpose
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}

export interface BlockKitPayload {
  text?: string
  blocks: BlockKitBlock[]
  attachments?: Array<{ color: string; blocks: BlockKitBlock[] }>
}

export interface SlackBuildContext {
  property?: string
  client?: string
}

export interface BuildSlackBlocksInput {
  type: NotificationType | string
  title: string
  body: string
  link?: string
  severity?: SlackSeverity
  context?: SlackBuildContext
}

const SEVERITY_EMOJI: Record<SlackSeverity, string> = {
  info: ':information_source:',
  success: ':white_check_mark:',
  warning: ':warning:',
  critical: ':rotating_light:',
}

const SEVERITY_COLOR: Record<SlackSeverity, string> = {
  info: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
}

// Map each notification type → recommended default severity. Used only when
// the caller does not explicitly pass `severity`.
export const DEFAULT_SEVERITY: Record<NotificationType, SlackSeverity> = {
  [NOTIFICATION_TYPES.COMPLIANCE_DUE]: 'warning',
  [NOTIFICATION_TYPES.COMPLIANCE_OVERDUE]: 'critical',
  [NOTIFICATION_TYPES.VISIT_BOOKED]: 'info',
  [NOTIFICATION_TYPES.VISIT_REMINDER]: 'info',
  [NOTIFICATION_TYPES.REPORT_UPLOADED]: 'success',
  [NOTIFICATION_TYPES.QUOTE_AWAITING]: 'info',
  [NOTIFICATION_TYPES.QUOTE_APPROVED]: 'success',
  [NOTIFICATION_TYPES.QUOTE_REJECTED]: 'warning',
  [NOTIFICATION_TYPES.INVOICE_DUE]: 'warning',
  [NOTIFICATION_TYPES.INVOICE_OVERDUE]: 'critical',
  [NOTIFICATION_TYPES.CERTIFICATE_EXPIRING]: 'warning',
  [NOTIFICATION_TYPES.ACTION_OVERDUE]: 'critical',
  [NOTIFICATION_TYPES.CALLOUT_RAISED]: 'critical',
  [NOTIFICATION_TYPES.JOB_COMPLETED]: 'success',
  [NOTIFICATION_TYPES.DOCUMENT_UPLOADED]: 'info',
}

/**
 * Build a Block Kit payload for any notification.
 * Generic across all 14 types — uses severity, header emoji, optional context,
 * and an optional "View in Facilities OS" button.
 */
export function buildSlackBlocks(input: BuildSlackBlocksInput): BlockKitPayload {
  const severity: SlackSeverity =
    input.severity ?? DEFAULT_SEVERITY[input.type as NotificationType] ?? 'info'
  const emoji = SEVERITY_EMOJI[severity] ?? ':bell:'
  const color = SEVERITY_COLOR[severity] ?? '#64748b'

  const blocks: BlockKitBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji}  ${input.title}`.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: input.body.slice(0, 2900) },
    },
  ]

  const ctxElements: BlockKitBlock[] = [
    { type: 'mrkdwn', text: `*Severity:* ${severity}` },
    { type: 'mrkdwn', text: `*Type:* \`${input.type}\`` },
  ]
  if (input.context?.client) {
    ctxElements.push({ type: 'mrkdwn', text: `*Client:* ${input.context.client}` })
  }
  if (input.context?.property) {
    ctxElements.push({ type: 'mrkdwn', text: `*Property:* ${input.context.property}` })
  }
  blocks.push({ type: 'context', elements: ctxElements })

  if (input.link) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in Facilities OS' },
          url: input.link,
          style: severity === 'critical' ? 'danger' : 'primary',
        },
      ],
    })
  }

  return {
    text: input.title, // fallback for mobile push / notification previews
    blocks: [],
    attachments: [{ color, blocks }],
  }
}

/**
 * Pretty-print labels for the per-type settings table on the Slack page.
 */
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  [NOTIFICATION_TYPES.COMPLIANCE_DUE]: 'Compliance due',
  [NOTIFICATION_TYPES.COMPLIANCE_OVERDUE]: 'Compliance overdue',
  [NOTIFICATION_TYPES.VISIT_BOOKED]: 'Visit booked',
  [NOTIFICATION_TYPES.VISIT_REMINDER]: 'Visit reminder',
  [NOTIFICATION_TYPES.REPORT_UPLOADED]: 'Report uploaded',
  [NOTIFICATION_TYPES.QUOTE_AWAITING]: 'Quote awaiting approval',
  [NOTIFICATION_TYPES.QUOTE_APPROVED]: 'Quote approved',
  [NOTIFICATION_TYPES.QUOTE_REJECTED]: 'Quote rejected',
  [NOTIFICATION_TYPES.INVOICE_DUE]: 'Invoice due soon',
  [NOTIFICATION_TYPES.INVOICE_OVERDUE]: 'Invoice overdue',
  [NOTIFICATION_TYPES.CERTIFICATE_EXPIRING]: 'Certificate expiring',
  [NOTIFICATION_TYPES.ACTION_OVERDUE]: 'Action overdue',
  [NOTIFICATION_TYPES.CALLOUT_RAISED]: 'Call-out raised',
  [NOTIFICATION_TYPES.JOB_COMPLETED]: 'Job completed',
  [NOTIFICATION_TYPES.DOCUMENT_UPLOADED]: 'Document uploaded',
}
