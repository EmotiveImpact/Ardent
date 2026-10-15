import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, TextField } from '@haumea/ui'
import { TableSkeleton, ListSkeleton } from '@/components/shared/skeletons'
import { FormSelectController } from '@haumea/ui'
import { AlertTriangle, Download, PackageCheck, Plus, ReceiptText, Store } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { useAuth } from '@/hooks/use-auth'
import {
  useCreateSupplier,
  useCreateSupplierItem,
  usePurchaseOrders,
  useSupplierItems,
  useSuppliers,
  useUpdateSupplierStatus,
} from '@/hooks/use-purchase-orders'
import { exportToCsv, formatCurrency, formatDate } from '@haumea/utils'
import type { PurchaseOrderWithRelations, Supplier } from '@haumea/types'
import { PoQuickDrawer } from '@/components/purchase-orders/po-quick-drawer'

const STATUS_TABS = ['all', 'draft', 'sent', 'approved', 'received', 'cancelled'] as const
const STATUS_COLORS: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  approved: 'warning',
  received: 'success',
  cancelled: 'danger',
}

const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  account_number: z.string().optional(),
  contact_email: z.string().email('Invalid email').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  website: z.string().optional(),
  default_tax_rate: z.number().min(0).max(100),
})

type SupplierForm = z.infer<typeof supplierSchema>

const supplierItemSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  name: z.string().min(1, 'Item name is required'),
  sku: z.string().optional(),
  unit_cost: z.number().min(0),
  tax_rate: z.number().min(0).max(100),
})

type SupplierItemForm = z.infer<typeof supplierItemSchema>

const defaultSuppliers = [
  { name: 'Fortus', website: 'https://www.fortus.ie', default_tax_rate: 23 },
  { name: 'Screwfix', website: 'https://www.screwfix.com', default_tax_rate: 20 },
]

