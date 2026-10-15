import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { FormSelectController, LineItemInput, PageHeader } from '@haumea/ui'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAuth } from '@/hooks/use-auth'
import { useJobs } from '@/hooks/use-jobs'
import { useProperties } from '@/hooks/use-properties'
import { useCreatePurchaseOrder, useSupplierItems, useSuppliers } from '@/hooks/use-purchase-orders'
import { formatCurrency } from '@haumea/utils'
import { FormSkeleton } from '@/components/shared/skeletons'
import { toLocalYmd } from '@/lib/time-tracking/compute'

const lineSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  sku: z.string().optional(),
  quantity: z.number().min(0.01, 'Quantity is required'),
  unit_cost: z.number().min(0, 'Unit cost cannot be negative'),
  tax_rate: z.number().min(0).max(100),
})

const purchaseOrderSchema = z.object({
  po_number: z.string().min(1, 'PO number is required'),
  supplier_id: z.string().min(1, 'Supplier is required'),
  property_id: z.string().optional(),
  job_id: z.string().optional(),
  order_date: z.string().optional(),
  expected_date: z.string().optional(),
  delivery_address: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line is required'),
})

type PurchaseOrderForm = z.infer<typeof purchaseOrderSchema>

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: suppliers, isLoading: suppliersLoading, error: suppliersError } = useSuppliers()
  const { data: properties } = useProperties()
  const { data: jobs } = useJobs()
  const createPurchaseOrder = useCreatePurchaseOrder()

  const form = useForm<PurchaseOrderForm>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      po_number: `PO-${String(Date.now()).slice(-6)}`,
      supplier_id: '',
      property_id: '',
      job_id: '',
      order_date: toLocalYmd(new Date()),
      expected_date: '',
      delivery_address: '',
      notes: '',
      lines: [{ description: '', sku: '', quantity: 1, unit_cost: 0, tax_rate: 20 }],
    },
  })

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchedLines = watch('lines')
  const selectedSupplierId = watch('supplier_id')
  const { data: supplierItems, error: supplierItemsError } = useSupplierItems(selectedSupplierId)

  const totals = useMemo(() => {
    const subtotal = (watchedLines ?? []).reduce((sum, line) => sum + (line.quantity || 0) * (line.unit_cost || 0), 0)
    const tax = (watchedLines ?? []).reduce((sum, line) => {
      const lineSubtotal = (line.quantity || 0) * (line.unit_cost || 0)
      return sum + lineSubtotal * ((line.tax_rate ?? 20) / 100)
    }, 0)
    return { subtotal, tax, total: subtotal + tax }
  }, [watchedLines])

  const onSubmit = (values: PurchaseOrderForm) => {
    createPurchaseOrder.mutate(
      {
        po_number: values.po_number,
        supplier_id: values.supplier_id,
        property_id: values.property_id || null,
        job_id: values.job_id || null,
        order_date: values.order_date || undefined,
        expected_date: values.expected_date || null,
        delivery_address: values.delivery_address || null,
        notes: values.notes || null,
        status: 'draft',
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        organisation_id: profile?.organisation_id,
        created_by: profile?.id,
        lines: values.lines,
      },
      {
        onSuccess: (po) => navigate(`/dashboard/purchase-orders/${po.id}`),
      },
    )
  }

  if (suppliersLoading) {
    return <FormSkeleton fields={6} />
  }

  if (suppliersError) {
    const message = suppliersError instanceof Error ? suppliersError.message : 'Unknown database error'
    return (
      <div className="space-y-6 max-w-3xl">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Purchase Orders', path: '/dashboard/purchase-orders' },
            { label: 'New PO' },
          ]}
        />
        <div className="rounded-xl border border-status-due/40 bg-status-due/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-status-due" />
            <div>
              <h1 className="text-body font-semibold text-text-primary">Purchase order database setup required</h1>
              <p className="text-label text-text-secondary mt-1">
                Apply Supabase migrations 00043 and 00044 before creating purchase orders. Current error: {message}
              </p>
            </div>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard/purchase-orders">Back to Purchase Orders</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Purchase Orders', path: '/dashboard/purchase-orders' },
          { label: 'New PO' },
        ]}
      />

      <div>
        <PageHeader title="New Purchase Order" subtitle="Raise supplier spend against the correct job, property and cost centre." />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <section className="bg-surface-card border border-border-default rounded-xl p-5">
          <h2 className="text-body font-semibold text-text-primary mb-4">PO Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField isRequired isInvalid={!!errors.po_number}>
              <Label>PO Number</Label>
              <Input {...register('po_number')} />
              {errors.po_number && <FieldError>{errors.po_number.message}</FieldError>}
            </TextField>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                Supplier <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={control}
                name="supplier_id"
                ariaLabel="Supplier"
                placeholder="Select supplier..."
                options={(suppliers ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              />
              {errors.supplier_id && <p className="text-status-overdue text-xs mt-1">{errors.supplier_id.message}</p>}
              {!suppliers?.length && (
                <p className="text-caption text-text-muted mt-1">
                  Add Fortus, Screwfix or another supplier on the purchase orders page first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Property</label>
              <FormSelectController
                control={control}
                name="property_id"
                ariaLabel="Property"
                placeholder="No property"
                clearable
                options={(properties ?? []).map((property) => ({ value: property.id, label: property.name }))}
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Job</label>
              <FormSelectController
                control={control}
                name="job_id"
                ariaLabel="Job"
                placeholder="No job"
                clearable
                options={(jobs ?? []).slice(0, 100).map((job) => ({ value: job.id, label: job.title }))}
              />
            </div>

            <TextField>
              <Label>Order Date</Label>
              <Input type="date" {...register('order_date')} />
            </TextField>
            <TextField>
              <Label>Expected Date</Label>
              <Input type="date" {...register('expected_date')} />
            </TextField>
          </div>
        </section>

        <section className="bg-surface-card border border-border-default rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body font-semibold text-text-primary">Line Items</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => append({ description: '', sku: '', quantity: 1, unit_cost: 0, tax_rate: 20 })}
            >
              <Plus size={14} />
              Add Line
            </Button>
          </div>

          {selectedSupplierId && (
            <div className="mb-4 rounded-xl border border-border-subtle bg-surface-page/60 p-3">
              <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-2">Supplier Catalogue</p>
              {supplierItemsError ? (
                <p className="text-caption text-text-muted">
                  Catalogue items become available after migration 00045 is applied.
                </p>
              ) : !supplierItems?.length ? (
                <p className="text-caption text-text-muted">No saved catalogue items for this supplier yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {supplierItems.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        append({
                          description: item.description || item.name,
                          sku: item.sku || '',
                          quantity: 1,
                          unit_cost: item.unit_cost ?? 0,
                          tax_rate: item.tax_rate ?? 20,
                        })
                      }
                      className="rounded-lg border border-border-default bg-surface-card px-3 py-2 text-left hover:border-brand-500 transition-colors"
                    >
                      <span className="block text-label font-medium text-text-primary">{item.name}</span>
                      <span className="block text-micro text-text-muted">{formatCurrency(item.unit_cost)} · VAT {item.tax_rate ?? 20}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {fields.map((field, index) => {
              const line = watchedLines?.[index]
              const subtotal = (line?.quantity || 0) * (line?.unit_cost || 0)
              const tax = subtotal * ((line?.tax_rate ?? 20) / 100)
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
                          error={errors.lines?.[index]?.description?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">SKU</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.sku`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="SKU"
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-1">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Qty</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.quantity`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Qty"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.quantity?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Unit Cost</label>}
                    <Controller
                      control={control}
                      name={`lines.${index}.unit_cost`}
                      render={({ field }) => (
                        <LineItemInput
                          ariaLabel="Unit Cost"
                          type="currency"
                          min="0"
                          step="0.01"
                          value={field.value ?? ''}
                          onChange={(value) => field.onChange(value === '' ? '' : Number(value))}
                          onBlur={field.onBlur}
                          error={errors.lines?.[index]?.unit_cost?.message}
                        />
                      )}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-1">
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
                  <div className="col-span-10 md:col-span-1">
                    {index === 0 && <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Total</label>}
                    <div className="px-3 py-2 text-label font-medium text-text-primary bg-surface-page rounded-lg">
                      {formatCurrency(subtotal + tax)}
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1 flex items-end">
                    {index === 0 && <span className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1 invisible">X</span>}
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(index)} className="p-2 rounded-lg hover:bg-status-overdue/10 text-status-overdue">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t border-border-subtle mt-5 pt-4 space-y-1 text-right">
            <p className="text-label text-text-secondary">Subtotal: <span className="font-medium text-text-primary">{formatCurrency(totals.subtotal)}</span></p>
            <p className="text-label text-text-secondary">Tax: <span className="font-medium text-text-primary">{formatCurrency(totals.tax)}</span></p>
            <p className="text-[16px] font-semibold text-text-primary">Total: {formatCurrency(totals.total)}</p>
          </div>
        </section>

        <section className="bg-surface-card border border-border-default rounded-xl p-5">
          <TextField>
            <Label>Delivery Address</Label>
            <TextArea rows={2} {...register('delivery_address')} />
          </TextField>
          <TextField className="mt-4">
            <Label>Notes</Label>
            <TextArea rows={3} {...register('notes')} />
          </TextField>
        </section>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" isDisabled={createPurchaseOrder.isPending || !suppliers?.length}>
            {createPurchaseOrder.isPending ? 'Creating...' : 'Create PO'}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/dashboard/purchase-orders">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
