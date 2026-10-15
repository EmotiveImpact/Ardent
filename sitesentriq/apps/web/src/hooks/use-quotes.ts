import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'
import { logTimelineEvent } from '@/lib/timeline'
import { NOTIFICATION_TYPES, TIMELINE_EVENT_TYPES } from '@/lib/constants'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import type { Quote, QuoteLine, QuoteRevision } from '@haumea/types'

interface QuoteFilters {
  status?: string
  client_id?: string
  property_id?: string
}

export function useQuotes(filters?: QuoteFilters) {
  return useQuery({
    queryKey: ['quotes', filters],
    queryFn: async () => {
      let query = supabase
        .from('quotes')
        .select('*, clients(name, contact_email), properties(name)')
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

export function useQuote(id: string) {
  return useQuery({
    queryKey: ['quotes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, clients(name, contact_email), properties(name), quote_lines(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      // Sort quote_lines by sort_order client-side
      if (data?.quote_lines) {
        data.quote_lines.sort((a: QuoteLine, b: QuoteLine) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      }
      return data
    },
    enabled: !!id,
  })
}

export function useQuoteRevisions(quoteId?: string) {
  return useQuery({
    queryKey: ['quote_revisions', quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_revisions')
        .select('*')
        .eq('quote_id', quoteId!)
        .order('revision_number', { ascending: false })
      if (error) {
        if (/schema cache|does not exist|quote_revisions/i.test(error.message)) return []
        throw error
      }
      return (data ?? []) as QuoteRevision[]
    },
  })
}

/**
 * The invoice (if any) already drafted from this quote — looked up by the
 * invoices.quote_id link. Used by the quote-detail page to show a "View
 * Invoice" link instead of letting the user draft a duplicate.
 */
export function useInvoiceForQuote(quoteId?: string) {
  return useQuery({
    queryKey: ['invoice_for_quote', quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('quote_id', quoteId!)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; invoice_number: string } | null
    },
  })
}

export function useCreateQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ lines, ...quote }: Partial<Quote> & {
      lines?: {
        description: string
        quantity: number
        unit_price: number
        cost_price?: number
        markup_percent?: number
        tax_rate?: number
      }[]
    }) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert(quote)
        .select()
        .single()
      if (error) throw error

      if (lines?.length) {
        const lineItems = lines.map((line, index) => ({
          quote_id: data.id,
          description: line.description,
          quantity: line.quantity,
          cost_price: line.cost_price ?? line.unit_price,
          markup_percent: line.markup_percent ?? 0,
          tax_rate: line.tax_rate ?? 20,
          unit_price: line.unit_price,
          total: line.quantity * line.unit_price,
          sort_order: index,
        }))
        const { error: lineError } = await supabase.from('quote_lines').insert(lineItems)
        if (lineError) {
          await supabase.from('quotes').delete().eq('id', data.id)
          throw lineError
        }
      }

      return data
    },
    onSuccess: (data) => {
      toast.success('Quote created successfully')
      queryClient.invalidateQueries({ queryKey: ['quotes'] })

      // Auto-trigger: log timeline event for quote creation
      if (data) {
        const orgId = data.organisation_id
        if (orgId) {
          logTimelineEvent({
            orgId,
            eventType: TIMELINE_EVENT_TYPES.QUOTE_SENT,
            description: `Quote ${data.quote_number || data.id} created`,
          }).catch(console.error)
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create quote')
    },
  })
}

/**
 * Portal client approve/reject. Goes through the SECURITY DEFINER RPC
 * `client_set_quote_decision` (status-only, state-guarded, client-scoped) instead
 * of a broad `.update()` — a client_admin's direct UPDATE on quotes is blocked by
 * RLS (migration 00108), so they can't tamper with total/tax/other columns. The
 * RPC fires the operator timeline event + notification server-side.
 */
