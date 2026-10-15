// Shared types for the Slack integration.
// Mirrors the columns of slack_connections / slack_notification_settings /
// slack_post_log defined in supabase/migrations/00028_slack.sql.

export type SlackSeverity = 'info' | 'success' | 'warning' | 'critical'

export type SlackPostStatus = 'sent' | 'failed' | 'skipped'

export interface SlackConnection {
  id: string
  organisation_id: string
  slack_team_id: string
  slack_team_name: string | null
  bot_user_id: string | null
  scope: string | null
  incoming_webhook_channel: string | null
  incoming_webhook_channel_id: string | null
  // access_token + incoming_webhook_url are not selected client-side — server only.
  connected_by_user_id: string | null
  connected_at: string
  last_posted_at: string | null
  disconnected_at: string | null
  created_at: string
}

export interface SlackNotificationSetting {
  id: string
  organisation_id: string
  notification_type: string
  enabled: boolean
  custom_channel: string | null
  severity_threshold: SlackSeverity
  created_at: string
  updated_at: string
}

export interface SlackPostLogRow {
  id: string
  organisation_id: string
  notification_type: string | null
  status: SlackPostStatus
  error: string | null
  slack_message_ts: string | null
  channel: string | null
  created_at: string
}
