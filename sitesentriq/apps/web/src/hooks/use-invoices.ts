import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { logTimelineEvent } from '@/lib/timeline'
import { TIMELINE_EVENT_TYPES } from '@/lib/constants'
import type { Invoice, InvoiceLine } from '@haumea/types'
import type { AccountingProvider } from '@/lib/integrations/accounting/types'

interface InvoiceFilters {
  status?: string
  client_id?: string
  property_id?: string
}

export function useInvoices(filters?: InvoiceFilters) {
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*, clients(name, contact_email, billing_email)')
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.client_id) {
        query = query.eq('client_id', filters.client_id)
      }
      if (filters?.property_id) {
        query = query.eq('property_id', filters.property_id)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, clients(name, contact_email, billing_email), invoice_lines(*), payments(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      if (data?.invoice_lines) {
        data.invoice_lines.sort((a: InvoiceLine, b: InvoiceLine) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      }
      return data
    },
    enabled: !!id,
  })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ lines, ...invoice }: Partial<Invoice> & { lines?: { description: string; quantity: number; unit_price: number }[] }) => {
      const { data, error } = await supabase
        .from('invoices')
        .insert(invoice)
        .select()
        .single()
      if (error) throw error

      if (lines?.length) {
        const lineItems = lines.map((line, index) => ({
          invoice_id: data.id,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          total: line.quantity * line.unit_price,
          sort_order: index,
        }))
        const { error: lineError } = await supabase.from('invoice_lines').insert(lineItems)
        if (lineError) {
          // Roll back the just-created header so a failed line insert doesn't
          // leave a phantom zero-line invoice in lists/totals. Mirrors
          // useCreateQuote's compensation.
          await supabase.from('invoices').delete().eq('id', data.id)
          throw lineError
        }
      }

      return data
    },
    onSuccess: (data) => {
      toast.success('Invoice created successfully')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      // Auto-trigger: log timeline event when invoice is created
      if (data) {
        const orgId = data.organisation_id
        if (orgId) {
          logTimelineEvent({
            orgId,
            clientId: data.client_id,
            eventType: TIMELINE_EVENT_TYPES.INVOICE_ISSUED,
            description: `Invoice ${data.invoice_number || data.id} issued`,
          })
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create invoice')
    },
  })
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Invoice> & { id: string }) => {
      // Snapshot previous status before updating, so we can detect draft -> sent.
      const { data: prev } = await supabase
        .from('invoices')
        .select('status, organisation_id')
        .eq('id', id)
        .maybeSingle()

      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      // Auto-push trigger: when status flips draft -> sent, fire-and-forget
      // a push to whichever accounting provider is connected with auto_push_on_sent enabled.
      // Defensive: never blocks or fails the update.
      if (prev?.status === 'draft' && updates.status === 'sent') {
        try {
          await maybeAutoPushInvoice(id)
        } catch {
          // Ignore — auto-push is best-effort.
        }
      }

      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Invoice updated successfully')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update invoice')
    },
  })
}

/**
 * Push a Facilities OS invoice to the connected accounting provider (Xero or QuickBooks).
 * Calls the corresponding Edge Function. Always returns; surfaces errors via toast.
 */
export function usePushInvoiceToAccounting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoice_id, provider }: { invoice_id: string; provider: AccountingProvider }) => {
      const fnName = provider === 'xero' ? 'xero-push-invoice' : 'quickbooks-push-invoice'
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { invoice_id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: (_, variables) => {
      toast.success(`Pushed to ${variables.provider === 'xero' ? 'Xero' : 'QuickBooks'}`)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['accounting-sync-log'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to push invoice')
      // A failed push still wrote state (accounting_status='error' + a sync-log
      // row) — refresh so the chip/panel show the failure immediately.
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-sync-log'] })
    },
  })
}

// Best-effort auto-push: pick whichever provider has auto_push_on_sent enabled.
async function maybeAutoPushInvoice(invoiceId: string): Promise<void> {
  const { data: xero } = await supabase
    .from('xero_connections')
    .select('auto_push_on_sent, disconnected_at')
    .is('disconnected_at', null)
    .maybeSingle()
  if (xero?.auto_push_on_sent) {
    void supabase.functions.invoke('xero-push-invoice', { body: { invoice_id: invoiceId } })
    return
  }
  const { data: qb } = await supabase
    .from('quickbooks_connections')
    .select('auto_push_on_sent, disconnected_at')
    .is('disconnected_at', null)
    .maybeSingle()
  if (qb?.auto_push_on_sent) {
    void supabase.functions.invoke('quickbooks-push-invoice', { body: { invoice_id: invoiceId } })
  }
}

/**
 * Critical-fix #4: Mark Paid was only updating invoices.status / paid_date,
 * leaving the payments table empty for these invoices and breaking
 * reconciliation. This hook keeps the user-visible behaviour the same
 * (one button click → invoice flips to paid) but ALSO writes a payments
 * row for the full invoice total.
 *
 * We do it client-side with a manual rollback because the schema doesn't
 * ship a `mark_invoice_paid_atomic` RPC and we explicitly don't want to
 * migrate schema for this fix. Order matters: payment first, invoice
 * second — if the invoice update fails after the payment is written we
 * delete the payment to avoid double-counting on retry.
 */
export function useMarkInvoicePaid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      organisation_id,
      total,
      paid_at,
      payment_method = 'other',
      reference = 'Marked paid manually',
    }: {
      id: string
      organisation_id: string
      total: number
      paid_at?: string
      payment_method?: string
      reference?: string
    }) => {
      const paidAtIso = paid_at ?? new Date().toISOString()
      const paidDate = toLocalYmd(new Date(paidAtIso))

      // Insert payment first so a failed invoice update is recoverable.
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .insert({
          invoice_id: id,
          organisation_id,
          amount: total,
          paid_at: paidAtIso,
          payment_method,
          reference,
        })
        .select()
        .single()
      if (payErr) throw payErr

      // Now flip the invoice. If this fails, roll back the payment so we
      // don't accumulate phantom rows on retry.
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_date: paidDate })
        .eq('id', id)
        .select()
        .single()

      if (invErr) {
        if (payment?.id) {
          // Best-effort rollback. We log but don't surface so the user
          // sees the original failure.
          const { error: delErr } = await supabase
            .from('payments')
            .delete()
            .eq('id', payment.id)
          if (delErr) {
            console.warn('useMarkInvoicePaid: rollback failed', delErr.message)
          }
        }
        throw invErr
      }

      return { invoice, payment }
    },
    onSuccess: (_, variables) => {
      toast.success('Invoice marked as paid')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['payments', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark invoice as paid')
    },
  })
}

/**
 * Manual payment recording — used by the "Add payment" modal on the
 * invoice detail page. Useful for partial payments, refunds, or
 * out-of-band reconciliation. Deliberately does NOT flip invoice status —
 * that's a separate decision (the user might be recording a deposit).
 */
export function useCreatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      invoice_id: string
      organisation_id: string
      amount: number
      paid_at?: string
      payment_method?: string
      reference?: string
    }) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          invoice_id: input.invoice_id,
          organisation_id: input.organisation_id,
          amount: input.amount,
          paid_at: input.paid_at ?? new Date().toISOString(),
          payment_method: input.payment_method ?? 'other',
          reference: input.reference ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Payment recorded')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['payments', variables.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to record payment')
    },
  })
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Invoice deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete invoice')
    },
  })
}

export function useBulkDeleteInvoices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('invoices').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} invoice${ids.length !== 1 ? 's' : ''} deleted`)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete invoices')
    },
  })
}