export function useClientQuoteDecision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ quoteId, decision }: { quoteId: string; decision: 'approved' | 'rejected' }) => {
      const { error } = await supabase.rpc('client_set_quote_decision', {
        p_quote_id: quoteId,
        p_decision: decision,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      queryClient.invalidateQueries({ queryKey: ['quotes', variables.quoteId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit your decision')
    },
  })
}

export function useUpdateQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Quote> & { id: string }) => {
      const { data, error } = await supabase
        .from('quotes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data, variables) => {
      toast.success('Quote updated successfully')
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      queryClient.invalidateQueries({ queryKey: ['quotes', variables.id] })

      // Auto-trigger: on approval or rejection, notify org and log timeline
      if (data) {
        const orgId = data.organisation_id
        const propertyId = data.property_id
        const status = variables.status as string | undefined

        if (status === 'approved' && orgId) {
          logTimelineEvent({
            orgId,
            propertyId,
            clientId: data.client_id,
            eventType: TIMELINE_EVENT_TYPES.QUOTE_APPROVED,
            description: `Quote ${data.quote_number || data.id} approved`,
          })

          // Only notify a real recipient — created_by was historically unset, so
          // `?? ''` produced an invalid-uuid insert that was silently swallowed.
          if (data.created_by) {
            createNotification({
              userId: data.created_by,
              orgId,
              type: NOTIFICATION_TYPES.QUOTE_APPROVED,
              title: 'Quote approved',
              message: `Quote ${data.quote_number || data.id} has been approved`,
            })
          }
        }

        if (status === 'rejected' && orgId) {
          logTimelineEvent({
            orgId,
            propertyId,
            clientId: data.client_id,
            eventType: TIMELINE_EVENT_TYPES.QUOTE_REJECTED,
            description: `Quote ${data.quote_number || data.id} rejected`,
          })

          if (data.created_by) {
            createNotification({
              userId: data.created_by,
              orgId,
              type: NOTIFICATION_TYPES.QUOTE_REJECTED,
              title: 'Quote rejected',
              message: `Quote ${data.quote_number || data.id} has been rejected`,
            })
          }
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update quote')
    },
  })
}

export function useCreateQuoteRevision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      quote,
      reason,
      created_by,
    }: {
      quote: Quote & { quote_lines?: QuoteLine[] }
      reason?: string
      created_by?: string
    }) => {
      const { data: existing, error: countError } = await supabase
        .from('quote_revisions')
        .select('revision_number')
        .eq('quote_id', quote.id)
        .order('revision_number', { ascending: false })
        .limit(1)
      if (countError) throw countError

      const revision_number = ((existing?.[0]?.revision_number as number | undefined) ?? 0) + 1
      const { data, error } = await supabase
        .from('quote_revisions')
        .insert({
          organisation_id: quote.organisation_id,
          quote_id: quote.id,
          revision_number,
          reason: reason || null,
          status_snapshot: quote.status,
          total_snapshot: quote.total,
          payload: quote,
          created_by: created_by || null,
        })
        .select()
        .single()
      if (error) throw error
      return data as QuoteRevision
    },
    onSuccess: (revision) => {
      toast.success(`Revision ${revision.revision_number} saved`)
      queryClient.invalidateQueries({ queryKey: ['quote_revisions', revision.quote_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save quote revision')
    },
  })
}

export function useDeleteQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Quote deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete quote')
    },
  })
}

/**
 * Sprint 2B — convert an approved quote into an invoice in one
 * mutation. Mirrors the line items 1:1 (description / quantity /
 * unit_price / total / sort_order), inherits the quote's tax rate
 * onto the invoice line totals, and links the new invoice back to
 * the originating quote via invoices.quote_id so the audit trail is
 * intact.
 *
 * Behaviour:
 *   - The invoice is created in 'draft' status — the user reviews,
 *     adjusts the due date if needed, then explicitly sends. We do
 *     NOT auto-send because invoices that go to clients should always
 *     have a human in the loop on first send.
 *   - The source quote is moved to 'converted' status (same terminal
 *     state useConvertQuoteToJob uses). Once converted, the quote
 *     can't be invoiced again — duplicate invoices are far more
 *     painful to clean up than a rare "I needed two".
 *   - Numbering: invoice_number is left to the DB default if there's
 *     a sequence/trigger; otherwise we fall back to "INV-{quote_number}"
 *     so it's traceable.
 *   - Default due_date: 30 days from today. Most clients are Net 30
 *     and the user can edit before sending.
 */
