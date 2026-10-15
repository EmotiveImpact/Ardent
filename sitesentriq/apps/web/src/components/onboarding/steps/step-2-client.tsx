import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Briefcase, Mail, Phone, Tag } from 'lucide-react'
import { FieldError, Input, Label, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'

import { useCreateClient } from '@/hooks/use-clients'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateOnboardingState } from '@/hooks/use-onboarding'
import { StepShell } from '../step-shell'

const FORM_ID = 'onboarding-step-2'

const schema = z.object({
  name: z.string().min(1, 'Client name is required'),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  contact_phone: z.string().optional(),
  sector: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const SECTORS = [
  'Retail',
  'Hospitality',
  'Office / Commercial',
  'Education',
  'Healthcare',
  'Industrial',
  'Residential',
  'Other',
]

interface Props {
  onAdvance: (clientId: string) => void
  onBack: () => void
  onSkipStep: () => void
}

export function Step2Client({ onAdvance, onBack, onSkipStep }: Props) {
  const { organisation } = useAuthContext()
  const createClient = useCreateClient()
  const update = useUpdateOnboardingState()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      sector: '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const notes = [
      values.contact_name ? `Primary contact: ${values.contact_name}` : null,
      values.sector ? `Sector: ${values.sector}` : null,
    ]
      .filter(Boolean)
      .join(' • ')

    const created = await createClient.mutateAsync({
      organisation_id: organisation?.id ?? '',
      name: values.name,
      contact_email: values.contact_email || undefined,
      contact_phone: values.contact_phone || undefined,
      notes: notes || undefined,
    })

    await update.mutateAsync({ current_step: 3 })
    onAdvance(created.id)
  }

  const labelCls =
    'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <Briefcase size={18} />
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">Add your first client</p>
          <p className="text-label text-text-secondary mt-0.5">
            Clients are the companies you work for. You'll add their properties next.
          </p>
        </div>
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.name}>
          <Label>Client name</Label>
          <Input type="text" placeholder="e.g. Acme Holdings Ltd" {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <TextField>
          <Label>Primary contact name</Label>
          <Input type="text" placeholder="e.g. Jane Smith" {...register('contact_name')} />
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField isInvalid={!!errors.contact_email}>
            <Label>Email</Label>
            <Input type="email" placeholder="jane@acme.example" {...register('contact_email')} />
            {errors.contact_email && <FieldError>{errors.contact_email.message}</FieldError>}
          </TextField>
          <TextField>
            <Label>Phone</Label>
            <Input type="tel" placeholder="+44 20 …" {...register('contact_phone')} />
          </TextField>
        </div>

        <div>
          <label className={labelCls}>Sector</label>
          <FormSelectController
            control={control}
            name="sector"
            ariaLabel="Sector"
            placeholder="Choose…"
            options={SECTORS.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </form>

      <StepShell
        formId={FORM_ID}
        onBack={onBack}
        onSkipStep={onSkipStep}
        isSubmitting={isSubmitting || createClient.isPending}
        submitLabel="Save client and continue"
      >
        <></>
      </StepShell>
    </>
  )
}

export function Step2Preview({ orgName }: { orgName?: string | null }) {
  return (
    <div className="space-y-4">
      <p className="text-micro uppercase tracking-[0.18em] text-text-muted font-medium">
        Live preview
      </p>
      <div className="rounded-xl bg-surface-card border border-border-default p-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <Briefcase size={16} />
          </span>
          <div>
            <p className="text-label font-semibold text-text-primary">Your first client</p>
            <p className="text-[11.5px] text-text-muted">
              Owned by {orgName || 'your organisation'}
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <Mail size={13} className="text-text-muted" /> Contact email
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <Phone size={13} className="text-text-muted" /> Phone number
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <Tag size={13} className="text-text-muted" /> Sector tag
          </li>
        </ul>
      </div>
      <p className="text-[11.5px] text-text-muted">
        We'll attach the property you add next to this client.
      </p>
    </div>
  )
}
