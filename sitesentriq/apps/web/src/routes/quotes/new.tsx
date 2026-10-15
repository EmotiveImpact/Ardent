import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Controller, useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { FormSelectController, LineItemInput, PageHeader } from '@haumea/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useClients } from '@/hooks/use-clients'
import { useProperties } from '@/hooks/use-properties'
import { useCreateQuote } from '@/hooks/use-quotes'
import { useJob } from '@/hooks/use-jobs'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAutosaveDraft } from '@/hooks/use-autosave-draft'
import { QUOTE_TYPES } from '@/lib/constants'
import type { Client, Property } from '@haumea/types'
import { FormSkeleton } from '@/components/shared/skeletons'

const lineSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Min 1'),
  cost_price: z.number().min(0, 'Min 0'),
  markup_percent: z.number().min(0, 'Min 0'),
  tax_rate: z.number().min(0).max(100),
})

const quoteSchema = z.object({
  client_id: z.string().min(1, 'Client is required'),
  property_id: z.string().optional(),
  quote_number: z.string().min(1, 'Quote number is required'),
  quote_type: z.enum(['service_quote', 'defect_quote']),
  valid_until: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
})

type QuoteFormData = z.infer<typeof quoteSchema>

export default function NewQuotePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createQuote = useCreateQuote()
  // When raised from a job ("Raise quote" on the job detail), prefill the
  // client/property from that job and remember it as the source so the quote
  // stays associated to the task (and a converted job links back via parent).
  const [searchParams] = useSearchParams()
  const sourceJobId = searchParams.get('job')
  const { data: sourceJob } = useJob(sourceJobId ?? '')

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      quote_number: `QUO-${String(Date.now()).slice(-4)}`,
      quote_type: 'defect_quote',
      lines: [{ description: '', quantity: 1, cost_price: 0, markup_percent: 30, tax_rate: 20 }],
    },
  })
  const { register, handleSubmit, control, watch, formState: { errors } } = form
  const { clearDraft } = useAutosaveDraft(form, { key: 'draft:quote:new' })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const selectedClientId = watch('client_id')
  const { data: clients, isLoading: clientsLoading } = useClients()
  const { data: properties } = useProperties(selectedClientId)
  const watchedLines = watch('lines')

  // Clear the dependent Property when the Client changes — otherwise a property
  // chosen under the previous client stays in form state and gets persisted on
  // a quote belonging to a different client. Mirrors assets/edit.tsx's guard.
  const prevClientRef = useRef(selectedClientId)
  useEffect(() => {
    if (prevClientRef.current && prevClientRef.current !== selectedClientId) {
      form.setValue('property_id', '')
    }
    prevClientRef.current = selectedClientId
  }, [selectedClientId, form])

  // Prefill client + property from the source job. Update prevClientRef first so
  // the clear-on-client-change effect above doesn't immediately wipe property_id.
  useEffect(() => {
    if (!sourceJob) return
    const cid = (sourceJob as { client_id?: string | null }).client_id
    const pid = (sourceJob as { property_id?: string | null }).property_id
    if (cid) {
      prevClientRef.current = cid
      form.setValue('client_id', cid)
    }
    if (pid) form.setValue('property_id', pid)
  }, [sourceJob, form])

  const subtotal = watchedLines?.reduce((sum, l) => {
    const unitPrice = (l.cost_price || 0) * (1 + (l.markup_percent || 0) / 100)
    return sum + (l.quantity || 0) * unitPrice
  }, 0) || 0
  const tax = watchedLines?.reduce((sum, l) => {
    const unitPrice = (l.cost_price || 0) * (1 + (l.markup_percent || 0) / 100)
    return sum + (l.quantity || 0) * unitPrice * ((l.tax_rate ?? 20) / 100)
  }, 0) || 0

  const onSubmit = (data: QuoteFormData) => {
    const { lines, ...rest } = data
    const pricedLines = lines.map((line) => {
      const unitPrice = line.cost_price * (1 + line.markup_percent / 100)
      return {
        ...line,
        unit_price: unitPrice,
      }
    })
    createQuote.mutate(
      {
        ...rest,
        property_id: rest.property_id || undefined,
        job_id: sourceJobId || undefined,
        status: 'draft',
        subtotal,
        tax,
        total: subtotal + tax,
        organisation_id: profile?.organisation_id,
        // Stamp the creator so the approve/reject notification has a recipient.
        created_by: profile?.id,
        lines: pricedLines,
      },
      {
        onSuccess: () => {
          clearDraft()
          navigate('/dashboard/quotes')
        },
      }
    )
  }

  if (clientsLoading) return <FormSkeleton fields={6} />

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Quotes', path: '/dashboard/quotes' },
        { label: 'New Quote' },
      ]} />

      <PageHeader title="New Quote" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <h3 className="text-body font-semibold text-text-primary mb-4">Quote Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField isRequired isInvalid={!!errors.quote_number}>
              <Label>Quote Number</Label>
              <Input {...register('quote_number')} />
              {errors.quote_number && <FieldError>{errors.quote_number.message}</FieldError>}
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
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Property</label>
              <FormSelectController
                control={control}
                name="property_id"
                ariaLabel="Property"
                placeholder="Select property..."
                clearable
                options={(properties ?? []).map((p: Property) => ({ value: p.id, label: p.name }))}
              />
            </div>

            <TextField>
              <Label>Valid Until</Label>
              <Input type="date" {...register('valid_until')} />
            </TextField>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Quote Type</label>
              <FormSelectController
                control={control}
                name="quote_type"
                ariaLabel="Quote Type"
                options={Object.entries(QUOTE_TYPES).map(([value, label]) => ({ value, label }))}
              />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-body font-semibold text-text-primary">Line Items</h3>
            <Button type="button" variant="outline" size="sm" onPress={() => append({ description: '', quantity: 1, cost_price: 0, markup_percent: 30, tax_rate: 20 })}>
              <Plus size={14} /> Add Line
            </Button>
          </div>
          {errors.lines?.root && <p className="text-status-overdue text-xs mb-2">{errors.lines.root.message}</p>}
          <div className="space-y-3">
            {fields.map((field, index) => {
              const qty = watchedLines?.[index]?.quantity || 0
              const costPrice = watchedLines?.[index]?.cost_price || 0
              const markup = watchedLines?.[index]?.markup_percent || 0
              const unitPrice = costPrice * (1 + markup / 100)
              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-4">
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
                  <div className="col-span-4 md:col-span-1">
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
                  <div className="col-span-4 md:col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Cost</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.cost_price`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Cost"
                          type="currency"
                          min="0"
                          step="0.01"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.cost_price?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Markup %</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.markup_percent`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Markup %"
                          type="number"
                          min="0"
                          step="0.01"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.markup_percent?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Tax %</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.tax_rate`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Tax %"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.tax_rate?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Total</label>}
                    <div className="px-3 py-2 text-label font-medium text-text-primary bg-surface-page rounded-lg">
                      {/* Ex-tax extended amount — matches the Subtotal below, the
                          value persisted (use-quotes.ts), and the detail page/PDF.
                          Tax is applied once at the footer, not per line. */}
                      {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(qty * unitPrice)}
                    </div>
                  </div>
                  <div className="col-span-6 md:col-span-1 flex items-end">
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

          <div className="border-t border-border-subtle mt-4 pt-4 text-right">
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mr-4">Subtotal:</span>
            <span className="text-label font-medium text-text-primary">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(subtotal)}</span>
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] ml-6 mr-4">Tax:</span>
            <span className="text-label font-medium text-text-primary">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(tax)}</span>
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] ml-6 mr-4">Total:</span>
            <span className="text-label font-semibold text-text-primary">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(subtotal + tax)}</span>
          </div>
        </div>

        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <h3 className="text-body font-semibold text-text-primary mb-4">Notes</h3>
          <TextArea rows={4} placeholder="Additional notes..." {...register('notes')} />
        </div>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" isDisabled={createQuote.isPending}>
            {createQuote.isPending ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button type="button" variant="secondary" onPress={() => navigate('/dashboard/quotes')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
