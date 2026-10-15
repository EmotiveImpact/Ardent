// Slack integration settings page.
// Routes:
//   /dashboard/integrations/slack
//   /dashboard/integrations/slack?code=...&state=...   (OAuth callback)
//
// Owner: Builder 9C (Wave 9 — Slack notifications)

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { Button, Chip, Switch } from '@haumea/ui'
import { FormSelect, PageHeader, Heading, Text } from '@haumea/ui'
import {
  Plug,
  Plug2,
  Activity,
  Send,
  Bell,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SkeletonBox } from '@/components/shared/skeletons'
import { formatDate } from '@haumea/utils'
import { NOTIFICATION_TYPES } from '@/lib/constants'
import {
  useSlackConnection,
  useSlackNotificationSettings,
  useSlackPostLog,
  useStartSlackAuthorize,
  useCompleteSlackCallback,
  useDisconnectSlack,
  useUpdateSlackSetting,
  useSendSlackTestMessage,
} from '@/lib/integrations/slack/hooks'
import { NOTIFICATION_TYPE_LABEL } from '@/lib/integrations/slack/blocks'
import type { SlackSeverity } from '@/lib/integrations/slack/types'

const SLACK_STATE_KEY = 'slack_oauth_state'

const SEVERITY_OPTIONS: Array<{ key: SlackSeverity; label: string }> = [
  { key: 'info', label: 'Info & above' },
  { key: 'warning', label: 'Warning & above' },
  { key: 'critical', label: 'Critical only' },
]

// Render order — same as the constant declaration order so admins see a stable list.
const ORDERED_TYPES = [
  NOTIFICATION_TYPES.COMPLIANCE_DUE,
  NOTIFICATION_TYPES.COMPLIANCE_OVERDUE,
  NOTIFICATION_TYPES.VISIT_BOOKED,
  NOTIFICATION_TYPES.VISIT_REMINDER,
  NOTIFICATION_TYPES.REPORT_UPLOADED,
  NOTIFICATION_TYPES.QUOTE_AWAITING,
  NOTIFICATION_TYPES.QUOTE_APPROVED,
  NOTIFICATION_TYPES.QUOTE_REJECTED,
  NOTIFICATION_TYPES.INVOICE_DUE,
  NOTIFICATION_TYPES.INVOICE_OVERDUE,
  NOTIFICATION_TYPES.CERTIFICATE_EXPIRING,
  NOTIFICATION_TYPES.ACTION_OVERDUE,
  NOTIFICATION_TYPES.JOB_COMPLETED,
  NOTIFICATION_TYPES.DOCUMENT_UPLOADED,
] as const

