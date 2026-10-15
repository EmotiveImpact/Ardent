// React Query hooks for accounting integrations.
// Reads from the connection + sync log tables (RLS-scoped),
// and exposes mutations to disconnect / update settings via Edge Functions.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type {
  XeroConnection,
  QuickBooksConnection,
  AccountingSyncLogRow,
  AccountingProvider,
} from './types'

// ── Connections ──────────────────────────────────────────────

export function useXeroConnection() {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['xero-connection', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return null
      const { data, error } = await supabase
        .from('xero_connections')
        .select('*')
        .eq('organisation_id', organisation.id)
        .is('disconnected_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as XeroConnection | null) ?? null
    },
    enabled: !!organisation?.id,
  })
}

export function useQuickBooksConnection() {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['quickbooks-connection', organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) return null
      const { data, error } = await supabase
        .from('quickbooks_connections')
        .select('*')
        .eq('organisation_id', organisation.id)
        .is('disconnected_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as QuickBooksConnection | null) ?? null
    },
    enabled: !!organisation?.id,
  })
}

// ── Sync log ─────────────────────────────────────────────────

export function useAccountingSyncLog(provider: AccountingProvider, limit = 20) {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['accounting-sync-log', organisation?.id, provider, limit],
    queryFn: async () => {
      if (!organisation?.id) return []
      const { data, error } = await supabase
        .from('accounting_sync_log')
        .select('*')
        .eq('organisation_id', organisation.id)
        .eq('provider', provider)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AccountingSyncLogRow[]
    },
    enabled: !!organisation?.id,
  })
}

/** Per-invoice sync history (both providers) — powers the invoice detail's
 *  sync panel so a failed push is diagnosable without leaving the page. */
export function useInvoiceSyncLog(invoiceId: string | undefined, limit = 10) {
  const { organisation } = useAuthContext()
  return useQuery({
    queryKey: ['accounting-sync-log', 'invoice', invoiceId, limit],
    queryFn: async () => {
      if (!invoiceId) return []
      const { data, error } = await supabase
        .from('accounting_sync_log')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AccountingSyncLogRow[]
    },
    enabled: !!organisation?.id && !!invoiceId,
  })
}

// ── Mutations (call Edge Functions via supabase.functions.invoke) ──

interface OAuthExchangePayload {
  code: string
  redirectUri: string
}

export function useExchangeXeroCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OAuthExchangePayload) => {
      const { data, error } = await supabase.functions.invoke('xero-oauth', {
        body: { action: 'exchange', ...payload },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xero-connection'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-sync-log'] })
      toast.success('Connected to Xero')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to connect to Xero')
    },
  })
}

export function useExchangeQuickBooksCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: OAuthExchangePayload & { realmId: string }) => {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: { action: 'exchange', ...payload },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quickbooks-connection'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-sync-log'] })
      toast.success('Connected to QuickBooks')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to connect to QuickBooks')
    },
  })
}

export function useDisconnectXero() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('xero-oauth', {
        body: { action: 'disconnect' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xero-connection'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-sync-log'] })
      toast.success('Disconnected from Xero')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to disconnect Xero')
    },
  })
}

export function useDisconnectQuickBooks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: { action: 'disconnect' },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quickbooks-connection'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-sync-log'] })
      toast.success('Disconnected from QuickBooks')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to disconnect QuickBooks')
    },
  })
}

interface UpdateXeroSettingsPayload {
  auto_push_on_sent?: boolean
  default_tax_rate?: string | null
  default_account_code?: string | null
}

export function useUpdateXeroSettings() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()
  return useMutation({
    mutationFn: async (updates: UpdateXeroSettingsPayload) => {
      if (!organisation?.id) throw new Error('No organisation')
      // .select() so an RLS-blocked (zero-row) update surfaces as an error
      // instead of a silent success. The FOR UPDATE policy was added in 00087;
      // this guards against a future policy regression re-introducing the bug.
      const { data, error } = await supabase
        .from('xero_connections')
        .update(updates)
        .eq('organisation_id', organisation.id)
        .select('organisation_id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Settings did not save (no matching connection)')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xero-connection'] })
      toast.success('Xero settings saved')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save Xero settings')
    },
  })
}

interface UpdateQbSettingsPayload {
  auto_push_on_sent?: boolean
  default_tax_code_ref?: string | null
  default_income_account_ref?: string | null
}

export function useUpdateQuickBooksSettings() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()
  return useMutation({
    mutationFn: async (updates: UpdateQbSettingsPayload) => {
      if (!organisation?.id) throw new Error('No organisation')
      // .select() so an RLS-blocked (zero-row) update surfaces as an error
      // instead of a silent success (see 00087 + the Xero hook above).
      const { data, error } = await supabase
        .from('quickbooks_connections')
        .update(updates)
        .eq('organisation_id', organisation.id)
        .select('organisation_id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Settings did not save (no matching connection)')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quickbooks-connection'] })
      toast.success('QuickBooks settings saved')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save QuickBooks settings')
    },
  })
}
