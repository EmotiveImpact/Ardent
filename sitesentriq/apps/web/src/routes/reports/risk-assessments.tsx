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
import { ShieldAlert, Plus, X, Filter } from 'lucide-react'

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const
const STATUS_OPTIONS = ['draft', 'submitted', 'approved'] as const



interface RiskAssessment {
  id: string
  organisation_id: string
  property_id: string
  reference: string
  risk_type: string
  severity: string
  status: string
  assessor: string
  assessment_date: string
  notes?: string
  created_at: string
  properties?: { name: string }
}

const assessmentSchema = z.object({
  property_id: z.string().min(1, 'Property is required'),
  reference: z.string().min(1, 'Reference is required'),
  risk_type: z.string().min(1, 'Risk type is required'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['draft', 'submitted', 'approved']),
  assessor: z.string().min(1, 'Assessor is required'),
  assessment_date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
})

type AssessmentFormData = z.infer<typeof assessmentSchema>

function useRiskAssessments(filters?: { severity?: string; status?: string }) {
  return useQuery({
    queryKey: ['risk-assessments', filters],
    queryFn: async () => {
      let query = supabase
        .from('risk_assessments')
        .select('*, properties(name)')
        .order('assessment_date', { ascending: false })
      if (filters?.severity) query = query.eq('severity', filters.severity)
      if (filters?.status) query = query.eq('status', filters.status)
      const { data, error } = await query
      if (error) throw error
      return data as RiskAssessment[]
    },
  })
}

function useCreateRiskAssessment() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (data: AssessmentFormData) => {
      const { data: result, error } = await supabase
        .from('risk_assessments')
        .insert({ ...data, organisation_id: profile?.organisation_id })
        .select('*, properties(name)')
        .single()
      if (error) throw error
      return result
    },
    onSuccess: () => {
      toast.success('Risk assessment created')
      queryClient.invalidateQueries({ queryKey: ['risk-assessments'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create assessment')
    },
  })
}

export default function RiskAssessmentsPage() {
  const [showForm, setShowForm] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filters = useMemo(() => ({
    severity: severityFilter || undefined,
    status: statusFilter || undefined,
  }), [severityFilter, statusFilter])

  const { data: assessments, isLoading } = useRiskAssessments(filters)
  const { data: properties } = useProperties()
  const createAssessment = useCreateRiskAssessment()

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<AssessmentFormData>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: { severity: 'medium', status: 'draft' },
  })

  const onSubmit = (data: AssessmentFormData) => {
    createAssessment.mutate(data, {
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
        { label: 'Risk Assessments' },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Risk Assessments" subtitle="Manage risk assessments across your properties" />
        </div>
        <Button
          variant="primary"
          size="sm"
          onPress={() => setShowForm(!showForm)}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'New Assessment'}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <AppCard padding="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TextField isRequired isInvalid={!!errors.reference}>
              <Label>Reference</Label>
              <Input {...register('reference')} />
              {errors.reference && <FieldError>{errors.reference.message}</FieldError>}
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
            <TextField isRequired isInvalid={!!errors.risk_type}>
              <Label>Risk Type</Label>
              <Input placeholder="e.g. Fire, Electrical, Legionella" {...register('risk_type')} />
              {errors.risk_type && <FieldError>{errors.risk_type.message}</FieldError>}
            </TextField>
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Severity *</label>
              <FormSelectController
                control={control}
                name="severity"
                ariaLabel="Severity"
                options={SEVERITY_OPTIONS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Status *</label>
              <FormSelectController
                control={control}
                name="status"
                ariaLabel="Status"
                options={STATUS_OPTIONS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              />
            </div>
            <TextField isRequired isInvalid={!!errors.assessor}>
              <Label>Assessor</Label>
              <Input {...register('assessor')} />
              {errors.assessor && <FieldError>{errors.assessor.message}</FieldError>}
            </TextField>
            <TextField isRequired isInvalid={!!errors.assessment_date}>
              <Label>Date</Label>
              <Input type="date" {...register('assessment_date')} />
              {errors.assessment_date && <FieldError>{errors.assessment_date.message}</FieldError>}
            </TextField>
            <TextField className="sm:col-span-2">
              <Label>Notes</Label>
              <TextArea rows={2} {...register('notes')} />
            </TextField>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" isDisabled={createAssessment.isPending}>
              {createAssessment.isPending && <Spinner size="sm" color="current" className="mr-1" />}
              Create Assessment
            </Button>
          </div>
        </form>
        </AppCard>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-text-muted" />
        <div className="w-48">
          <FormSelect
            value={severityFilter}
            onChange={setSeverityFilter}
            ariaLabel="Severity filter"
            placeholder="All Severities"
            clearable
            options={SEVERITY_OPTIONS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
          />
        </div>
        <div className="w-48">
          <FormSelect
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Status filter"
            placeholder="All Statuses"
            clearable
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
      ) : !assessments?.length ? (
        <AppCard padding="md">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <ShieldAlert size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No risk assessments yet</h2>
            <p className="text-label text-text-muted">Create a new risk assessment to get started.</p>
          </div>
        </AppCard>
      ) : (
        <table aria-label="Risk Assessments" className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Reference</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Risk Type</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Severity</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Assessor</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
            </tr></thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} id={a.id} className="border-b border-border-subtle hover:bg-surface-page">
                  <td className="px-4 py-3 text-label font-medium text-text-primary">{a.reference}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{a.properties?.name || '-'}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{a.risk_type}</td>
                  <td className="px-4 py-3">
                    <Chip
                      variant="soft"
                      color={a.severity === 'critical' || a.severity === 'high' ? 'danger' : a.severity === 'medium' ? 'warning' : 'accent'}
                      size="sm"
                    >
                      {a.severity.charAt(0).toUpperCase() + a.severity.slice(1)}
                    </Chip>
                  </td>
                  <td className="px-4 py-3">
                    <Chip
                      variant="soft"
                      color={a.status === 'approved' ? 'success' : a.status === 'submitted' ? 'accent' : 'default'}
                      size="sm"
                    >
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary">{a.assessor}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{formatDate(a.assessment_date)}</td>
                </tr>
              ))}
            </tbody>
        </table>
      )}
    </div>
  )
}