export function useConvertQuoteToInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (quote: {
      id: string
      quote_number: string
      organisation_id: string
      client_id: string
      total: number
      tax?: number
    }) => {
      // Idempotency guard: a quote should yield AT MOST one invoice. The
      // converted-quote UI can re-trigger this (repeat presses, or invoicing
      // after a convert-to-job), and invoice_number has historically had no
      // unique constraint — so without this, each press created a duplicate
      // `INV-{quote_number}`. If an invoice already exists for this quote,
      // return it (the caller navigates to it) instead of creating another.
      const { data: existingInvoice, error: existingInvoiceErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('quote_id', quote.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (existingInvoiceErr) throw existingInvoiceErr
      if (existingInvoice) return existingInvoice

      // Pull lines so we can replicate them onto the invoice.
      const { data: lines, error: linesErr } = await supabase
        .from('quote_lines')
        .select('description, quantity, unit_price, total, sort_order')
        .eq('quote_id', quote.id)
        .order('sort_order', { ascending: true })
      if (linesErr) throw linesErr

      // Default Net 30. Computed in the browser's local time, then
      // serialised to ISO date so server-side renders consistently.
      const due = new Date()
      due.setDate(due.getDate() + 30)
      const dueDate = toLocalYmd(due)

      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          organisation_id: quote.organisation_id,
          client_id: quote.client_id,
          quote_id: quote.id,
          invoice_number: `INV-${quote.quote_number}`,
          status: 'draft',
          // Carry the quote's FULL breakdown onto the invoice header so it
          // reconciles: subtotal + tax = total. There is no invoice tax-recompute
          // trigger, so leaving subtotal=0 made the detail page + PDF render
          // "Subtotal £0 · VAT (NaN%) · Total £X" (0 isn't nullish so the line-sum
          // fallback never fired). Derive subtotal = total − tax.
          subtotal: Math.max(0, Math.round(((quote.total ?? 0) - (quote.tax ?? 0)) * 100) / 100),
          tax: quote.tax ?? 0,
          total: quote.total,
          due_date: dueDate,
        })
        .select()
        .single()
      if (invErr) throw invErr

      // Replicate lines if any. Fail-closed: roll back the invoice
      // insert if line creation fails so we don't leave an empty
      // invoice in the system.
      if (lines && lines.length > 0) {
        const lineRows = lines.map((l, idx) => ({
          invoice_id: invoice.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          total: l.total,
          sort_order: l.sort_order ?? idx,
        }))
        const { error: lineErr } = await supabase.from('invoice_lines').insert(lineRows)
        if (lineErr) {
          await supabase.from('invoices').delete().eq('id', invoice.id)
          throw lineErr
        }
      }

      // Mark the quote as converted so it doesn't get invoiced twice.
      const { error: quoteErr } = await supabase
        .from('quotes')
        .update({ status: 'converted' })
        .eq('id', quote.id)
      if (quoteErr) {
        // Don't roll back the invoice — the quote status is recoverable
        // by hand and the invoice itself is the artifact the user wants.
        console.warn('[useConvertQuoteToInvoice] could not mark quote as converted:', quoteErr.message)
      }

      // Timeline event so the client + property timelines pick this up.
      logTimelineEvent({
        orgId: invoice.organisation_id,
        clientId: invoice.client_id,
        eventType: TIMELINE_EVENT_TYPES.INVOICE_ISSUED,
        description: `Invoice ${invoice.invoice_number} drafted from quote ${quote.quote_number}`,
      }).catch(console.error)

      return invoice
    },
    onSuccess: (_invoice, quote) => {
      toast.success('Invoice drafted from quote')
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      // Also refresh the quote-detail query the user may be sitting on, so its
      // status flips to "converted" and the Convert button disables (prevents a
      // second conversion → second invoice).
      if (quote?.id) {
        queryClient.invalidateQueries({ queryKey: ['quotes', quote.id] })
        // Flip the detail page's button to "View Invoice".
        queryClient.invalidateQueries({ queryKey: ['invoice_for_quote', quote.id] })
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to convert quote to invoice')
    },
  })
}