export default function PurchaseOrdersPage() {
  const { organisation } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // Sprint 3 / D1 — quick-capture drawer state. Replaces the
  // navigate-to-/new round-trip for the common-case PO.
  const [quickOpen, setQuickOpen] = useState(false)
  const { data: purchaseOrders, isLoading, error: purchaseOrdersError } = usePurchaseOrders({ status: statusFilter })
  const { data: suppliers, isLoading: suppliersLoading, error: suppliersError } = useSuppliers()
  const createSupplier = useCreateSupplier()
  const createSupplierItem = useCreateSupplierItem()
  const updateSupplierStatus = useUpdateSupplierStatus()
  const [catalogueSupplierId, setCatalogueSupplierId] = useState('')
  const { data: catalogueItems, error: catalogueError } = useSupplierItems(catalogueSupplierId)

  const supplierNames = useMemo(
    () => new Set((suppliers ?? []).map((supplier) => supplier.name.toLowerCase())),
    [suppliers],
  )

  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      account_number: '',
      contact_email: '',
      contact_phone: '',
      website: '',
      default_tax_rate: 20,
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form

  const itemForm = useForm<SupplierItemForm>({
    resolver: zodResolver(supplierItemSchema),
    defaultValues: {
      supplier_id: '',
      name: '',
      sku: '',
      unit_cost: 0,
      tax_rate: 20,
    },
  })

  const {
    register: registerItem,
    handleSubmit: handleItemSubmit,
    reset: resetItem,
    watch: watchItem,
    control: controlItem,
    formState: { errors: itemErrors },
  } = itemForm

  const watchedItemSupplierId = watchItem('supplier_id')

  // Mirror the form's supplier_id watch into the catalogue-loader state so
  // useSupplierItems reacts to dropdown changes (replaces the inline
  // onChange we used to attach to <select>).
  useEffect(() => {
    setCatalogueSupplierId(watchedItemSupplierId || '')
  }, [watchedItemSupplierId])

  const addSupplier = async (values: SupplierForm) => {
    await createSupplier.mutateAsync({
      ...values,
      organisation_id: organisation?.id,
      contact_email: values.contact_email || null,
      status: 'active',
    })
    reset()
  }

  const installDefaultSupplier = async (supplier: Pick<Supplier, 'name' | 'website' | 'default_tax_rate'>) => {
    await createSupplier.mutateAsync({
      ...supplier,
      organisation_id: organisation?.id,
      status: 'active',
      payment_terms: '30 days',
    })
  }

  const addSupplierItem = async (values: SupplierItemForm) => {
    await createSupplierItem.mutateAsync({
      ...values,
      organisation_id: organisation?.id,
      description: values.name,
      unit: 'each',
      status: 'active',
    })
    setCatalogueSupplierId(values.supplier_id)
    resetItem({ supplier_id: values.supplier_id, name: '', sku: '', unit_cost: 0, tax_rate: values.tax_rate })
  }

  const exportRows = (purchaseOrders ?? []).map((po) => ({
    PO: po.po_number,
    Supplier: po.suppliers?.name ?? '',
    Status: po.status,
    Total: po.total,
    Property: po.properties?.name ?? '',
    Date: po.order_date ? formatDate(po.order_date) : '',
  }))

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Purchase Orders' },
        ]}
      />

      <SectionHeader
        variant="page"
        title="Purchase Orders"
        subtitle="Control supplier spend, job materials and subcontracted costs"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onPress={() => exportToCsv('purchase-orders.csv', exportRows)}>
              <Download size={14} />
              Export
            </Button>
            <Button variant="primary" size="sm" onPress={() => setQuickOpen(true)}>
              <Plus size={14} />
              New PO
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border-subtle">
            <div className="flex gap-2 flex-wrap">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-label font-medium capitalize transition-colors ${
                    statusFilter === tab
                      ? 'bg-foreground text-background'
                      : 'border border-border-default text-text-secondary hover:bg-surface-page'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {purchaseOrdersError ? (
            <SchemaErrorPanel error={purchaseOrdersError} />
          ) : isLoading ? (
            <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
          ) : !purchaseOrders?.length ? (
            <EmptyState
              icon={ReceiptText}
              title="No purchase orders yet"
              description="Create a PO when materials, parts or supplier services need approval and tracking."
              action={
                <Button variant="primary" size="sm" onPress={() => setQuickOpen(true)}>
                  <Plus size={14} />
                  New PO
                </Button>
              }
            />
          ) : (
            <PurchaseOrdersTable purchaseOrders={purchaseOrders} />
          )}
        </section>

        <aside className="space-y-5">
          <section className="bg-surface-card border border-border-default rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Store size={16} className="text-brand-500" />
              <h2 className="text-body font-semibold text-text-primary">Supplier List</h2>
            </div>
            {suppliersLoading ? (
              <ListSkeleton rows={3} withAvatar={false} framed={false} />
            ) : !suppliers?.length ? (
              <p className="text-label text-text-muted">No suppliers maintained yet.</p>
            ) : (
              <div className="space-y-2">
                {suppliers.slice(0, 8).map((supplier) => (
                  <div key={supplier.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-label font-medium text-text-primary truncate">{supplier.name}</p>
                      <p className="text-micro text-text-muted truncate">
                        VAT {supplier.default_tax_rate ?? 20}%{supplier.account_number ? ` · ${supplier.account_number}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateSupplierStatus.mutate({
                          id: supplier.id,
                          status: supplier.status === 'active' ? 'inactive' : 'active',
                        })
                      }
                      className="shrink-0"
                      disabled={updateSupplierStatus.isPending}
                      aria-label={`Set ${supplier.name} ${supplier.status === 'active' ? 'inactive' : 'active'}`}
                    >
                      <Chip variant="soft" color={supplier.status === 'active' ? 'success' : 'default'} size="sm">
                        {supplier.status}
                      </Chip>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface-card border border-border-default rounded-xl p-5">
            <h2 className="text-body font-semibold text-text-primary mb-4">Add Supplier</h2>
            {suppliersError && <SchemaErrorPanel error={suppliersError} compact />}
            <form onSubmit={handleSubmit(addSupplier)} className="space-y-3">
              <TextField isRequired isInvalid={!!errors.name}>
                <Label>Name</Label>
                <Input {...register('name')} placeholder="Fortus, Screwfix, local wholesaler..." />
                {errors.name && <FieldError>{errors.name.message}</FieldError>}
              </TextField>
              <TextField>
                <Label>Account Number</Label>
                <Input {...register('account_number')} />
              </TextField>
              <TextField isInvalid={!!errors.contact_email}>
                <Label>Email</Label>
                <Input type="email" {...register('contact_email')} />
                {errors.contact_email && <FieldError>{errors.contact_email.message}</FieldError>}
              </TextField>
              <TextField>
                <Label>Default Tax %</Label>
                <Input type="number" step="0.01" {...register('default_tax_rate', { valueAsNumber: true })} />
              </TextField>
              <Button type="submit" variant="primary" size="sm" isDisabled={createSupplier.isPending}>
                {createSupplier.isPending ? 'Saving...' : 'Save Supplier'}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-border-subtle">
              <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-2">Predefined</p>
              <div className="flex flex-wrap gap-2">
                {defaultSuppliers.map((supplier) => (
                  <Button
                    key={supplier.name}
                    variant="outline"
                    size="sm"
                    isDisabled={supplierNames.has(supplier.name.toLowerCase()) || createSupplier.isPending}
                    onPress={() => installDefaultSupplier(supplier)}
                  >
                    <PackageCheck size={13} />
                    {supplier.name}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-surface-card border border-border-default rounded-xl p-5">
            <h2 className="text-body font-semibold text-text-primary mb-4">Supplier Catalogue</h2>
            <form onSubmit={handleItemSubmit(addSupplierItem)} className="space-y-3">
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Supplier</label>
                <FormSelectController
                  control={controlItem}
                  name="supplier_id"
                  ariaLabel="Supplier"
                  placeholder="Select supplier..."
                  options={(suppliers ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                />
                {itemErrors.supplier_id && <p className="text-status-overdue text-xs mt-1">{itemErrors.supplier_id.message}</p>}
              </div>
              <TextField isRequired isInvalid={!!itemErrors.name}>
                <Label>Item Name</Label>
                <Input {...registerItem('name')} placeholder="Fire alarm call point, extinguisher bracket..." />
                {itemErrors.name && <FieldError>{itemErrors.name.message}</FieldError>}
              </TextField>
              <div className="grid grid-cols-3 gap-2">
                <TextField>
                  <Label>SKU</Label>
                  <Input {...registerItem('sku')} />
                </TextField>
                <TextField>
                  <Label>Cost</Label>
                  <Input type="number" step="0.01" {...registerItem('unit_cost', { valueAsNumber: true })} />
                </TextField>
                <TextField>
                  <Label>Tax %</Label>
                  <Input type="number" step="0.01" {...registerItem('tax_rate', { valueAsNumber: true })} />
                </TextField>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isDisabled={createSupplierItem.isPending || !watchedItemSupplierId}
              >
                {createSupplierItem.isPending ? 'Saving...' : 'Save Catalogue Item'}
              </Button>
            </form>

            {catalogueSupplierId && (
              <div className="mt-4 pt-4 border-t border-border-subtle space-y-2">
                {catalogueError ? (
                  <p className="text-caption text-text-muted">Catalogue table requires migration 00045.</p>
                ) : !catalogueItems?.length ? (
                  <p className="text-caption text-text-muted">No catalogue items saved for this supplier.</p>
                ) : (
                  catalogueItems.slice(0, 6).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-label font-medium text-text-primary truncate">{item.name}</p>
                        <p className="text-micro text-text-muted truncate">{item.sku || 'No SKU'} · VAT {item.tax_rate}%</p>
                      </div>
                      <span className="text-label font-medium text-text-primary">{formatCurrency(item.unit_cost)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Sprint 3 / D1 — quick-capture drawer. Renders nothing when
          closed; the parent state controls open/close. */}
      <PoQuickDrawer open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}

function SchemaErrorPanel({ error, compact = false }: { error: unknown; compact?: boolean }) {
  const message = error instanceof Error ? error.message : 'Unknown database error'
  const isMissingMigration = /schema cache|does not exist|relation .* does not exist/i.test(message)

  return (
    <div className={`m-5 rounded-xl border ${isMissingMigration ? 'border-status-due/40 bg-status-due/10' : 'border-status-overdue/30 bg-status-overdue/10'} ${compact ? 'p-3 mb-4 m-0' : 'p-5'}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className={isMissingMigration ? 'text-status-due' : 'text-status-overdue'} />
        <div>
          <p className="text-label font-semibold text-text-primary">
            {isMissingMigration ? 'Database migration required' : 'Could not load purchase order data'}
          </p>
          <p className="text-caption text-text-secondary mt-1">
            {isMissingMigration
              ? 'Apply migrations 00043 and 00044 to Supabase, then reload the schema cache. The UI is ready but the live database is missing the commercial operations tables/functions.'
              : message}
          </p>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrdersTable({ purchaseOrders }: { purchaseOrders: PurchaseOrderWithRelations[] }) {
  return (
    <table aria-label="Purchase orders" className="overflow-hidden">
        <thead><tr>
          <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">PO</th>
          <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Supplier</th>
          <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property / Job</th>
          <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
          <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
          <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
        </tr></thead>
        <tbody>
          {purchaseOrders.map((po) => (
            <tr key={po.id} id={po.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-page transition-colors">
              <td className="py-3 px-4">
                <Link to={`/dashboard/purchase-orders/${po.id}`} className="text-label font-medium text-brand-500 hover:text-brand-600">
                  {po.po_number}
                </Link>
              </td>
              <td className="py-3 px-4 text-label text-text-secondary">{po.suppliers?.name ?? '-'}</td>
              <td className="py-3 px-4 text-label text-text-secondary">
                {po.properties?.name ?? po.jobs?.title ?? '-'}
              </td>
              <td className="py-3 px-4">
                <Chip variant="soft" color={STATUS_COLORS[po.status] ?? 'default'} size="sm">
                  {po.status}
                </Chip>
              </td>
              <td className="py-3 px-4 text-label font-medium text-text-primary text-right">
                {formatCurrency(po.total ?? 0)}
              </td>
              <td className="py-3 px-4 text-label text-text-secondary">
                {po.order_date ? formatDate(po.order_date) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
    </table>
  )
}
