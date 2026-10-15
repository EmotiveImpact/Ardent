import { useParams, useNavigate } from 'react-router'
import { Button, Chip, Input, Label, Modal, TextField } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader } from '@haumea/ui'
import { useState } from 'react'
import { Send, Check, X, Briefcase, Trash2, FileText, Download, GitBranch, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useQuote, useUpdateQuote, useDeleteQuote, useConvertQuoteToJob, useConvertQuoteToInvoice, useQuoteRevisions, useCreateQuoteRevision, useInvoiceForQuote } from '@/hooks/use-quotes'
import { formatCurrency, formatDate } from '@haumea/utils'
import { sendQuoteApproval } from '@/lib/email'
import { generateQuotePdf } from '@/lib/pdf'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { QUOTE_TYPES } from '@/lib/constants'
import type { QuoteLine } from '@haumea/types'

const STATUS_CHIP_COLOR: Record<string, 'default' | 'accent' | 'success' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
  converted: 'accent',
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [sendingEmail, setSendingEmail] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [revisionModalOpen, setRevisionModalOpen] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')
  const { data: quote, isLoading } = useQuote(id!)
  const { data: revisions } = useQuoteRevisions(id)
  const updateQuote = useUpdateQuote()
  const deleteQuote = useDeleteQuote()
  const convertToJob = useConvertQuoteToJob()
  const convertToInvoice = useConvertQuoteToInvoice()
  // If this quote already produced an invoice, we link to it instead of
  // letting the user draft a duplicate.
  const { data: existingInvoice } = useInvoiceForQuote(id)
  const createRevision = useCreateQuoteRevision()

  if (isLoading) return <DetailPageSkeleton withTabs={false} />

  if (!quote) return <p className="text-label text-text-muted">Quote not found.</p>

  const lines = quote.quote_lines || []
  const subtotal = lines.reduce((sum: number, l: QuoteLine) => sum + (l.total || 0), 0)
  const tax = lines.reduce(
    (sum: number, l: QuoteLine) => sum + (l.quantity || 0) * (l.unit_price || 0) * ((l.tax_rate ?? 20) / 100),
    0,
  )
  const total = subtotal + tax

  const handleStatusChange = async (status: string) => {
    updateQuote.mutate({ id: quote.id, status })

    // When sending the quote, also email the client
    if (status === 'sent') {
      const clientEmail = (quote.clients as { contact_email?: string } | undefined)?.contact_email
      if (!clientEmail) {
        toast.info('Quote status updated, but no client email found to send notification')
        return
      }
      setSendingEmail(true)
      try {
        const result = await sendQuoteApproval({
          to: clientEmail,
          clientName: quote.clients?.name || 'Client',
          quoteNumber: quote.quote_number,
          totalAmount: formatCurrency(total),
          validUntil: quote.valid_until ? formatDate(quote.valid_until) : undefined,
          propertyName: quote.properties?.name || undefined,
          approvalUrl: `${window.location.origin}/portal/quotes/${quote.id}`,
        })
        if (result.success) {
          toast.success('Quote sent to client via email')
        } else {
          toast.error('Quote updated but email could not be sent', {
            description: result.error || 'Edge Function may not be deployed',
          })
        }
      } catch (error) {
        toast.error('Quote updated but email could not be sent', {
          description: error instanceof Error ? error.message : 'Unexpected email failure',
        })
      } finally {
        setSendingEmail(false)
      }
    }
  }

  const handleDelete = () => {
    setConfirmDeleteOpen(true)
  }

  const handleConfirmDelete = () => {
    setConfirmDeleteOpen(false)
    deleteQuote.mutate(quote.id, { onSuccess: () => navigate('/dashboard/quotes') })
  }

  const handleSaveRevision = () => {
    setRevisionReason('')
    setRevisionModalOpen(true)
  }

  const handleSubmitRevision = () => {
    createRevision.mutate(
      {
        quote: { ...quote, quote_lines: lines },
        reason: revisionReason.trim(),
        created_by: profile?.id,
      },
      {
        onSettled: () => {
          setRevisionModalOpen(false)
          setRevisionReason('')
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Quotes', path: '/dashboard/quotes' },
        { label: quote.quote_number },
      ]} />

      <div className="flex items-center gap-4">
        <PageHeader title={quote.quote_number} />
        <Chip variant="soft" color={STATUS_CHIP_COLOR[quote.status] || 'default'} size="sm">
          {quote.status}
        </Chip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Client & Property</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Client</dt>
              <dd className="text-label text-text-secondary mt-0.5">{quote.clients?.name || '-'}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Property</dt>
              <dd className="text-label text-text-secondary mt-0.5">{quote.properties?.name || '-'}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Quote Type</dt>
              <dd className="text-label text-text-secondary mt-0.5">
                {quote.status === 'draft' ? (
                  <FormSelect<'defect_quote' | 'service_quote'>
                    value={(quote.quote_type as 'defect_quote' | 'service_quote') || 'defect_quote'}
                    onChange={(v) => updateQuote.mutate({ id: quote.id, quote_type: v })}
                    ariaLabel="Quote Type"
                    options={Object.entries(QUOTE_TYPES).map(([value, label]) => ({ value: value as 'defect_quote' | 'service_quote', label }))}
                  />
                ) : (
                  <Chip variant="soft" color={(quote.quote_type || 'defect_quote') === 'defect_quote' || quote.quote_type === 'reactive' ? 'warning' : 'accent'} size="sm">
                    {QUOTE_TYPES[quote.quote_type || 'defect_quote'] || quote.quote_type}
                  </Chip>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Created</dt>
              <dd className="text-label text-text-secondary mt-0.5">{formatDate(quote.created_at)}</dd>
            </div>
            {quote.valid_until && (
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Valid Until</dt>
                <dd className="text-label text-text-secondary mt-0.5">{formatDate(quote.valid_until)}</dd>
              </div>
            )}
          </dl>
        </AppCard>

        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                generateQuotePdf({
                  quote_number: quote.quote_number,
                  quote_type: quote.quote_type,
                  created_at: quote.created_at,
                  valid_until: quote.valid_until,
                  client_name: quote.clients?.name || 'Client',
                  property_name: quote.properties?.name,
                  notes: quote.notes,
                  lines,
                  subtotal,
                  tax,
                  total,
                })
              }
            >
              <Download size={14} />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={createRevision.isPending}
              onPress={handleSaveRevision}
            >
              <GitBranch size={14} />
              Save Revision
            </Button>
            {quote.status === 'draft' && (
              <Button
                variant="primary"
                size="sm"
                isDisabled={sendingEmail}
                onPress={() => handleStatusChange('sent')}
              >
                {!sendingEmail && <Send size={14} />} {sendingEmail ? 'Sending...' : 'Send Quote'}
              </Button>
            )}
            {quote.status === 'sent' && (
              <>
                <Button variant="primary" size="sm" onPress={() => handleStatusChange('approved')}>
                  <Check size={14} /> Approve
                </Button>
                <Button variant="secondary" size="sm" onPress={() => handleStatusChange('rejected')}>
                  <X size={14} /> Reject
                </Button>
              </>
            )}
            {quote.status === 'approved' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={convertToJob.isPending}
                  onPress={() => {
                    convertToJob.mutate(
                      {
                        id: quote.id,
                        quote_number: quote.quote_number,
                        property_id: quote.property_id,
                        organisation_id: quote.organisation_id,
                        client_id: quote.client_id,
                        job_id: (quote as { job_id?: string | null }).job_id ?? null,
                      },
                      {
                        onSuccess: (job) => {
                          navigate(`/dashboard/jobs/${job.id}`)
                        },
                      }
                    )
                  }}
                >
                  {!convertToJob.isPending && <Briefcase size={14} />}
                  {convertToJob.isPending ? 'Converting...' : 'Convert to Job'}
                </Button>
                {!existingInvoice && (
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={convertToInvoice.isPending}
                    onPress={() => {
                      convertToInvoice.mutate(
                        {
                          id: quote.id,
                          quote_number: quote.quote_number,
                          organisation_id: quote.organisation_id,
                          client_id: quote.client_id,
                          total: quote.total ?? 0,
                          tax: quote.tax ?? 0,
                        },
                        {
                          onSuccess: (invoice) => {
                            navigate(`/dashboard/invoices/${invoice.id}`)
                          },
                        }
                      )
                    }}
                  >
                    {!convertToInvoice.isPending && <ReceiptText size={14} />}
                    {convertToInvoice.isPending ? 'Drafting…' : 'Convert to Invoice'}
                  </Button>
                )}
              </>
            )}
            {/* This quote already has an invoice → link to it, never draft a
                second (invoices share INV-{quote_number}). */}
            {existingInvoice && (
              <Button
                variant="secondary"
                size="sm"
                onPress={() => navigate(`/dashboard/invoices/${existingInvoice.id}`)}
              >
                <ReceiptText size={14} /> View Invoice
              </Button>
            )}
            {quote.status === 'converted' && !existingInvoice && (
              <Button
                variant="secondary"
                size="sm"
                isDisabled={convertToInvoice.isPending}
                onPress={() => {
                  // Quote is 'converted' (from a Convert to Job press) but has
                  // no invoice yet — allow drafting one. The mutation is
                  // idempotent on quote_id, so a racing double-press still
                  // yields a single invoice.
                  convertToInvoice.mutate(
                    {
                      id: quote.id,
                      quote_number: quote.quote_number,
                      organisation_id: quote.organisation_id,
                      client_id: quote.client_id,
                      total: quote.total ?? 0,
                      tax: quote.tax ?? 0,
                    },
                    {
                      onSuccess: (invoice) => {
                        navigate(`/dashboard/invoices/${invoice.id}`)
                      },
                    }
                  )
                }}
              >
                {!convertToInvoice.isPending && <ReceiptText size={14} />}
                {convertToInvoice.isPending ? 'Drafting…' : 'Draft Invoice'}
              </Button>
            )}
            <Button variant="danger" size="sm" onPress={handleDelete}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </AppCard>
      </div>

      <AppCard padding="md">
        <h3 className="text-body font-semibold text-text-primary mb-4">Line Items</h3>
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <FileText size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
            <p className="text-label text-text-muted">No line items.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Quote Line Items" className="overflow-hidden">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Description</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Qty</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Cost</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Markup</th>
                  <th id="unitPrice" className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Unit Price</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
                </tr></thead>
                <tbody>
                  {lines.map((line: QuoteLine) => (
                    <tr key={line.id} id={line.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-label text-text-secondary">{line.description}</td>
                      <td className="px-4 py-3 text-label text-text-secondary text-right">{line.quantity}</td>
                      <td className="px-4 py-3 text-label text-text-secondary text-right">{formatCurrency(line.cost_price ?? line.unit_price)}</td>
                      <td className="px-4 py-3 text-label text-text-secondary text-right">{line.markup_percent ?? 0}%</td>
                      <td className="px-4 py-3 text-label font-medium text-text-primary text-right">{formatCurrency(line.unit_price)}</td>
                      <td className="px-4 py-3 text-label font-medium text-text-primary text-right">{formatCurrency(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
            </table>

            <div className="border-t border-border-subtle mt-2 pt-4 space-y-1 text-right">
              <div className="flex justify-end gap-8">
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Subtotal</span>
                <span className="text-label font-medium text-text-primary">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-end gap-8">
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Tax</span>
                <span className="text-label font-medium text-text-primary">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-end gap-8 pt-1">
                <span className="text-body font-semibold text-text-primary">Total</span>
                <span className="text-body font-semibold text-text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}
      </AppCard>

      {quote.notes && (
        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Notes</h3>
          <p className="text-label text-text-secondary whitespace-pre-wrap">{quote.notes}</p>
        </AppCard>
      )}

      <AppCard padding="md">
        <h3 className="text-body font-semibold text-text-primary mb-4">Revision History</h3>
        {!revisions?.length ? (
          <p className="text-label text-text-muted">No revisions saved yet.</p>
        ) : (
          <div className="space-y-2">
            {revisions.map((revision) => (
              <div key={revision.id} className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle px-3 py-2">
                <div>
                  <p className="text-label font-medium text-text-primary">Revision {revision.revision_number}</p>
                  <p className="text-caption text-text-muted">{revision.reason || 'No reason recorded'}</p>
                </div>
                <div className="text-right">
                  <p className="text-label font-medium text-text-primary">{formatCurrency(revision.total_snapshot ?? 0)}</p>
                  <p className="text-caption text-text-muted">{formatDate(revision.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Quote"
        message={`Are you sure you want to delete quote ${quote.quote_number}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <Modal.Backdrop
        isOpen={revisionModalOpen}
        onOpenChange={(next) => {
          if (!next) {
            setRevisionModalOpen(false)
            setRevisionReason('')
          }
        }}
      >
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Save quote revision</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField>
                <Label>Reason (optional)</Label>
                <Input
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="e.g. Adjusted pricing after site visit"
                  autoFocus
                />
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="tertiary"
                onPress={() => {
                  setRevisionModalOpen(false)
                  setRevisionReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={createRevision.isPending}
                onPress={handleSubmitRevision}
              >
                {createRevision.isPending ? 'Saving…' : 'Save revision'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
