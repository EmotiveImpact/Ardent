import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader, Heading, Text } from '@haumea/ui'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ShieldCheck,
  Wrench,
  CalendarClock,
  ClipboardList,
  Eye,
  MessageSquare,
  Package,
  Plus,
  X,
} from 'lucide-react'
import { useAsset, useDeleteAsset } from '@/hooks/use-assets'
import { CustomFieldsCard } from '@/components/shared/custom-fields-card'
import { useComplianceItemsByAsset } from '@/hooks/use-compliance'
import { useJobsByProperty } from '@/hooks/use-jobs'
import { useMaintenancePlansByAsset } from '@/hooks/use-maintenance'
import { COMPLIANCE_TYPE_LABELS } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { NotesSection } from '@/components/shared/notes-section'
import { DetailPageSkeleton, ListSkeleton } from '@/components/shared/skeletons'

const STATUS_CHIP_COLOR: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  inactive: 'warning',
  decommissioned: 'danger',
}

const COMPLIANCE_CHIP_COLOR: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  compliant: 'success',
  due_soon: 'warning',
  overdue: 'danger',
  non_compliant: 'danger',
}

const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  compliant: 'Compliant',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  non_compliant: 'Non-Compliant',
}

const JOB_CHIP_COLOR: Record<string, 'success' | 'accent' | 'warning' | 'default'> = {
  completed: 'success',
  scheduled: 'accent',
  in_progress: 'warning',
}

type Tab = 'details' | 'compliance' | 'history' | 'maintenance' | 'notes' | 'parts'

interface PartOrder {
  id: string
  part_name: string
  quantity: number
  status: 'pending' | 'ordered' | 'received'
  ordered_date: string
  notes: string
}


