// Sprint 3 / B3 — New supplier form. Mirrors the inline supplier
// quick-add that lives on the Purchase Orders page so anyone used to
// that flow recognises the shape.

import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAuth } from '@/hooks/use-auth'
import { useCreateSupplier } from '@/hooks/use-purchase-orders'

const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  account_number: z.string().optional(),
  contact_email: z.string().email('Invalid email').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  website: z.string().optional(),
  payment_terms: z.string().optional(),
  default_tax_rate: z.number().min(0).max(100),
  notes: z.string().optional(),
})

type SupplierForm = z.infer<typeof supplierSchema>

export default function NewSupplierPage() {
  const navigate = useNavigate()
  const { organisation } = useAuth()
  const create = useCreateSupplier()

  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
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

  const { register, handleSubmit, formState: { errors } } = form

  const onSubmit = (values: SupplierForm) => {
    if (!organisation?.id) return
    create.mutate(
      {
        organisation_id: organisation.id,
        name: values.name,
        account_number: values.account_number || null,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        website: values.website || null,
        payment_terms: values.payment_terms || null,
        default_tax_rate: values.default_tax_rate,
        notes: values.notes || null,
        status: 'active',
      },
      {
        onSuccess: (s) => navigate(`/dashboard/suppliers/${s.id}`),
      },
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Suppliers', path: '/dashboard/suppliers' },
          { label: 'New supplier' },
        ]}
      />

      <Link
        to="/dashboard/suppliers"
        className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-secondary"
      >
        <ArrowLeft size={14} /> Back to Suppliers
      </Link>

      <div>
        <PageHeader title="New supplier" subtitle="Add a supplier so you can raise purchase orders against them." />
      </div>

      <AppCard padding="md">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <TextField isInvalid={!!errors.name}>
          <Label>Supplier name</Label>
          <Input placeholder="e.g. Fortus" autoFocus {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField>
            <Label>Account number (optional)</Label>
            <Input placeholder="ACME-1234" {...register('account_number')} />
          </TextField>
          <TextField>
            <Label>Payment terms (optional)</Label>
            <Input placeholder="Net 30" {...register('payment_terms')} />
          </TextField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField isInvalid={!!errors.contact_email}>
            <Label>Contact email</Label>
            <Input type="email" placeholder="orders@example.com" {...register('contact_email')} />
            {errors.contact_email && <FieldError>{errors.contact_email.message}</FieldError>}
          </TextField>
          <TextField>
            <Label>Contact phone</Label>
            <Input placeholder="+44 …" {...register('contact_phone')} />
          </TextField>
        </div>

        <TextField>
          <Label>Website</Label>
          <Input placeholder="https://supplier.com" {...register('website')} />
        </TextField>

        <TextField isInvalid={!!errors.default_tax_rate}>
          <Label>Default VAT %</Label>
          <Input
            type="number"
            step="0.5"
            {...register('default_tax_rate', { valueAsNumber: true })}
          />
          {errors.default_tax_rate && <FieldError>{errors.default_tax_rate.message}</FieldError>}
        </TextField>

        <TextField>
          <Label>Notes</Label>
          <TextArea rows={3} placeholder="Internal notes — delivery quirks, account contact, etc." {...register('notes')} />
        </TextField>

        <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
          <Button type="submit" variant="primary" isDisabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save supplier'}
          </Button>
          <Button type="button" variant="outline" onPress={() => navigate('/dashboard/suppliers')}>
            Cancel
          </Button>
        </div>
      </form>
      </AppCard>
    </div>
  )
}
