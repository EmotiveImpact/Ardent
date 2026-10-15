// React Query hooks for the Slack integration settings page.
// Reads from slack_connections / slack_notification_settings / slack_post_log
// (RLS-scoped reads) and exposes mutations that go through the
// `slack-oauth` and `slack-post-notification` edge functions.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type {
  SlackConnection,
  SlackNotificationSetting,
  SlackPostLogRow,
  SlackSeverity,
} from './types'

// ── Connection ───────────────────────────────────────────────

export function useSlackConnection() {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['slack-connection', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return null
      const { data, error } = await supabase
        .from('slack_connections')
        .select(
          'id, organisation_id, slack_team_id, slack_team_name, bot_user_id, scope, ' +
            'incoming_webhook_channel, incoming_webhook_channel_id, connected_by_user_id, ' +
            'connected_at, last_posted_at, disconnected_at, created_at',
        )
        .eq('organisation_id', organisation.id)
        .is('disconnected_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as SlackConnection | null) ?? null
    },
    enabled: !!organisation?.id,
  })
}

// ── Per-type settings ────────────────────────────────────────

export function useSlackNotificationSettings() {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['slack-settings', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('slack_notification_settings')
        .select('*')
        .eq('organisation_id', organisation.id)
        .order('notification_type', { ascending: true })
      if (error) throw error
      return (data ?? []) as SlackNotificationSetting[]
    },
    enabled: !!organisation?.id,
  })
}

interface UpdateSettingPayload {
  notification_type: string
  enabled?: boolean
  custom_channel?: string | null
  severity_threshold?: SlackSeverity
}

export function useUpdateSlackSetting() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()
  return useMutation({
    mutationFn: async (payload: UpdateSettingPayload) => {
      if (!organisation?.id) throw new Error('No organisation')
      const updates: Record<string, unknown> = {}
      if (payload.enabled !== undefined) updates.enabled = payload.enabled
      if (payload.custom_channel !== undefined) updates.custom_channel = payload.custom_channel
      if (payload.severity_threshold !== undefined) {
        updates.severity_threshold = payload.severity_threshold
      }
      const { error } = await supabase
        .from('slack_notification_settings')
        .update(updates)
        .eq('organisation_id', organisation.id)
        .eq('notification_type', payload.notification_type)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-settings'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save Slack setting')
    },
  })
}

// ── Post log ─────────────────────────────────────────────────

export function useSlackPostLog(limit = 20) {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['slack-log', organisation?.id, limit],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('slack_post_log')
        .select('*')
        .eq('organisation_id', organisation.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as SlackPostLogRow[]
    },
    enabled: !!organisation?.id,
  })
}

// ── OAuth mutations ──────────────────────────────────────────

export function useStartSlackAuthorize() {
  return useMutation({
    mutationFn: async (redirectUri: string) => {
      const { data, error } = await supabase.functions.invoke('slack-oauth', {
        body: { action: 'authorize', redirectUri },
      })
      if (error) throw error
      if (data?.error && data.error !== 'SLACK_NOT_CONFIGURED') throw new Error(data.error)
      return data as { url?: string; state?: string; error?: string }
    },
  })
}

interface CallbackPayload {
  code: string
  redirectUri: string
}

export function useCompleteSlackCallback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CallbackPayload) => {
      const { data, error } = await supabase.functions.invoke('slack-oauth', {
        body: { action: 'callback', ...payload },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-connection'] })
      queryClient.invalidateQueries({ queryKey: ['slack-settings'] })
      queryClient.invalidateQueries({ queryKey: ['slack-log'] })
      toast.success('Slack connected')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to connect Slack')
    },
  })
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('slack-oauth', {
        body: { action: 'disconnect' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-connection'] })
      queryClient.invalidateQueries({ queryKey: ['slack-log'] })
      toast.success('Slack disconnected')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to disconnect Slack')
    },
  })
}

// ── Test message ─────────────────────────────────────────────

export function useSendSlackTestMessage() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()
  return useMutation({
    mutationFn: async () => {
      if (!organisation?.id) throw new Error('No organisation')
      const { data, error } = await supabase.functions.invoke('slack-post-notification', {
        body: {
          org_id: organisation.id,
          type: 'job_completed',
          title: 'Slack test message',
          body:
            'This is a test from *Facilities OS*. If you can read this, your Slack connection is working.',
          link: `${window.location.origin}/dashboard/integrations/slack`,
          severity: 'success',
          context: { client: organisation.name ?? 'Facilities OS' },
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-log'] })
      toast.success('Test message sent')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to send test message')
    },
  })
}
