import { useEffect } from 'react'
import { type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, Heading } from '@haumea/ui'
import { Trash2 } from 'lucide-react'

import { formatDate } from '@haumea/utils'
import type { TravelRecordWithRelations } from '@haumea/types'
import type { EngineerJobHistory } from './engineer-jobs-table'

export const engineerTravelSchema = z.object({
  from_postcode: z.string().min(1, 'From postcode is required'),
  to_postcode: z.string().min(1, 'To postcode is required'),
  distance_miles: z.number().min(0, 'Distance must be positive'),
  travel_date: z.string().min(1, 'Date is required'),
  job_id: z.string().optional(),
  notes: z.string().optional(),
})

export type EngineerTravelFormData = z.infer<typeof engineerTravelSchema>

export function EngineerTravelTimeForm({
  form,
  onSubmit,
  isPending,
  jobs,
  onLoadJobs,
}: {
  form: UseFormReturn<EngineerTravelFormData>
  onSubmit: (data: EngineerTravelFormData) => void
  isPending: boolean
  jobs: EngineerJobHistory[]
  onLoadJobs: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form

  useEffect(() => {
    if (jobs.length === 0) onLoadJobs()
  }, [jobs.length, onLoadJobs])

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <AppCard>
        <div className="space-y-4">
        <Heading level={3} scale="body">
          New Travel Record
        </Heading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField isRequired isInvalid={!!errors.travel_date}>
            <Label>Travel Date</Label>
            <Input type="date" {...register('travel_date')} />
            {errors.travel_date ? <FieldError>{errors.travel_date.message}</FieldError> : null}
          </TextField>
          <div>
            <label className="mb-1 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Job Reference</label>
            <FormSelectController
              control={control}
              name="job_id"
              ariaLabel="Job Reference"
              placeholder="None"
              clearable
              options={jobs.map((job) => ({ value: job.id, label: job.title }))}
            />
          </div>
          <TextField isRequired isInvalid={!!errors.from_postcode}>
            <Label>From Postcode</Label>
            <Input placeholder="e.g. SW1A 1AA" {...register('from_postcode')} />
            {errors.from_postcode ? <FieldError>{errors.from_postcode.message}</FieldError> : null}
          </TextField>
          <TextField isRequired isInvalid={!!errors.to_postcode}>
            <Label>To Postcode</Label>
            <Input placeholder="e.g. EC1A 1BB" {...register('to_postcode')} />
            {errors.to_postcode ? <FieldError>{errors.to_postcode.message}</FieldError> : null}
          </TextField>
          <TextField isRequired isInvalid={!!errors.distance_miles}>
            <Label>Distance (miles)</Label>
            <Input type="number" step="0.1" placeholder="0.0" {...register('distance_miles', { valueAsNumber: true })} />
            {errors.distance_miles ? <FieldError>{errors.distance_miles.message}</FieldError> : null}
          </TextField>
          <TextField>
            <Label>Notes</Label>
            <Input placeholder="Optional notes" {...register('notes')} />
          </TextField>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? 'Adding...' : 'Add Travel Record'}
        </Button>
      </div>
        </div>
      </AppCard>
    </form>
  )
}

export function EngineerTravelRecordsTable({
  records,
  onDelete,
  isDeleting,
}: {
  records: TravelRecordWithRelations[]
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table aria-label="Travel records" className="w-full">
            <thead><tr>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Date</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">From Postcode</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">To Postcode</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Distance (mi)</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Job Reference</th>
              <th className="px-4 py-3"> </th>
            </tr></thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id} id={rec.id} className="border-b border-border-default transition-colors last:border-0 hover:bg-surface-page/50">
                  <td className="px-4 py-3 text-label text-text-secondary">{rec.travel_date ? formatDate(rec.travel_date) : '-'}</td>
                  <td className="px-4 py-3 text-label font-medium text-text-primary">{rec.from_postcode || '-'}</td>
                  <td className="px-4 py-3 text-label font-medium text-text-primary">{rec.to_postcode || '-'}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{rec.distance_miles != null ? `${rec.distance_miles}` : '-'}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{rec.jobs?.title || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onPress={() => onDelete(rec.id)} isDisabled={isDeleting}>
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
    </AppCard>
  )
}
