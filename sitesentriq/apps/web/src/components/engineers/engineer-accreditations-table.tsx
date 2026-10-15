import { type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Button, Chip, Input, Label, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, Heading } from '@haumea/ui'
import { Trash2 } from 'lucide-react'

import { ACCREDITATION_TYPES } from '@/lib/constants'
import { getAccreditationStatusVisual, type StatusVisual } from '@/lib/status'
import { formatDate } from '@haumea/utils'
import type { EngineerAccreditation } from '@haumea/types'

export const engineerAccreditationSchema = z.object({
  accreditation_type: z.string().min(1, 'Type is required'),
  registration_number: z.string().optional(),
  qqi_level: z.string().optional(),
  issuing_body: z.string().optional(),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
})

export type EngineerAccreditationFormData = z.infer<typeof engineerAccreditationSchema>

export function getAccreditationStatus(expiryDate?: string): StatusVisual {
  if (!expiryDate) return getAccreditationStatusVisual('valid')
  const expiry = new Date(expiryDate)
  const today = new Date()
  const thirtyDays = new Date()
  thirtyDays.setDate(today.getDate() + 30)

  if (expiry < today) return getAccreditationStatusVisual('expired')
  if (expiry < thirtyDays) return getAccreditationStatusVisual('expiring')
  return getAccreditationStatusVisual('valid')
}

function getDaysUntilExpiry(expiryDate?: string): number | null {
  if (!expiryDate) return null
  const expiry = new Date(expiryDate)
  const today = new Date()
  expiry.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function EngineerAccreditationForm({
  form,
  onSubmit,
  isPending,
}: {
  form: UseFormReturn<EngineerAccreditationFormData>
  onSubmit: (data: EngineerAccreditationFormData) => void
  isPending: boolean
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <AppCard>
        <div className="space-y-4">
        <Heading level={3} scale="body">
          New Accreditation
        </Heading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Type *</label>
            <FormSelectController
              control={control}
              name="accreditation_type"
              ariaLabel="Type"
              placeholder="Select type..."
              options={Object.entries(ACCREDITATION_TYPES).map(([key, label]) => ({ value: key, label }))}
            />
            {errors.accreditation_type ? <p className="mt-1 text-micro text-status-overdue">{errors.accreditation_type.message}</p> : null}
          </div>
          <TextField>
            <Label>Registration Number</Label>
            <Input {...register('registration_number')} />
          </TextField>
          <div>
            <label className="mb-1 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">QQI Level</label>
            <FormSelectController
              control={control}
              name="qqi_level"
              ariaLabel="QQI Level"
              placeholder="Not applicable"
              clearable
              options={[
                { value: 'level_5', label: 'Level 5' },
                { value: 'level_6', label: 'Level 6' },
                { value: 'level_7', label: 'Level 7' },
                { value: 'level_8', label: 'Level 8' },
              ]}
            />
          </div>
          <TextField>
            <Label>Issuing Body</Label>
            <Input placeholder="QQI, RGII, Gas Safe, NICEIC..." {...register('issuing_body')} />
          </TextField>
          <TextField>
            <Label>Issue Date</Label>
            <Input type="date" {...register('issue_date')} />
          </TextField>
          <TextField>
            <Label>Expiry Date</Label>
            <Input type="date" {...register('expiry_date')} />
          </TextField>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? 'Adding...' : 'Add Accreditation'}
        </Button>
      </div>
        </div>
      </AppCard>
    </form>
  )
}

export function EngineerAccreditationsTable({
  accreditations,
  onDelete,
  isDeleting,
}: {
  accreditations: EngineerAccreditation[]
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table aria-label="Accreditations" className="w-full">
            <thead><tr>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Type</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Reg. Number</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">QQI / Body</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Issue Date</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Expiry Date</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Status</th>
              <th className="px-4 py-3"> </th>
            </tr></thead>
            <tbody>
              {accreditations.map((acc) => {
                const status = getAccreditationStatus(acc.expiry_date)
                const daysUntilExpiry = getDaysUntilExpiry(acc.expiry_date)
                return (
                  <tr key={acc.id} id={acc.id} className="border-b border-border-default transition-colors last:border-0 hover:bg-surface-page/50">
                    <td className="px-4 py-3 text-label font-medium text-text-primary">
                      {ACCREDITATION_TYPES[acc.accreditation_type] || acc.accreditation_type}
                    </td>
                    <td className="px-4 py-3 text-label text-text-secondary">{acc.registration_number || '-'}</td>
                    <td className="px-4 py-3 text-label text-text-secondary">
                      {[acc.qqi_level ? acc.qqi_level.replace('_', ' ') : null, acc.issuing_body].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-label text-text-secondary">{acc.issue_date ? formatDate(acc.issue_date) : '-'}</td>
                    <td className="px-4 py-3 text-label text-text-secondary">
                      {acc.expiry_date ? (
                        <span>
                          {formatDate(acc.expiry_date)}
                          {daysUntilExpiry !== null ? (
                            <span className="block text-micro text-text-muted">
                              {daysUntilExpiry < 0 ? `${Math.abs(daysUntilExpiry)} days overdue` : `${daysUntilExpiry} days left`}
                            </span>
                          ) : null}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Chip variant="soft" color={status.chipColor} size="sm">
                        {status.label}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onPress={() => onDelete(acc.id)} isDisabled={isDeleting}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
        </table>
      </div>
    </AppCard>
  )
}
