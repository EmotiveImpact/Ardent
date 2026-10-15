import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { AppCard, PageHeader, Heading } from '@haumea/ui'
import {
  ArrowLeft,
  Trash2,
  Building2,
  Briefcase,
  Calendar,
  Flag,
  CheckCircle2,
} from 'lucide-react'
import { useAction, useUpdateAction, useDeleteAction } from '@/hooks/use-actions'
import { ACTION_STATUSES } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'



const STATUS_OPTIONS = [
  { label: 'Open', value: ACTION_STATUSES.OPEN },
  { label: 'In Progress', value: ACTION_STATUSES.IN_PROGRESS },
  { label: 'Resolved', value: ACTION_STATUSES.RESOLVED },
  { label: 'Closed', value: ACTION_STATUSES.CLOSED },
]

export default function ActionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: action, isLoading, error } = useAction(id!)
  const updateAction = useUpdateAction()
  const deleteAction = useDeleteAction()
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [showResolutionInput, setShowResolutionInput] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleDelete = async () => {
    await deleteAction.mutateAsync(id!)
    navigate('/dashboard/actions')
  }

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'resolved' || newStatus === 'closed') {
      setShowResolutionInput(true)
      return
    }
    await updateAction.mutateAsync({ id: id!, status: newStatus })
  }

  const handleResolve = async (status: string) => {
    await updateAction.mutateAsync({
      id: id!,
      status,
      resolution_notes: resolutionNotes || undefined,
    })
    setShowResolutionInput(false)
    setResolutionNotes('')
  }

  if (isLoading) {
    return <DetailPageSkeleton withTabs={false} />
  }

  if (error || !action) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/actions" className="inline-flex items-center gap-1.5 text-caption font-medium text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={14} />
          Back to Actions
        </Link>
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          {error ? `Failed to load action: ${(error as Error).message}` : 'Action not found.'}
        </div>
      </div>
    )
  }

  const propertyInfo = action.properties as { id: string; name: string; address: string } | null
  const jobInfo = action.jobs as { id: string; title: string } | null

  return (
    <div className="space-y-6 max-w-[900px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Actions', path: '/dashboard/actions' },
        { label: action.title },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <PageHeader title={action.title} />
            <Chip
              variant="soft"
              color={action.status === 'resolved' ? 'success' : action.status === 'open' ? 'accent' : action.status === 'in_progress' ? 'warning' : 'default'}
              size="sm"
            >
              {action.status.replace(/_/g, ' ')}
            </Chip>
          </div>
          <p className="text-label text-text-muted mt-0.5">Action / Defect</p>
        </div>
        <div className="flex gap-2">
          <Button
            className="border border-border-default text-text-secondary hover:bg-surface-page bg-transparent"
            size="sm"
            isDisabled={deleteAction.isPending}
            onPress={() => setConfirmOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title="Delete Action"
            message="Are you sure you want to delete this action? This action cannot be undone."
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <AppCard padding="md">
            <Heading level={2} scale="body" className="mb-3">Description</Heading>
            <p className="text-label text-text-secondary whitespace-pre-wrap">
              {action.description || 'No description provided.'}
            </p>
          </AppCard>

          {/* Resolution notes */}
          {action.resolution_notes && (
            <div className="bg-status-compliant/10 border border-status-compliant/30 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-status-compliant" />
                <h2 className="text-body font-semibold text-status-compliant">Resolution Notes</h2>
              </div>
              <p className="text-label text-text-primary whitespace-pre-wrap">
                {action.resolution_notes}
              </p>
            </div>
          )}

          {/* Status change */}
          <AppCard padding="md">
            <Heading level={2} scale="body" className="mb-3">Update Status</Heading>
            {showResolutionInput ? (
              <div className="space-y-3">
                <textarea
                  placeholder="Add resolution notes (optional)..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-border-default rounded-lg px-3 py-2 text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors placeholder:text-text-muted"
                />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onPress={() => handleResolve('resolved')}>
                    <CheckCircle2 size={14} /> Mark Resolved
                  </Button>
                  <Button variant="secondary" size="sm" onPress={() => handleResolve('closed')}>
                    Close
                  </Button>
                  <Button variant="outline" size="sm" onPress={() => setShowResolutionInput(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={action.status === opt.value ? 'primary' : 'outline'}
                    size="sm"
                    onPress={() => handleStatusChange(opt.value)}
                    isDisabled={action.status === opt.value || updateAction.isPending}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
          </AppCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <AppCard padding="md">
            <Heading level={2} scale="body" className="mb-4">Details</Heading>
            <dl className="space-y-4">
              <div className="flex items-start gap-2.5">
                <Flag size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Priority</dt>
                  <dd className="mt-0.5">
                    <Chip
                      variant="soft"
                      color={action.priority === 'high' || action.priority === 'critical' ? 'danger' : action.priority === 'medium' ? 'warning' : 'default'}
                      size="sm"
                    >
                      {action.priority}
                    </Chip>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Calendar size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Due Date</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{action.due_date ? formatDate(action.due_date) : 'Not set'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Calendar size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Created</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{formatDate(action.created_at)}</dd>
                </div>
              </div>
              {propertyInfo && (
                <div className="flex items-start gap-2.5">
                  <Building2 size={15} className="text-text-muted mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Property</dt>
                    <dd className="text-label mt-0.5">
                      <Link to={`/dashboard/properties/${propertyInfo.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                        {propertyInfo.name}
                      </Link>
                    </dd>
                  </div>
                </div>
              )}
              {jobInfo && (
                <div className="flex items-start gap-2.5">
                  <Briefcase size={15} className="text-text-muted mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Linked Job</dt>
                    <dd className="text-label mt-0.5">
                      <Link to={`/dashboard/jobs/${jobInfo.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                        {jobInfo.title}
                      </Link>
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </AppCard>
        </div>
      </div>
    </div>
  )
}
