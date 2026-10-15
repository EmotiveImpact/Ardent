import { useNavigate } from 'react-router'
import { Controller, useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { FormSelectController, LineItemInput, PageHeader } from '@haumea/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useClients } from '@/hooks/use-clients'
import { useQuotes } from '@/hooks/use-quotes'
import { useCreateInvoice } from '@/hooks/use-invoices'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAutosaveDraft } from '@/hooks/use-autosave-draft'
import type { Client, Quote } from '@haumea/types'
import { FormSkeleton } from '@/components/shared/skeletons'

const lineSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Min 1'),
  unit_price: z.number().min(0, 'Min 0'),
})

const invoiceSchema = z.object({
  client_id: z.string().min(1, 'Client is required'),
  quote_id: z.string().optional(),
  invoice_number: z.string().min(1, 'Invoice number is required'),
  due_date: z.string().optional(),
  tax_rate: z.number().min(0, 'Min 0').max(100, 'Max 100'),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
})

const round2 = (n: number) => Math.round(n * 100) / 100

type InvoiceFormData = z.infer<typeof invoiceSchema>

export default function NewInvoicePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createInvoice = useCreateInvoice()

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_number: `INV-${String(Date.now()).slice(-4)}`,
      tax_rate: 20,
      lines: [{ description: '', quantity: 1, unit_price: 0 }],
    },
  })
  const { register, handleSubmit, control, watch, formState: { errors } } = form
  const { clearDraft } = useAutosaveDraft(form, { key: 'draft:invoice:new' })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const selectedClientId = watch('client_id')
  const { data: clients, isLoading: clientsLoading } = useClients()
  const { data: approvedQuotes } = useQuotes(
    selectedClientId ? { status: 'approved', client_id: selectedClientId } : undefined
  )
  const watchedLines = watch('lines')

  const watchedTaxRate = watch('tax_rate')
  const subtotal = round2(watchedLines?.reduce((sum, l) => sum + (l.quantity || 0) * (l.unit_price || 0), 0) || 0)
  // valueAsNumber yields NaN (not undefined) when the field is cleared, and
  // typeof NaN === 'number' — so guard with Number.isFinite to fall back to the
  // 20% default instead of rendering "£NaN" / "Tax (NaN%)".
  const taxRate = Number.isFinite(watchedTaxRate) ? watchedTaxRate : 20
  const tax = round2(subtotal * (taxRate / 100))
  const total = round2(subtotal + tax)

  const onSubmit = (data: InvoiceFormData) => {
    const { lines, tax_rate, ...rest } = data
    // Compute from the SUBMITTED values (authoritative). There is no DB trigger on
    // invoices, so these stored amounts are the source of truth the detail page /
    // PDF / email read back.
    const sub = round2(lines.reduce((s, l) => s + (l.quantity || 0) * (l.unit_price || 0), 0))
    const lineTax = round2(sub * (tax_rate / 100))
    createInvoice.mutate(
      {
        ...rest,
        quote_id: rest.quote_id || undefined,
        status: 'draft',
        subtotal: sub,
        tax: lineTax,
        total: round2(sub + lineTax),
        organisation_id: profile?.organisation_id,
        lines,
      },
      {
        onSuccess: () => {
          clearDraft()
          navigate('/dashboard/invoices')
        },
      }
    )
  }

  if (clientsLoading) return <FormSkeleton fields={6} />

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Invoices', path: '/dashboard/invoices' },
        { label: 'New Invoice' },
      ]} />

      <PageHeader title="New Invoice" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <h3 className="text-body font-semibold text-text-primary mb-4">Invoice Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField isRequired isInvalid={!!errors.invoice_number}>
              <Label>Invoice Number</Label>
              <Input {...register('invoice_number')} />
              {errors.invoice_number && <FieldError>{errors.invoice_number.message}</FieldError>}
            </TextField>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Client *</label>
              <FormSelectController
                control={control}
                name="client_id"
                ariaLabel="Client"
                placeholder="Select client..."
                options={(clients ?? []).map((c: Client) => ({ value: c.id, label: c.name }))}
              />
              {errors.client_id && <p className="text-status-overdue text-xs mt-1">{errors.client_id.message}</p>}
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">From Quote (optional)</label>
              <FormSelectController
                control={control}
                name="quote_id"
                ariaLabel="From Quote"
                placeholder="None"
                clearable
                options={(approvedQuotes ?? []).map((q: Quote) => ({ value: q.id, label: q.quote_number }))}
              />
            </div>

            <TextField>
              <Label>Due Date</Label>
              <Input type="date" {...register('due_date')} />
            </TextField>

            <TextField isInvalid={!!errors.tax_rate}>
              <Label>Tax Rate (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                {...register('tax_rate', { valueAsNumber: true })}
              />
              {errors.tax_rate && <FieldError>{errors.tax_rate.message}</FieldError>}
            </TextField>
          </div>
        </div>

        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-body font-semibold text-text-primary">Line Items</h3>
            <Button type="button" variant="outline" size="sm" onPress={() => append({ description: '', quantity: 1, unit_price: 0 })}>
              <Plus size={14} /> Add Line
            </Button>
          </div>
          {errors.lines?.root && <p className="text-status-overdue text-xs mb-2">{errors.lines.root.message}</p>}
          <div className="space-y-3">
            {fields.map((field, index) => {
              const qty = watchedLines?.[index]?.quantity || 0
              const price = watchedLines?.[index]?.unit_price || 0
              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Description</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.description`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Description"
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="Description"
                          error={errors.lines?.[index]?.description?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Qty</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.quantity`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Qty"
                          type="number"
                          min="1"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.quantity?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Unit Price</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.unit_price`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Unit Price"
                          type="currency"
                          min="0"
                          step="0.01"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.unit_price?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Total</label>}
                    <div className="px-3 py-2 text-label font-medium text-text-primary bg-surface-page rounded-lg">
                      {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(qty * price)}
                    </div>
                  </div>
                  <div className="col-span-1 flex items-end">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1 invisible">X</label>}
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(index)} className="p-2 rounded-lg hover:bg-status-overdue/10 text-status-overdue hover:text-status-overdue transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-border-subtle mt-4 pt-4 space-y-1.5 text-right">
            <div>
              <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mr-4">Subtotal:</span>
              <span className="text-label font-medium text-text-primary inline-block min-w-[7rem]">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(subtotal)}</span>
            </div>
            <div>
              <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mr-4">Tax ({taxRate}%):</span>
              <span className="text-label font-medium text-text-primary inline-block min-w-[7rem]">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(tax)}</span>
            </div>
            <div>
              <span className="text-caption font-semibold text-text-secondary uppercase tracking-[0.04em] mr-4">Total:</span>
              <span className="text-body font-semibold text-text-primary inline-block min-w-[7rem]">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(total)}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <h3 className="text-body font-semibold text-text-primary mb-4">Notes</h3>
          <TextArea rows={4} placeholder="Additional notes..." {...register('notes')} />
        </div>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" isDisabled={createInvoice.isPending}>
            {createInvoice.isPending ? 'Saving...' : 'Save Invoice'}
          </Button>
          <Button type="button" variant="secondary" onPress={() => navigate('/dashboard/invoices')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