function getPartOrders(assetId: string): PartOrder[] {
  try {
    const raw = localStorage.getItem(`part_orders_${assetId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePartOrders(assetId: string, orders: PartOrder[]) {
  localStorage.setItem(`part_orders_${assetId}`, JSON.stringify(orders))
}

function DetailRow({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div>
      <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{label}</dt>
      <dd className="mt-1 text-label text-text-secondary">{value || '-'}</dd>
    </div>
  )
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showPartForm, setShowPartForm] = useState(false)
  const [partOrders, setPartOrders] = useState<PartOrder[]>(() => getPartOrders(id || ''))
  // React Router reuses this component instance when only :id changes, and the
  // lazy useState init runs once — so A→B navigation kept A's part orders and
  // wrote new ones under B's key. Re-sync (and reset the tab) on id change.
  useEffect(() => {
    setPartOrders(getPartOrders(id || ''))
    setActiveTab('details')
  }, [id])
  const [newPart, setNewPart] = useState<{ part_name: string; quantity: number; status: 'pending' | 'ordered' | 'received'; notes: string }>({ part_name: '', quantity: 1, status: 'pending', notes: '' })

  const handleAddPart = () => {
    if (!newPart.part_name.trim() || !id) return
    const order: PartOrder = {
      id: crypto.randomUUID(),
      part_name: newPart.part_name.trim(),
      quantity: newPart.quantity,
      status: newPart.status,
      ordered_date: toLocalYmd(new Date()),
      notes: newPart.notes,
    }
    const updated = [...partOrders, order]
    setPartOrders(updated)
    savePartOrders(id, updated)
    setNewPart({ part_name: '', quantity: 1, status: 'pending', notes: '' })
    setShowPartForm(false)
  }

  const handleDeletePart = (partId: string) => {
    if (!id) return
    const updated = partOrders.filter((p) => p.id !== partId)
    setPartOrders(updated)
    savePartOrders(id, updated)
  }

  const handlePartStatusChange = (partId: string, newStatus: 'pending' | 'ordered' | 'received') => {
    if (!id) return
    const updated = partOrders.map((p) => (p.id === partId ? { ...p, status: newStatus } : p))
    setPartOrders(updated)
    savePartOrders(id, updated)
  }

  const { data: asset, isLoading, error } = useAsset(id!)
  const deleteAsset = useDeleteAsset()

  const { data: complianceItems, isLoading: complianceLoading } = useComplianceItemsByAsset(id)
  const { data: maintenancePlans, isLoading: maintenanceLoading } = useMaintenancePlansByAsset(id)

  const propertyId = asset?.property_id as string | undefined
  const { data: serviceJobs, isLoading: jobsLoading } = useJobsByProperty(propertyId)

  const handleDelete = async () => {
    if (!asset) return
    await deleteAsset.mutateAsync(asset.id)
    navigate('/dashboard/assets')
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !asset) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/assets" className="text-caption text-text-muted inline-flex items-center gap-1 hover:text-text-secondary transition-colors">
            <ArrowLeft size={14} />
            Back
          </Link>
          <PageHeader title="Asset Not Found" />
        </div>
        <AppCard padding="md">
          <p className="text-status-overdue text-label">
            {error ? (error as Error).message : 'This asset could not be found.'}
          </p>
        </AppCard>
      </div>
    )
  }

  const properties = asset.properties as { name: string; address: string } | null
  const areas = asset.areas as { name: string } | null
  const status = asset.status || 'active'

  const tabs: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
    { id: 'details', label: 'Details', icon: ClipboardList },
    { id: 'compliance', label: 'Compliance Items', icon: ShieldCheck },
    { id: 'history', label: 'Service History', icon: Wrench },
    { id: 'maintenance', label: 'Maintenance Plans', icon: CalendarClock },
    { id: 'notes', label: 'Notes', icon: MessageSquare },
    { id: 'parts', label: 'Order Parts', icon: Package },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Assets', path: '/dashboard/assets' },
        { label: asset.name },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <PageHeader title={asset.name} subtitle={asset.category} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onPress={() => navigate(`/dashboard/assets/${id}/edit`)}
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            isDisabled={deleteAsset.isPending}
            onPress={() => setConfirmOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title="Delete Asset"
            message={`Delete asset "${asset.name}"? This cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-default overflow-x-auto">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-label font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-navy-950 text-navy-950'
                    : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-default'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Asset Details */}
          <AppCard padding="md">
            <h2 className="text-label font-semibold text-text-primary mb-4">Asset Details</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailRow label="Category" value={asset.category} />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Status</dt>
                <dd className="mt-1">
                  <Chip size="sm" variant="soft" color={STATUS_CHIP_COLOR[status] || 'default'}>
                    {status}
                  </Chip>
                </dd>
              </div>
              <DetailRow label="Make" value={asset.make} />
              <DetailRow label="Model" value={asset.model} />
              <DetailRow label="Serial Number" value={asset.serial_number} />
              <DetailRow
                label="Install Date"
                value={
                  asset.install_date
                    ? new Date(asset.install_date).toLocaleDateString()
                    : undefined
                }
              />
            </dl>
          </AppCard>

          {/* Property & Area */}
          <AppCard padding="md">
            <h2 className="text-label font-semibold text-text-primary mb-4">Location</h2>
            <dl className="space-y-4">
              <DetailRow label="Property" value={properties?.name} />
              <DetailRow label="Address" value={properties?.address} />
              <DetailRow label="Area" value={areas?.name} />
            </dl>
          </AppCard>

          {/* Notes */}
          <AppCard padding="md" className="lg:col-span-2">
            <h2 className="text-label font-semibold text-text-primary mb-4">Notes</h2>
            <p className="text-label text-text-secondary whitespace-pre-wrap">
              {(asset as Record<string, unknown>).notes as string || 'No notes for this asset.'}
            </p>
          </AppCard>

          {/* Custom fields (00124) — hidden unless the org defined some */}
          <div className="lg:col-span-2">
            <CustomFieldsCard
              entity="asset"
              recordId={asset.id}
              values={(asset as { custom_fields?: Record<string, unknown> }).custom_fields}
            />
          </div>
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border-default">
            <h2 className="text-label font-semibold text-text-primary">Compliance Items</h2>
            <Text scale="caption" tone="muted" className="mt-0.5">Compliance obligations linked to this asset</Text>
          </div>

          {complianceLoading && <ListSkeleton rows={4} withAvatar={false} framed={false} />}

          {!complianceLoading && (!complianceItems || complianceItems.length === 0) && (
            <div className="text-center py-12">
              <ShieldCheck size={28} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
              <p className="text-label text-text-muted">No compliance items linked to this asset.</p>
            </div>
          )}

          {!complianceLoading && complianceItems && complianceItems.length > 0 && (
            <table aria-label="Compliance Items" className="overflow-hidden">
                <thead className="bg-surface-page"><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Type</th>
                  <th id="nextDue" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Next Due</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {complianceItems.map((item: Record<string, unknown>) => {
                    const itemStatus = (item.status as string) || 'compliant'
                    return (
                      <tr key={item.id as string} id={item.id as string} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                        <td className="py-3 px-4 text-label font-medium text-text-secondary">{item.name as string}</td>
                        <td className="py-3 px-4 text-label text-text-secondary">
                          {COMPLIANCE_TYPE_LABELS[item.compliance_type as string] || (item.compliance_type as string)}
                        </td>
                        <td className="py-3 px-4 text-label text-text-secondary">
                          {item.next_due ? formatDate(item.next_due as string) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <Chip size="sm" variant="soft" color={COMPLIANCE_CHIP_COLOR[itemStatus] || 'default'}>
                            {COMPLIANCE_STATUS_LABELS[itemStatus] || itemStatus}
                          </Chip>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/dashboard/compliance/${item.id}`}
                            className="inline-flex p-1.5 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border-default">
            <h2 className="text-label font-semibold text-text-primary">Service History</h2>
            <Text scale="caption" tone="muted" className="mt-0.5">Completed jobs at this asset's property</Text>
          </div>

          {jobsLoading && <ListSkeleton rows={4} withAvatar={false} framed={false} />}

          {!jobsLoading && (!serviceJobs || serviceJobs.length === 0) && (
            <div className="text-center py-12">
              <Wrench size={28} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
              <p className="text-label text-text-muted">No completed service jobs found for this property.</p>
            </div>
          )}

          {!jobsLoading && serviceJobs && serviceJobs.length > 0 && (
            <table aria-label="Service History" className="overflow-hidden">
                <thead className="bg-surface-page"><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Job Title</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Scheduled</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Completed</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {serviceJobs.map((job: Record<string, unknown>) => {
                    const jobStatus = (job.status as string) || 'completed'
                    return (
                      <tr key={job.id as string} id={job.id as string} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                        <td className="py-3 px-4 text-label font-medium text-text-secondary">{job.title as string}</td>
                        <td className="py-3 px-4 text-label text-text-secondary">
                          {job.scheduled_date ? formatDate(job.scheduled_date as string) : '-'}
                        </td>
                        <td className="py-3 px-4 text-label text-text-secondary">
                          {job.completed_date ? formatDate(job.completed_date as string) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <Chip size="sm" variant="soft" color={JOB_CHIP_COLOR[jobStatus] || 'default'}>
                            {jobStatus.replace('_', ' ')}
                          </Chip>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/dashboard/jobs/${job.id}`}
                            className="inline-flex p-1.5 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border-default">
            <h2 className="text-label font-semibold text-text-primary">Linked Maintenance Plans</h2>
            <Text scale="caption" tone="muted" className="mt-0.5">Recurring maintenance schedules for this asset</Text>
          </div>

          {maintenanceLoading && <ListSkeleton rows={3} withAvatar={false} framed={false} />}

          {!maintenanceLoading && (!maintenancePlans || maintenancePlans.length === 0) && (
            <div className="text-center py-12">
              <CalendarClock size={28} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
              <p className="text-label text-text-muted">No maintenance plans linked to this asset.</p>
            </div>
          )}

          {!maintenanceLoading && maintenancePlans && maintenancePlans.length > 0 && (
            <table aria-label="Maintenance Plans" className="overflow-hidden">
                <thead className="bg-surface-page"><tr>
                  <th id="planName" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Plan Name</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Frequency</th>
                  <th id="nextDue" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Next Due</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase">Status</th>
                </tr></thead>
                <tbody>
                  {maintenancePlans.map((plan) => {
                    const isActive = plan.is_active
                    return (
                      <tr key={plan.id} id={plan.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                        <td className="py-3 px-4 text-label font-medium text-text-secondary">{plan.name}</td>
                        <td className="py-3 px-4 text-label text-text-secondary capitalize">
                          {plan.frequency?.replace('_', ' ') || '-'}
                        </td>
                        <td className="py-3 px-4 text-label text-text-secondary">
                          {plan.next_due ? formatDate(plan.next_due) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <Chip size="sm" variant="soft" color={isActive ? 'success' : 'default'}>
                            {isActive ? 'Active' : 'Inactive'}
                          </Chip>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'notes' && (
        <NotesSection assetId={id} />
      )}

      {activeTab === 'parts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading level={2} scale="body">Part Orders</Heading>
              <Text scale="caption" tone="muted" className="mt-0.5">Track parts ordered for this asset</Text>
            </div>
            <Button
              variant={showPartForm ? 'outline' : 'primary'}
              size="sm"
              onPress={() => setShowPartForm(!showPartForm)}
            >
              {showPartForm ? <X size={14} /> : <Plus size={14} />}
              {showPartForm ? 'Cancel' : 'Add Part Order'}
            </Button>
          </div>

          {showPartForm && (
            <AppCard padding="md" className="space-y-4">
              <h3 className="text-label font-semibold text-text-primary">New Part Order</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Part Name *</label>
                  <input
                    value={newPart.part_name}
                    onChange={(e) => setNewPart({ ...newPart, part_name: e.target.value })}
                    placeholder="e.g. Filter cartridge"
                    className="w-full border border-border-default rounded-lg px-3 py-2 text-label text-text-primary bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40"
                  />
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newPart.quantity}
                    onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full border border-border-default rounded-lg px-3 py-2 text-label text-text-primary bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40"
                  />
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Status</label>
                  <FormSelect<'pending' | 'ordered' | 'received'>
                    value={newPart.status}
                    onChange={(v) => setNewPart({ ...newPart, status: v })}
                    ariaLabel="Status"
                    options={[
                      { value: 'pending', label: 'Pending' },
                      { value: 'ordered', label: 'Ordered' },
                      { value: 'received', label: 'Received' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Notes</label>
                  <input
                    value={newPart.notes}
                    onChange={(e) => setNewPart({ ...newPart, notes: e.target.value })}
                    placeholder="Optional notes"
                    className="w-full border border-border-default rounded-lg px-3 py-2 text-label text-text-primary bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!newPart.part_name.trim()}
                  onPress={handleAddPart}
                >
                  Add Part Order
                </Button>
              </div>
            </AppCard>
          )}

          {partOrders.length === 0 ? (
            <div className="bg-surface-card border border-border-default rounded-xl flex flex-col items-center justify-center py-12">
              <Package size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
              <p className="text-label text-text-muted">No parts ordered for this asset.</p>
              <Text scale="micro" tone="muted" className="mt-1">Click "Add Part Order" to track parts</Text>
            </div>
          ) : (
            <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table aria-label="Asset part orders" className="w-full">
                    <thead><tr>
                      <th className="text-left text-micro font-semibold text-text-muted uppercase tracking-[0.04em] px-4 py-3">Part Name</th>
                      <th className="text-left text-micro font-semibold text-text-muted uppercase tracking-[0.04em] px-4 py-3">Quantity</th>
                      <th className="text-left text-micro font-semibold text-text-muted uppercase tracking-[0.04em] px-4 py-3">Status</th>
                      <th className="text-left text-micro font-semibold text-text-muted uppercase tracking-[0.04em] px-4 py-3">Ordered Date</th>
                      <th className="text-left text-micro font-semibold text-text-muted uppercase tracking-[0.04em] px-4 py-3">Notes</th>
                      <th className="px-4 py-3"> </th>
                    </tr></thead>
                    <tbody>
                      {partOrders.map((part) => (
                        <tr key={part.id} id={part.id} className="border-b border-border-default last:border-0 hover:bg-surface-page/50 transition-colors">
                          <td className="px-4 py-3 text-label font-medium text-text-primary">{part.part_name}</td>
                          <td className="px-4 py-3 text-label text-text-secondary">{part.quantity}</td>
                          <td className="px-4 py-3">
                            <div className="w-32">
                              <FormSelect<'pending' | 'ordered' | 'received'>
                                value={part.status}
                                onChange={(v) => handlePartStatusChange(part.id, v)}
                                ariaLabel="Part status"
                                options={[
                                  { value: 'pending', label: 'Pending' },
                                  { value: 'ordered', label: 'Ordered' },
                                  { value: 'received', label: 'Received' },
                                ]}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-label text-text-secondary">{formatDate(part.ordered_date)}</td>
                          <td className="px-4 py-3 text-label text-text-secondary">{part.notes || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeletePart(part.id)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-status-overdue hover:bg-status-overdue/10 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
