// Wave A1 — Edit Client page. Mirrors the clients/new.tsx form so the
// fields and validation stay in lock-step. Pre-fills from useClient(id)
// and persists via useUpdateClient.
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { AppCard, PageHeader, Heading, Text } from '@haumea/ui'

import { useClient, useUpdateClient } from '@/hooks/use-clients'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

const clientSchema = z.object({
  client_code: z.string().optional(),
  name: z.string().min(1, 'Client name is required'),
  primary_contact_name: z.string().optional(),
  primary_contact_phone: z.string().optional(),
  contact_email: z.string().email('Invalid email').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  billing_email: z.string().email('Invalid billing email').or(z.literal('')).optional(),
  billing_address: z.string().optional(),
  billing_terms: z.string().optional(),
  tax_number: z.string().optional(),
  notes: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientSchema>

export default function EditClientPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading } = useClient(id ?? '')
  const updateClient = useUpdateClient()

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      client_code: '',
      name: '',
      primary_contact_name: '',
      primary_contact_phone: '',
      contact_email: '',
      contact_phone: '',
      address: '',
      billing_email: '',
      billing_address: '',
      billing_terms: '',
      tax_number: '',
      notes: '',
    },
  })
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = form

  // Hydrate form once the client has loaded — keyed on the record id, not the
  // object. A background refetch (reconnect, or a colleague touching the row)
  // returns a new object identity and would otherwise reset() over whatever
  // the user has typed since the page loaded.
  const hydratedId = useRef<string | null>(null)
  useEffect(() => {
    if (!client) return
    if (hydratedId.current === client.id) return
    hydratedId.current = client.id
    reset({
      client_code: client.client_code ?? '',
      name: client.name ?? '',
      primary_contact_name: client.primary_contact_name ?? '',
      primary_contact_phone: client.primary_contact_phone ?? '',
      contact_email: client.contact_email ?? '',
      contact_phone: client.contact_phone ?? '',
      address: client.address ?? '',
      billing_email: client.billing_email ?? '',
      billing_address: client.billing_address ?? '',
      billing_terms: client.billing_terms ?? '',
      tax_number: client.tax_number ?? '',
      notes: client.notes ?? '',
    })
  }, [client, reset])

  const onSubmit = async (data: ClientFormData) => {
    if (!id) return
    await updateClient.mutateAsync({
      id,
      name: data.name,
      client_code: data.client_code || null,
      primary_contact_name: data.primary_contact_name || null,
      primary_contact_phone: data.primary_contact_phone || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      address: data.address || null,
      billing_email: data.billing_email || null,
      billing_address: data.billing_address || null,
      billing_terms: data.billing_terms || null,
      tax_number: data.tax_number || null,
      notes: data.notes || null,
    } as Parameters<typeof updateClient.mutateAsync>[0])
    navigate(`/dashboard/clients/${id}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <p className="text-label text-text-muted">Client not found.</p>
        <Link to="/dashboard/clients" className="text-label text-brand-600 underline">Back to clients</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Clients', path: '/dashboard/clients' },
        { label: client.name, path: `/dashboard/clients/${id}` },
        { label: 'Edit' },
      ]} />

      <div>
        <PageHeader title="Edit Client" subtitle="Update client details and billing information" />
      </div>

      <AppCard padding="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.name}>
          <Label>Client Name</Label>
          <Input
            type="text"
            placeholder="Enter client name"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            {...register('name')}
          />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <TextField>
          <Label>Client ID</Label>
          <Input
            type="text"
            placeholder="e.g. C-1458"
            autoCorrect="off"
            spellCheck={false}
            {...register('client_code')}
          />
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField>
            <Label>Primary Contact Name</Label>
            <Input type="text" placeholder="e.g. Mary Hennessy" autoCapitalize="words" {...register('primary_contact_name')} />
          </TextField>
          <TextField>
            <Label>Primary Contact Phone</Label>
            <Input type="tel" placeholder="+353 …" {...register('primary_contact_phone')} />
          </TextField>
        </div>

        <TextField isInvalid={!!errors.contact_email}>
          <Label>Contact Email</Label>
          <Input type="email" placeholder="client@example.com" {...register('contact_email')} />
          {errors.contact_email && <FieldError>{errors.contact_email.message}</FieldError>}
        </TextField>

        <TextField>
          <Label>Phone</Label>
          <Input type="tel" placeholder="+44 123 456 7890" {...register('contact_phone')} />
        </TextField>

        <TextField>
          <Label>Address</Label>
          <Input type="text" placeholder="Full address" {...register('address')} />
        </TextField>

        <div className="border-t border-border-subtle pt-5 space-y-4">
          <div>
            <Heading level={2} scale="body">Billing Information</Heading>
            <Text scale="caption" tone="muted" className="mt-0.5">
              Stored once at client level and inherited by every property under this client.
            </Text>
          </div>
          <TextField isInvalid={!!errors.billing_email}>
            <Label>Billing Email</Label>
            <Input type="email" placeholder="accounts@example.com" {...register('billing_email')} />
            {errors.billing_email && <FieldError>{errors.billing_email.message}</FieldError>}
          </TextField>
          <TextField>
            <Label>Billing Address</Label>
            <Input type="text" placeholder="Leave blank to use main address" {...register('billing_address')} />
          </TextField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField>
              <Label>Billing Terms</Label>
              <Input type="text" placeholder="30 days" {...register('billing_terms')} />
            </TextField>
            <TextField>
              <Label>Tax / VAT Number</Label>
              <Input type="text" {...register('tax_number')} />
            </TextField>
          </div>
        </div>

        <TextField>
          <Label>Notes</Label>
          <TextArea rows={3} placeholder="Any additional notes..." {...register('notes')} />
        </TextField>

        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" isDisabled={isSubmitting || updateClient.isPending}>
            {updateClient.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
          <Link
            to={`/dashboard/clients/${id}`}
            className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors"
          >
            Cancel
          </Link>
        </div>

        {updateClient.isError && (
          <p className="text-caption text-status-overdue">
            Failed to update client: {(updateClient.error as Error).message}
          </p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