export default function SlackIntegrationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { data: connection, isLoading } = useSlackConnection()
  const { data: settings = [] } = useSlackNotificationSettings()
  const { data: log = [] } = useSlackPostLog(20)

  const startAuthorize = useStartSlackAuthorize()
  const completeCallback = useCompleteSlackCallback()
  const disconnect = useDisconnectSlack()
  const updateSetting = useUpdateSlackSetting()
  const sendTest = useSendSlackTestMessage()

  const clientIdConfigured = useMemo(
    () => Boolean(import.meta.env.VITE_SLACK_CLIENT_ID),
    [],
  )

  // Local channel inputs — debounced commits on blur to avoid one save per keystroke.
  const [channelDrafts, setChannelDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (settings.length === 0) return
    const next: Record<string, string> = {}
    settings.forEach((s) => {
      next[s.notification_type] = s.custom_channel ?? ''
    })
    setChannelDrafts(next)
  }, [settings])

  // Handle the OAuth callback if Slack redirected us back.
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code) return
    const expected = sessionStorage.getItem(SLACK_STATE_KEY)
    if (state && expected && state !== expected) {
      navigate('/dashboard/integrations/slack', { replace: true })
      return
    }
    const redirectUri = `${window.location.origin}/dashboard/integrations/slack`
    completeCallback.mutate(
      { code, redirectUri },
      {
        onSettled: () => {
          sessionStorage.removeItem(SLACK_STATE_KEY)
          navigate('/dashboard/integrations/slack', { replace: true })
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleConnect = async () => {
    const redirectUri = `${window.location.origin}/dashboard/integrations/slack`
    const result = await startAuthorize.mutateAsync(redirectUri)
    if (result?.error === 'SLACK_NOT_CONFIGURED' || !result?.url) {
      // edge function returns this when env vars are missing
      return
    }
    if (result.state) sessionStorage.setItem(SLACK_STATE_KEY, result.state)
    window.location.href = result.url
  }

  const settingFor = (type: string) =>
    settings.find((s) => s.notification_type === type)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Integrations', path: '/dashboard/integrations' },
          { label: 'Slack' },
        ]}
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <Plug size={20} className="text-brand-500" />
        </div>
        <div>
          <PageHeader title="Slack" />
          <p className="text-label text-text-muted">
            Stream Facilities OS events into a Slack channel of your choice.
          </p>
        </div>
      </div>

      {!clientIdConfigured && (
        <div className="bg-surface-card border border-status-due-soon/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-status-due-soon shrink-0 mt-0.5" />
          <div>
            <p className="text-label font-medium text-text-primary">
              Slack is not yet configured
            </p>
            <p className="text-caption text-text-muted mt-1">
              Set{' '}
              <code className="px-1 py-0.5 rounded bg-surface-page text-micro">
                VITE_SLACK_CLIENT_ID
              </code>{' '}
              in your environment, plus{' '}
              <code className="px-1 py-0.5 rounded bg-surface-page text-micro">
                SLACK_CLIENT_ID
              </code>{' '}
              and{' '}
              <code className="px-1 py-0.5 rounded bg-surface-page text-micro">
                SLACK_CLIENT_SECRET
              </code>{' '}
              as Edge Function secrets, to enable connections.
            </p>
          </div>
        </div>
      )}

      {/* Connection card */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Plug2 size={16} className="text-text-muted" />
          <Heading level={2} scale="body">
            Connection Status
          </Heading>
        </div>
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">
              <SkeletonBox className="h-5 w-40" />
              <SkeletonBox className="h-4 w-64" />
              <SkeletonBox className="h-4 w-52" />
            </div>
          ) : connection ? (
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Chip variant="soft" color="success" size="sm">
                    Connected
                  </Chip>
                  {connection.slack_team_name && (
                    <span className="text-label font-medium text-text-primary">
                      {connection.slack_team_name}
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-caption">
                  <div>
                    <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">
                      Channel
                    </dt>
                    <dd className="text-text-secondary font-mono">
                      {connection.incoming_webhook_channel ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">
                      Connected at
                    </dt>
                    <dd className="text-text-secondary">
                      {formatDate(connection.connected_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">
                      Team ID
                    </dt>
                    <dd className="text-text-secondary font-mono break-all">
                      {connection.slack_team_id}
                    </dd>
                  </div>
                  {connection.last_posted_at && (
                    <div>
                      <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">
                        Last posted
                      </dt>
                      <dd className="text-text-secondary">
                        {formatDate(connection.last_posted_at)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={sendTest.isPending}
                  onPress={() => sendTest.mutate()}
                >
                  <Send size={14} className="mr-1" />
                  {sendTest.isPending ? 'Sending…' : 'Test message'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isDisabled={disconnect.isPending}
                  onPress={() => disconnect.mutate()}
                >
                  {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <Chip variant="soft" color="default" size="sm">
                  Disconnected
                </Chip>
                <p className="text-label text-text-muted mt-2">
                  Connect Slack so your team sees compliance, job, and invoice
                  events in real time.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                isDisabled={
                  !clientIdConfigured ||
                  startAuthorize.isPending ||
                  completeCallback.isPending
                }
                onPress={handleConnect}
              >
                {completeCallback.isPending
                  ? 'Connecting…'
                  : startAuthorize.isPending
                    ? 'Redirecting…'
                    : 'Connect Slack'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Notification preferences */}
      {connection && (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
            <Bell size={16} className="text-text-muted" />
            <Heading level={2} scale="body">
              Notification Preferences
            </Heading>
          </div>
          <div className="px-6 py-5">
            <p className="text-caption text-text-muted mb-4">
              Choose which event types are posted to Slack. Use{' '}
              <em>Override channel</em> to route specific types (e.g. all
              compliance alerts) to a dedicated channel.
            </p>
            <div className="overflow-x-auto">
              <table aria-label="Slack notification preferences" className="w-full text-label">
                  <thead><tr>
                    <th className="text-left py-2 pr-4 font-medium text-micro uppercase tracking-[0.04em] text-text-muted">Event</th>
                    <th className="text-left py-2 pr-4 font-medium text-micro uppercase tracking-[0.04em] text-text-muted w-[90px]">Enabled</th>
                    <th className="text-left py-2 pr-4 font-medium text-micro uppercase tracking-[0.04em] text-text-muted w-[200px]">
                      Severity threshold
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-micro uppercase tracking-[0.04em] text-text-muted w-[220px]">
                      Override channel
                    </th>
                  </tr></thead>
                  <tbody>
                    {ORDERED_TYPES.map((type) => {
                      const setting = settingFor(type)
                      const enabled = setting?.enabled ?? true
                      const threshold =
                        (setting?.severity_threshold as SlackSeverity) ?? 'info'
                      const draft = channelDrafts[type] ?? ''
                      return (
                        <tr
                          key={type}
                          id={type}
                          className="border-b border-border-subtle last:border-0"
                        >
                          <td className="py-3 pr-4 text-text-primary font-medium">
                            {NOTIFICATION_TYPE_LABEL[type]}
                            <p className="text-micro text-text-muted font-normal mt-0.5">
                              <code>{type}</code>
                            </p>
                          </td>
                          <td className="py-3 pr-4">
                            <Switch
                              size="sm"
                              isSelected={enabled}
                              onChange={() =>
                                updateSetting.mutate({
                                  notification_type: type,
                                  enabled: !enabled,
                                })
                              }
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <FormSelect<SlackSeverity>
                              ariaLabel={`Severity threshold for ${type}`}
                              value={threshold}
                              onChange={(v) =>
                                updateSetting.mutate({
                                  notification_type: type,
                                  severity_threshold: v,
                                })
                              }
                              options={SEVERITY_OPTIONS.map((opt) => ({ value: opt.key as SlackSeverity, label: opt.label }))}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <input
                              type="text"
                              aria-label={`Override channel for ${type}`}
                              placeholder="#alerts (optional)"
                              value={draft}
                              onChange={(e) =>
                                setChannelDrafts((d) => ({
                                  ...d,
                                  [type]: e.target.value,
                                }))
                              }
                              onBlur={() => {
                                const trimmed = draft.trim() || null
                                if (trimmed === (setting?.custom_channel ?? null)) return
                                updateSetting.mutate({
                                  notification_type: type,
                                  custom_channel: trimmed,
                                })
                              }}
                              className="w-full border border-border-default rounded-lg px-2 py-1.5 text-[12.5px] bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Activity size={16} className="text-text-muted" />
          <Heading level={2} scale="body">
            Recent Activity
          </Heading>
        </div>
        <div className="px-6 py-5">
          {log.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <RefreshCw
                size={28}
                strokeWidth={1.5}
                className="text-text-muted mb-3"
              />
              <p className="text-label text-text-muted">
                No Slack activity yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {log.map((row) => {
                const color =
                  row.status === 'sent'
                    ? 'success'
                    : row.status === 'skipped'
                      ? 'default'
                      : 'danger'
                return (
                  <li
                    key={row.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Chip variant="soft" color={color} size="sm">
                        {row.status}
                      </Chip>
                      <div className="min-w-0">
                        <p className="text-label font-medium text-text-primary truncate">
                          {row.notification_type ?? '—'}
                        </p>
                        {row.error && (
                          <p className="text-caption text-status-overdue truncate">
                            {row.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <Text scale="caption" as="span" tone="muted" className="shrink-0">
                      {formatDate(row.created_at)}
                    </Text>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
