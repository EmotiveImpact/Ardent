import { useState, useMemo } from 'react'
import { Button, Chip, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { TableSkeleton } from '@/components/shared/skeletons'
import { AppCard, FormSelect, FormSelectController, PageHeader } from '@haumea/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useProperties } from '@/hooks/use-properties'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { formatDate } from '@haumea/utils'
import { BookOpen, Plus, X, Filter } from 'lucide-react'
import { toLocalYmd } from '@/lib/time-tracking/compute'

const LOG_TYPES = ['inspection', 'maintenance', 'incident', 'visitor'] as const


interface LogBookEntry {
  id: string
  organisation_id: string
  property_id: string
  log_type: string
  entry: string
  recorded_by: string
  log_date: string
  created_at: string
  properties?: { name: string }
}

const logEntrySchema = z.object({
  property_id: z.string().min(1, 'Property is required'),
  log_type: z.enum(['inspection', 'maintenance', 'incident', 'visitor']),
  entry: z.string().min(1, 'Entry is required'),
  recorded_by: z.string().min(1, 'Recorded by is required'),
  log_date: z.string().min(1, 'Date is required'),
})

type LogEntryFormData = z.infer<typeof logEntrySchema>

function useLogBookEntries(filters?: { log_type?: string }) {
  return useQuery({
    queryKey: ['log-book-entries', filters],
    queryFn: async () => {
      let query = supabase
        .from('log_book_entries')
        .select('*, properties(name)')
        .order('log_date', { ascending: false })
      if (filters?.log_type) query = query.eq('log_type', filters.log_type)
      const { data, error } = await query
      if (error) throw error
      return data as LogBookEntry[]
    },
  })
}

function useCreateLogBookEntry() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (data: LogEntryFormData) => {
      const { data: result, error } = await supabase
        .from('log_book_entries')
        .insert({ ...data, organisation_id: profile?.organisation_id })
        .select('*, properties(name)')
        .single()
      if (error) throw error
      return result
    },
    onSuccess: () => {
      toast.success('Log entry created')
      queryClient.invalidateQueries({ queryKey: ['log-book-entries'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create log entry')
    },
  })
}

export default function LogBooksPage() {
  const [showForm, setShowForm] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  const filters = useMemo(() => ({
    log_type: typeFilter || undefined,
  }), [typeFilter])

  const { data: entries, isLoading } = useLogBookEntries(filters)
  const { data: properties } = useProperties()
  const { profile } = useAuth()
  const createEntry = useCreateLogBookEntry()

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<LogEntryFormData>({
    resolver: zodResolver(logEntrySchema),
    defaultValues: {
      log_type: 'inspection',
      recorded_by: profile?.full_name || '',
      log_date: toLocalYmd(new Date()),
    },
  })

  const onSubmit = (data: LogEntryFormData) => {
    createEntry.mutate(data, {
      onSuccess: () => {
        reset()
        setShowForm(false)
      },
    })
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Reports', path: '/dashboard/reports' },
        { label: 'Log Books' },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Log Books" subtitle="Record inspections, maintenance, incidents, and visitor logs" />
        </div>
        <Button
          variant="primary"
          size="sm"
          onPress={() => setShowForm(!showForm)}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'New Entry'}
        </Button>
      </div>

      {/* Inline form */}
      {showForm && (
        <AppCard padding="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <TextField isRequired isInvalid={!!errors.log_date}>
              <Label>Date</Label>
              <Input type="date" {...register('log_date')} />
              {errors.log_date && <FieldError>{errors.log_date.message}</FieldError>}
            </TextField>
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Property *</label>
              <FormSelectController
                control={control}
                name="property_id"
                ariaLabel="Property"
                placeholder="Select property..."
                options={(properties || []).map((p) => ({ value: p.id, label: p.name }))}
              />
              {errors.property_id && <p className="text-caption text-status-overdue mt-1">{errors.property_id.message}</p>}
            </div>
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Log Type *</label>
              <FormSelectController
                control={control}
                name="log_type"
                ariaLabel="Log Type"
                options={LOG_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              />
            </div>
            <TextField isRequired isInvalid={!!errors.recorded_by}>
              <Label>Recorded By</Label>
              <Input {...register('recorded_by')} />
              {errors.recorded_by && <FieldError>{errors.recorded_by.message}</FieldError>}
            </TextField>
          </div>
          <TextField isRequired isInvalid={!!errors.entry}>
            <Label>Entry</Label>
            <TextArea rows={3} placeholder="Describe the log entry..." {...register('entry')} />
            {errors.entry && <FieldError>{errors.entry.message}</FieldError>}
          </TextField>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" isDisabled={createEntry.isPending}>
              {createEntry.isPending && <Spinner size="sm" color="current" className="mr-1" />}
              Add Entry
            </Button>
          </div>
        </form>
        </AppCard>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-text-muted" />
        <div className="w-48">
          <FormSelect
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Type filter"
            placeholder="All Types"
            clearable
            options={LOG_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
      ) : !entries?.length ? (
        <AppCard padding="md">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <BookOpen size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No log entries yet</h2>
            <p className="text-label text-text-muted">Create a new log entry to start recording.</p>
          </div>
        </AppCard>
      ) : (
        <table aria-label="Log Book Entries" className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Log Type</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Entry</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Recorded By</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} id={e.id} className="border-b border-border-subtle hover:bg-surface-page">
                  <td className="px-4 py-3 text-label text-text-secondary">{formatDate(e.log_date)}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{e.properties?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <Chip
                      variant="soft"
                      color={e.log_type === 'incident' ? 'danger' : e.log_type === 'maintenance' ? 'accent' : e.log_type === 'visitor' ? 'warning' : 'accent'}
                      size="sm"
                    >
                      {e.log_type.charAt(0).toUpperCase() + e.log_type.slice(1)}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary max-w-xs truncate">{e.entry}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{e.recorded_by}</td>
                </tr>
              ))}
            </tbody>
        </table>
      )}
    </div>
  )
}