/**
 * Critical Fix #2 — convert an approved quote into a job.
 *
 * The previous implementation dropped two things that downstream
 * systems rely on:
 *
 *   1. client_id — without it the new job is orphaned from client
 *      filters AND the job-completion-email edge function can't
 *      resolve a recipient (it joins jobs → properties → clients to
 *      pull billing_email/contact_email). Carry it across explicitly.
 *
 *   2. The quote's line items — which are the actual scope of work
 *      the customer signed off on. Dropping them means the engineer
 *      arrives blind. We replicate them as job_tasks rows so they
 *      show up in the job detail view alongside any tasks an engineer
 *      adds in the field. Description-only is enough; outcome /
 *      completed_at get filled in during the visit.
 *
 * If task creation fails we roll back the job insert so we don't
 * leave a job in the system without its scope. The quote-status
 * update is best-effort (mirrors useConvertQuoteToInvoice) — the job
 * is the user-visible artifact, the quote status is recoverable by
 * hand.
 */
export function useConvertQuoteToJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (quote: {
      id: string
      quote_number: string
      property_id?: string
      organisation_id: string
      client_id: string
      job_id?: string | null
    }) => {
      // Pull the quote's line items first so a fetch error fails
      // closed before we create any rows.
      const { data: lines, error: linesErr } = await supabase
        .from('quote_lines')
        .select('description, sort_order')
        .eq('quote_id', quote.id)
        .order('sort_order', { ascending: true })
      if (linesErr) throw linesErr

      // Create the job, carrying client_id across so client filters
      // and the completion-email edge function work.
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          title: `Job from ${quote.quote_number}`,
          property_id: quote.property_id,
          client_id: quote.client_id,
          organisation_id: quote.organisation_id,
          status: 'scheduled',
          priority: 'medium',
          // Link the remedial job back to the task the quote was raised from.
          parent_job_id: quote.job_id ?? null,
        })
        .select()
        .single()
      if (jobError) throw jobError

      // Replicate quote lines as job_tasks so the engineer sees the
      // agreed scope. job_tasks has no sort_order column — useJobTasks
      // orders by created_at — so we insert in the order returned by
      // the sort_order-ordered select above and rely on the DB to
      // assign created_at in insert order. Roll back the job if task
      // creation fails: a job without its scope is worse than no job.
      if (lines && lines.length > 0) {
        const taskRows = lines.map((l) => ({
          job_id: job.id,
          organisation_id: quote.organisation_id,
          description: l.description,
        }))
        const { error: taskErr } = await supabase.from('job_tasks').insert(taskRows)
        if (taskErr) {
          await supabase.from('jobs').delete().eq('id', job.id)
          throw taskErr
        }
      }

      // Update quote status to converted (best-effort — mirrors
      // useConvertQuoteToInvoice's behaviour).
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({ status: 'converted' })
        .eq('id', quote.id)
      if (quoteError) {
        console.warn('[useConvertQuoteToJob] could not mark quote as converted:', quoteError.message)
      }

      return job
    },
    onSuccess: (_job, quote) => {
      toast.success('Quote converted to job successfully')
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      // Refresh the quote-detail query so its status flips to "converted" and
      // the Convert button disables (prevents a second conversion → second job).
      if (quote?.id) queryClient.invalidateQueries({ queryKey: ['quotes', quote.id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to convert quote to job')
    },
  })
}
