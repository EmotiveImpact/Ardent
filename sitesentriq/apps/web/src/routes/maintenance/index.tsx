import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { Button } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader, Chip } from '@haumea/ui'
import { DataTable } from '@/components/shared/data-table'
import { TableSkeleton } from '@/components/shared/skeletons'
import { useMaintenancePlans, useDeleteMaintenancePlan, useGenerateJob } from '@/hooks/use-maintenance'
import { useProperties } from '@/hooks/use-properties'
import { FREQUENCIES } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { Plus, ClipboardList, Clock, Wrench, Play, ShieldCheck } from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
}

type MaintenancePlanRow = {
  id: string
  name: string
  frequency: string
  is_active: boolean
  maintenance_category?: string | null
  maintenance_type?: string | null
  next_due?: string | null
  last_completed?: string | null
  schedule_mode?: string | null
  sfg20_aligned?: boolean | null
  sfg20_schedule_ref?: string | null
  properties?: { name: string } | null
  assets?: { name: string } | null
}

function makeColumns(
  now: Date,
  onDelete: (id: string) => void,
  generateJob: { mutate: (plan: any) => void; isPending: boolean }
): ColumnDef<MaintenancePlanRow, any>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="text-label font-medium text-text-primary">{row.original.name}</span>
      ),
    },
    {
      id: 'property',
      header: 'Property',
      accessorFn: (row) => row.properties?.name ?? '',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">{row.original.properties?.name || '-'}</span>
      ),
    },
    {
      accessorKey: 'maintenance_category',
      header: 'Category',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary capitalize">
          {(row.original.maintenance_category || 'routine').replace('_', ' ')}
          {row.original.maintenance_type ? ` / ${row.original.maintenance_type}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'frequency',
      header: 'Frequency',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">
          {frequencyLabels[row.original.frequency] || row.original.frequency}
        </span>
      ),
    },
    {
      accessorKey: 'next_due',
      header: 'Next Due',
      cell: ({ row }) => {
        const isOverdue =
          row.original.is_active &&
          row.original.next_due &&
          new Date(row.original.next_due) < now
        return (
          <span className={`text-label ${isOverdue ? 'text-status-overdue font-medium' : 'text-text-secondary'}`}>
            {row.original.next_due ? formatDate(row.original.next_due) : '-'}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.is_active && row.original.next_due && (
            <Button
              variant="primary"
              size="sm"
              onPress={() => generateJob.mutate(row.original)}
              isDisabled={generateJob.isPending}
            >
              <Play size={10} />
              {generateJob.isPending ? 'Generating...' : 'Generate Job'}
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onPress={() => onDelete(row.original.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ]
}

export default function MaintenancePage() {
  const [propertyFilter, setPropertyFilter] = useState('')
  const [frequencyFilter, setFrequencyFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [confirmState, setConfirmState] = useState<{ open: boolean; id: string }>({ open: false, id: '' })

  const { data: plans, isLoading } = useMaintenancePlans({
    property_id: propertyFilter || undefined,
    frequency: frequencyFilter || undefined,
    maintenance_category: categoryFilter || undefined,
  })
  const { data: properties } = useProperties()
  const deletePlan = useDeleteMaintenancePlan()
  const generateJob = useGenerateJob()

  const now = useMemo(() => new Date(), [])

  const stats = useMemo(() => {
    if (!plans) return { total: 0, active: 0, overdue: 0, sfg20: 0 }
    const total = plans.length
    const active = plans.filter((p) => p.is_active).length
    const overdue = plans.filter(
      (p) => p.is_active && p.next_due && new Date(p.next_due) < now
    ).length
    const sfg20 = plans.filter((p) => p.sfg20_aligned).length
    return { total, active, overdue, sfg20 }
  }, [plans, now])

  const upcomingPlans = useMemo(() => {
    if (!plans) return []
    const in30Days = new Date()
    in30Days.setDate(in30Days.getDate() + 30)
    return plans
      .filter(
        (p) =>
          p.is_active &&
          p.next_due &&
          new Date(p.next_due) >= now &&
          new Date(p.next_due) <= in30Days
      )
      .sort(
        (a, b) =>
          new Date(a.next_due!).getTime() - new Date(b.next_due!).getTime()
      )
  }, [plans, now])

  const handleDelete = (id: string) => {
    setConfirmState({ open: true, id })
  }

  const handleConfirmDelete = () => {
    deletePlan.mutate(confirmState.id)
    setConfirmState({ open: false, id: '' })
  }

  const columns = useMemo(
    () => makeColumns(now, handleDelete, generateJob),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generateJob.isPending]
  )

  if (isLoading) {
    return <TableSkeleton cols={6} rows={6} />
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Maintenance Plans" subtitle="Schedule and track recurring maintenance" />
        </div>
        <Button asChild variant="primary" size="sm">
          <Link to="/dashboard/maintenance/new">
            <Plus size={14} />
            Create Plan
          </Link>
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AppCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Total Plans</span>
            <ClipboardList size={16} className="text-text-muted" />
          </div>
          <p className="text-headline font-bold tracking-[-0.03em] leading-none text-metric-teal">{stats.total}</p>
        </AppCard>
        <AppCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Active Plans</span>
            <Wrench size={16} className="text-text-muted" />
          </div>
          <p className="text-headline font-bold tracking-[-0.03em] leading-none text-metric-green">{stats.active}</p>
        </AppCard>
        <AppCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Overdue</span>
            <Clock size={16} className="text-text-muted" />
          </div>
          <p className="text-headline font-bold tracking-[-0.03em] leading-none text-metric-rose">{stats.overdue}</p>
        </AppCard>
        <AppCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">SFG20-aligned</span>
            <ShieldCheck size={16} className="text-text-muted" />
          </div>
          <p className="text-headline font-bold tracking-[-0.03em] leading-none text-brand-600">{stats.sfg20}</p>
          <p className="text-caption text-text-muted mt-1">of {stats.total} plans</p>
        </AppCard>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-56">
          <FormSelect
            value={propertyFilter}
            onChange={setPropertyFilter}
            ariaLabel="Filter by property"
            placeholder="All Properties"
            clearable
            options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
        <div className="w-48">
          <FormSelect
            value={frequencyFilter}
            onChange={setFrequencyFilter}
            ariaLabel="Filter by frequency"
            placeholder="All Frequencies"
            clearable
            options={Object.values(FREQUENCIES).map((f) => ({ value: f, label: frequencyLabels[f] || f }))}
          />
        </div>
        {/* Maintenance category — added in B1 to slice plans by the
            00043 maintenance_category column (routine / reactive /
            statutory / other). Without this the column on each row
            was decorative; you couldn't filter by it. */}
        <div className="w-48">
          <FormSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            ariaLabel="Filter by maintenance category"
            placeholder="All Categories"
            clearable
            options={[
              { value: 'routine', label: 'Routine' },
              { value: 'reactive', label: 'Reactive' },
              { value: 'statutory', label: 'Statutory' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
      </div>

      {/* Plans Table */}
      {!plans || plans.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <ClipboardList size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No maintenance plans</h2>
            <p className="text-label text-text-muted">Schedule recurring maintenance by creating your first plan.</p>
          </div>
        </div>
      ) : (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <DataTable data={plans as MaintenancePlanRow[]} columns={columns} />
        </div>
      )}

      {/* Upcoming Work */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 pt-5 pb-0">
          <h3 className="text-body font-semibold text-text-primary">Upcoming Work</h3>
          <p className="text-caption text-text-muted mt-0.5">Maintenance due in the next 30 days</p>
        </div>
        <div className="p-5">
          {upcomingPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-muted">
              <Clock size={28} strokeWidth={1.5} className="mb-2" />
              <p className="text-label">No maintenance due in the next 30 days</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {upcomingPlans.map((plan, idx) => (
                <div
                  key={plan.id}
                  className={`flex items-center justify-between py-3 ${
                    idx < upcomingPlans.length - 1 ? 'border-b border-border-subtle' : ''
                  }`}
                >
                  <div>
                    <p className="text-label font-medium text-text-primary inline-flex items-center gap-2">
                      {plan.name}
                      {plan.sfg20_aligned && (
                        <Chip variant="soft" color="primary" size="sm">SFG20</Chip>
                      )}
                    </p>
                    <p className="text-caption text-text-muted mt-0.5">
                      {plan.properties?.name || 'Unknown property'}
                      {plan.assets?.name ? ` / ${plan.assets.name}` : ''}
                      {' - '}
                      {frequencyLabels[plan.frequency] || plan.frequency}
                    </p>
                  </div>
                  <span className="text-label font-medium text-text-secondary">
                    Due: {formatDate(plan.next_due!)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmState.open}
        title="Delete Maintenance Plan"
        message="Are you sure you want to delete this plan?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmState({ open: false, id: '' })}
      />
    </div>
  )
}
