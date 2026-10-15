// Sprint 3 / B3 — Supplier detail page.
//
// Shows the supplier row with inline editing of every field, the
// catalogue items already maintained on the PO page (read-only mirror
// here, with a deep link to the PO catalogue management widget for
// edits), and the recent POs raised against this supplier.

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Phone,
  Pencil,
  Save,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { EmptyState } from '@/components/shared/empty-state'
import {
  useDeleteSupplier,
  usePurchaseOrders,
  useSupplier,
  useSupplierItems,
  useSupplierPoCounts,
  useUpdateSupplier,
  useUpdateSupplierStatus,
} from '@/hooks/use-purchase-orders'
import { formatCurrency, formatDate } from '@haumea/utils'
import type { PurchaseOrderWithRelations } from '@haumea/types'

const supplierEditSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  account_number: z.string().optional(),
  contact_email: z.string().email('Invalid email').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  website: z.string().optional(),
  payment_terms: z.string().optional(),
  default_tax_rate: z.number().min(0).max(100),
  notes: z.string().optional(),
})

type SupplierEditForm = z.infer<typeof supplierEditSchema>

const PO_STATUS_COLORS: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  approved: 'warning',
  received: 'success',
  cancelled: 'danger',
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: supplier, isLoading } = useSupplier(id)
  const { data: items } = useSupplierItems(id)
  const { data: poCounts } = useSupplierPoCounts(id)
  // We over-fetch a touch and slice to the last 10 client-side — the PO
  // hook doesn't yet accept a supplier_id filter and adding one would
  // mean a wider change just for this page.
  const { data: allPos } = usePurchaseOrders()
  const supplierPos = (allPos ?? []).filter((p) => p.supplier_id === id).slice(0, 10)

  const updateSupplier = useUpdateSupplier()
  const updateStatus = useUpdateSupplierStatus()
  const deleteSupplier = useDeleteSupplier()

  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<SupplierEditForm>({
    resolver: zodResolver(supplierEditSchema),
    defaultValues: {
      name: '',
      account_number: '',
      contact_email: '',
      contact_phone: '',
      website: '',
      payment_terms: '',
      default_tax_rate: 20,
      notes: '',
    },
  })

  // Hydrate the form from the loaded supplier once — keyed on id so a
  // background refetch can't reset() over the user's in-progress edits.
  const hydratedId = useRef<string | null>(null)
  useEffect(() => {
    if (!supplier) return
    if (hydratedId.current === supplier.id) return
    hydratedId.current = supplier.id
    form.reset({
      name: supplier.name,
      account_number: supplier.account_number ?? '',
      contact_email: supplier.contact_email ?? '',
      contact_phone: supplier.contact_phone ?? '',
      website: supplier.website ?? '',
      payment_terms: supplier.payment_terms ?? '',
      default_tax_rate: supplier.default_tax_rate ?? 20,
      notes: supplier.notes ?? '',
    })
  }, [supplier, form])

  if (isLoading) return <DetailPageSkeleton />
  if (!supplier) {
    return (
      <div className="space-y-4">
        <Link
          to="/dashboard/suppliers"
          className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-secondary"
        >
          <ArrowLeft size={14} /> Back to Suppliers
        </Link>
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          Supplier not found.
        </div>
      </div>
    )
  }

  const onSave = (values: SupplierEditForm) => {
    updateSupplier.mutate(
      {
        id: supplier.id,
        name: values.name,
        account_number: values.account_number || null,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        website: values.website || null,
        payment_terms: values.payment_terms || null,
        default_tax_rate: values.default_tax_rate,
        notes: values.notes || null,
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  const onDelete = () => {
    deleteSupplier.mutate(supplier.id, {
      onSuccess: () => navigate('/dashboard/suppliers'),
    })
    setConfirmDelete(false)
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Suppliers', path: '/dashboard/suppliers' },
          { label: supplier.name },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <PageHeader title={supplier.name} />
            <Chip
              variant="soft"
              color={supplier.status === 'active' ? 'success' : 'default'}
              size="sm"
            >
              {supplier.status}
            </Chip>
          </div>
          <div className="text-caption text-text-muted flex flex-wrap gap-x-3">
            {supplier.account_number && <span>Account #{supplier.account_number}</span>}
            {poCounts && (
              <span>
                {poCounts.total} PO{poCounts.total === 1 ? '' : 's'} · {poCounts.active} active
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onPress={() =>
                  updateStatus.mutate({
                    id: supplier.id,
                    status: supplier.status === 'active' ? 'inactive' : 'active',
                  })
                }
                isDisabled={updateStatus.isPending}
              >
                {supplier.status === 'active' ? 'Mark inactive' : 'Mark active'}
              </Button>
              <Button variant="outline" size="sm" onPress={() => setEditing(true)}>
                <Pencil size={13} /> Edit
              </Button>
              <Button variant="danger" size="sm" onPress={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onPress={() => setEditing(false)}>
                <X size={13} /> Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onPress={() => form.handleSubmit(onSave)()}
                isDisabled={updateSupplier.isPending}
              >
                <Save size={13} /> {updateSupplier.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Detail / edit panel */}
      <AppCard padding="md">
        {!editing ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Email">
              {supplier.contact_email ? (
                <a
                  href={`mailto:${supplier.contact_email}`}
                  className="inline-flex items-center gap-1 hover:text-brand-600"
                >
                  <Mail size={12} /> {supplier.contact_email}
                </a>
              ) : '—'}
            </Field>
            <Field label="Phone">
              {supplier.contact_phone ? (
                <a
                  href={`tel:${supplier.contact_phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1 hover:text-brand-600"
                >
                  <Phone size={12} /> {supplier.contact_phone}
                </a>
              ) : '—'}
            </Field>
            <Field label="Website">
              {supplier.website ? (
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-brand-600 break-all"
                >
                  <ExternalLink size={12} /> {supplier.website}
                </a>
              ) : '—'}
            </Field>
            <Field label="Payment terms">{supplier.payment_terms || '—'}</Field>
            <Field label="Default VAT">{supplier.default_tax_rate ?? 20}%</Field>
            <Field label="Account #">{supplier.account_number || '—'}</Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <span className="whitespace-pre-wrap">{supplier.notes || '—'}</span>
              </Field>
            </div>
          </dl>
        ) : (
          <form
            onSubmit={form.handleSubmit(onSave)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <TextField isInvalid={!!form.formState.errors.name} className="sm:col-span-2">
              <Label>Supplier name</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && <FieldError>{form.formState.errors.name.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!form.formState.errors.contact_email}>
              <Label>Email</Label>
              <Input type="email" {...form.register('contact_email')} />
              {form.formState.errors.contact_email && <FieldError>{form.formState.errors.contact_email.message}</FieldError>}
            </TextField>
            <TextField>
              <Label>Phone</Label>
              <Input {...form.register('contact_phone')} />
            </TextField>
            <TextField>
              <Label>Website</Label>
              <Input {...form.register('website')} />
            </TextField>
            <TextField>
              <Label>Payment terms</Label>
              <Input placeholder="Net 30" {...form.register('payment_terms')} />
            </TextField>
            <TextField isInvalid={!!form.formState.errors.default_tax_rate}>
              <Label>Default VAT %</Label>
              <Input
                type="number"
                step="0.5"
                {...form.register('default_tax_rate', { valueAsNumber: true })}
              />
              {form.formState.errors.default_tax_rate && <FieldError>{form.formState.errors.default_tax_rate.message}</FieldError>}
            </TextField>
            <TextField>
              <Label>Account #</Label>
              <Input {...form.register('account_number')} />
            </TextField>
            <TextField className="sm:col-span-2">
              <Label>Notes</Label>
              <TextArea rows={3} {...form.register('notes')} />
            </TextField>
          </form>
        )}
      </AppCard>

      {/* Catalogue */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store size={15} className="text-brand-500" />
            <h2 className="text-body font-semibold text-text-primary">
              Catalogue ({items?.length ?? 0})
            </h2>
          </div>
          <Link
            to="/dashboard/purchase-orders"
            className="text-caption text-brand-600 hover:underline inline-flex items-center gap-1"
          >
            Manage on Purchase Orders <ExternalLink size={11} />
          </Link>
        </div>
        {!items || items.length === 0 ? (
          <div className="p-5 text-label text-text-muted">
            No catalogue items maintained yet. Add them from the Purchase Orders page.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Catalogue items">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Item
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    SKU
                  </th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Unit cost
                  </th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    VAT
                  </th>
                </tr></thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} id={it.id} className="border-b border-border-subtle">
                      <td className="px-4 py-3 text-label text-text-primary">
                        {it.name}
                        {it.unit && (
                          <span className="ml-1 text-micro text-text-muted">/ {it.unit}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-caption text-text-secondary">
                        {it.sku || '—'}
                      </td>
                      <td className="px-4 py-3 text-label text-text-primary text-right">
                        {formatCurrency(it.unit_cost)}
                      </td>
                      <td className="px-4 py-3 text-caption text-text-secondary text-right">
                        {it.tax_rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent POs */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">
            Recent purchase orders ({supplierPos.length})
          </h2>
        </div>
        {supplierPos.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No POs raised against this supplier yet"
            description="Create one from the Purchase Orders page."
            action={
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/purchase-orders">
                  Open Purchase Orders
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Purchase orders">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    PO
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Total
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Created
                  </th>
                </tr></thead>
                <tbody>
                  {supplierPos.map((po: PurchaseOrderWithRelations) => (
                    <tr key={po.id} id={po.id} className="border-b border-border-subtle hover:bg-surface-page">
                      <td className="px-4 py-3 text-label font-medium text-text-primary">
                        <Link to={`/dashboard/purchase-orders/${po.id}`} className="hover:underline">
                          {po.po_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Chip variant="soft" color={PO_STATUS_COLORS[po.status] ?? 'default'} size="sm">
                          {po.status}
                        </Chip>
                      </td>
                      <td className="px-4 py-3 text-right text-label text-text-primary">
                        {formatCurrency(po.total ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-caption text-text-secondary">
                        {formatDate(po.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete supplier"
        message={`Delete ${supplier.name}? This can't be undone — and it will fail if any POs reference this supplier (mark them inactive instead).`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{label}</dt>
      <dd className="text-label text-text-secondary mt-0.5">{children}</dd>
    </div>
  )
}
