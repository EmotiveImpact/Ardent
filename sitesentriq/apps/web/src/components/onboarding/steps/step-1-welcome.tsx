import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, Building2, Users, Target, Wand2, Upload } from 'lucide-react'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateOnboardingState, useSeedSampleData } from '@/hooks/use-onboarding'
import { StepShell } from '../step-shell'
import { useNavigate } from 'react-router'

const FORM_ID = 'onboarding-step-1'

const schema = z.object({
  org_name: z.string().min(1, 'Organisation name is required'),
  business_type: z.string().min(1, 'Pick one'),
  team_size: z.string().min(1, 'Pick one'),
  primary_use_case: z.string().min(1, 'Pick one'),
})
type FormValues = z.infer<typeof schema>

const BUSINESS_TYPES = [
  { value: 'fm_company', label: 'Facilities management company' },
  { value: 'in_house_team', label: 'In-house facilities team' },
  { value: 'multi_tenant_landlord', label: 'Multi-tenant landlord' },
  { value: 'other', label: 'Other' },
]
const TEAM_SIZES = [
  { value: '1-5', label: '1–5 people' },
  { value: '6-25', label: '6–25 people' },
  { value: '26-100', label: '26–100 people' },
  { value: '100+', label: '100+ people' },
]
const USE_CASES = [
  { value: 'compliance', label: 'Compliance focus', desc: 'Stay on top of certificates and audits' },
  { value: 'ppm', label: 'PPM scheduling', desc: 'Plan recurring maintenance routines' },
  { value: 'reactive', label: 'Reactive jobs', desc: 'Respond to call-outs and defects' },
  { value: 'full', label: 'Full operations', desc: 'End-to-end facilities + billing' },
]

interface Props {
  onAdvance: () => void
  onSkipStep: () => void
}

export function Step1Welcome({ onAdvance, onSkipStep }: Props) {
  const { profile, organisation } = useAuthContext()
  const update = useUpdateOnboardingState()
  const seedSample = useSeedSampleData()
  const navigate = useNavigate()

  const firstName = (profile?.full_name || '').split(' ')[0] || 'there'

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      org_name: organisation?.name ?? '',
      business_type: '',
      team_size: '',
      primary_use_case: '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      // Update org row (best-effort — only if migration applied; silently ignore)
      if (organisation?.id) {
        await supabase
          .from('organisations')
          .update({
            name: values.org_name,
            business_type: values.business_type,
            team_size: values.team_size,
            primary_use_case: values.primary_use_case,
          })
          .eq('id', organisation.id)
      }
      await update.mutateAsync({ current_step: 2 })
      onAdvance()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
    }
  }

  const onUseSampleData = async () => {
    try {
      await seedSample.mutateAsync()
      await update.mutateAsync({
        completed: true,
        completed_at: new Date().toISOString(),
        skipped_steps: [2, 3, 4, 5],
      })
      toast.success('Sample data added — explore freely or delete from settings later.')
      navigate('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not seed sample data'
      toast.error(message)
    }
  }

  const labelCls =
    'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <Sparkles size={18} />
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">
            Welcome to Facilities OS, {firstName}!
          </p>
          <p className="text-label text-text-secondary mt-0.5">
            We'll get you up and running in under 10 minutes. Tell us a little about your team
            and we'll tailor the rest of the setup.
          </p>
        </div>
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.org_name}>
          <Label>Organisation name</Label>
          <Input type="text" placeholder="Acme Facilities Ltd" {...register('org_name')} />
          {errors.org_name && <FieldError>{errors.org_name.message}</FieldError>}
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Business type <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="business_type"
              ariaLabel="Business type"
              placeholder="Choose…"
              options={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label }))}
            />
            {errors.business_type && (
              <p className="mt-1 text-caption text-status-overdue">{errors.business_type.message}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>
              Team size <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="team_size"
              ariaLabel="Team size"
              placeholder="Choose…"
              options={TEAM_SIZES.map((t) => ({ value: t.value, label: t.label }))}
            />
            {errors.team_size && (
              <p className="mt-1 text-caption text-status-overdue">{errors.team_size.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Primary use case <span className="text-status-overdue">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {USE_CASES.map((u) => (
              <label
                key={u.value}
                className="flex items-start gap-2.5 p-3 border border-border-default rounded-lg cursor-pointer hover:border-brand-500/50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/5 transition-colors"
              >
                <input
                  type="radio"
                  value={u.value}
                  {...register('primary_use_case')}
                  className="mt-0.5 accent-brand-500"
                />
                <div className="min-w-0">
                  <p className="text-label font-medium text-text-primary">{u.label}</p>
                  <p className="text-caption text-text-muted mt-0.5">{u.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {errors.primary_use_case && (
            <p className="mt-1 text-caption text-status-overdue">{errors.primary_use_case.message}</p>
          )}
        </div>

        <div className="rounded-lg border border-dashed border-border-default bg-surface-page/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Wand2 size={16} className="text-brand-500 mt-0.5" />
            <div>
              <p className="text-[12.5px] font-medium text-text-primary">
                Just want to poke around first?
              </p>
              <p className="text-caption text-text-muted mt-0.5">
                We'll add a sample client, properties, assets and a couple of jobs you can
                explore — and you can delete it all from settings later.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={onUseSampleData}
              isDisabled={seedSample.isPending}
            >
              {seedSample.isPending ? 'Adding sample data…' : 'Fill with sample data'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => navigate('/dashboard/import')}
            >
              <Upload size={14} /> Import from spreadsheet
            </Button>
          </div>
          <p className="text-caption text-text-muted mt-2">
            Moving from another system? Bulk-import clients, properties, assets, contracts,
            subcontractors and maintenance plans from CSV — be live in a day.
          </p>
        </div>
      </form>

      <StepShell
        formId={FORM_ID}
        onSkipStep={onSkipStep}
        isSubmitting={isSubmitting || update.isPending}
        submitLabel="Save and continue"
      >
        <></>
      </StepShell>
    </>
  )
}

export function Step1Preview() {
  return (
    <div className="space-y-4">
      <p className="text-micro uppercase tracking-[0.18em] text-text-muted font-medium">
        What you'll get
      </p>
      <ul className="space-y-3">
        <PreviewRow icon={<Building2 size={15} />} label="A clean workspace tailored to your business type" />
        <PreviewRow icon={<Users size={15} />} label="Sized for your team — invite teammates after setup" />
        <PreviewRow icon={<Target size={15} />} label="Defaults focused on your primary use case" />
      </ul>
      <div className="mt-6 p-4 rounded-xl bg-surface-card border border-border-default">
        <p className="text-caption text-text-muted">
          You can change all of these later under{' '}
          <span className="text-text-secondary font-medium">Settings → Organisation</span>.
        </p>
      </div>
    </div>
  )
}

function PreviewRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/10 text-brand-500">
        {icon}
      </span>
      <span className="text-label text-text-secondary">{label}</span>
    </li>
  )
}
