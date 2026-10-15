import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, PageHeader, Heading, Text } from '@haumea/ui'

import { useCreateClient } from '@/hooks/use-clients'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAutosaveDraft } from '@/hooks/use-autosave-draft'

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

export default function NewClientPage() {
  const navigate = useNavigate()
  const { organisation } = useAuth()
  const createClient = useCreateClient()

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
      billing_terms: '30 days',
      tax_number: '',
      notes: '',
    },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form
  const { clearDraft } = useAutosaveDraft(form, { key: 'draft:client:new' })

  const onSubmit = async (data: ClientFormData) => {
    await createClient.mutateAsync({
      ...data,
      client_code: data.client_code || undefined,
      primary_contact_name: data.primary_contact_name || undefined,
      primary_contact_phone: data.primary_contact_phone || undefined,
      contact_email: data.contact_email || undefined,
      contact_phone: data.contact_phone || undefined,
      address: data.address || undefined,
      billing_email: data.billing_email || undefined,
      billing_address: data.billing_address || data.address || undefined,
      billing_terms: data.billing_terms || undefined,
      tax_number: data.tax_number || undefined,
      notes: data.notes || undefined,
      organisation_id: organisation?.id ?? '',
    })
    clearDraft()
    navigate('/dashboard/clients')
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Clients', path: '/dashboard/clients' },
        { label: 'New Client' },
      ]} />

      {/* Title */}
      <div>
        <PageHeader title="New Client" subtitle="Add a new client to your account" />
      </div>

      {/* Form Card */}
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
          <Button type="submit" variant="primary" isDisabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Client'}
          </Button>
          <Link to="/dashboard/clients" className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors">
            Cancel
          </Link>
        </div>

        {createClient.isError && (
          <p className="text-caption text-status-overdue">
            Failed to create client: {(createClient.error as Error).message}
          </p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
