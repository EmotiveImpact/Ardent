import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, TextField } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  MapPin,
  Clock,
  KeyRound,
  AlertTriangle,
  Building2,
  Layers,
  Box,
  ClipboardCheck,
  Wrench,
  Phone,
  UserCircle,
  Check,
  X,
  Plus,
  FileDown,
} from 'lucide-react'
import { useProperty, useDeleteProperty, useUpdateProperty } from '@/hooks/use-properties'
import { useEngineers } from '@/hooks/use-engineers'
import { useAreasWithAssetCount, useCreateArea, useUpdateArea, useDeleteArea } from '@/hooks/use-areas'
import { useExportBuildingPack } from '@/hooks/use-building-pack'
import { toast } from 'sonner'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { CustomFieldsCard } from '@/components/shared/custom-fields-card'
import { DetailPageSkeleton, CardGridSkeleton } from '@/components/shared/skeletons'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Timeline } from '@/components/shared/timeline'
import { NotesSection } from '@/components/shared/notes-section'
import { SiteContactsPanel } from '@/components/site/site-contacts-panel'
import type { Area, PropertyWithRelations } from '@haumea/types'

const areaSchema = z.object({
  name: z.string().min(1, 'Area name is required'),
  floor: z.string().optional(),
  description: z.string().optional(),
})

type AreaFormData = z.infer<typeof areaSchema>

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: property, isLoading, error } = useProperty(id!)
  const { data: engineers } = useEngineers()
  const technicianName = (id2: string | null | undefined) =>
    (engineers ?? []).find((e) => e.id === id2)?.name ?? null
  const deleteProperty = useDeleteProperty()
  const updateProperty = useUpdateProperty()
  // W3-T9 — golden-thread Building Information Pack export.
  const exportBuildingPack = useExportBuildingPack()
  const handleExportBuildingPack = () => {
    const promise = exportBuildingPack.mutateAsync({ propertyId: id! })
    toast.promise(promise, {
      loading: 'Assembling building pack…',
      success: (result) => {
        // The signed URL now carries Content-Disposition: attachment, so an
        // anchor click downloads a named file instead of rendering raw markup
        // in a blank tab.
        const a = document.createElement('a')
        a.href = result.html_url
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        const s = result.summary
        return `Building pack downloaded — ${s.assets} assets, ${s.compliance_items} compliance items, ${s.documents} documents.`
      },
      error: (err: unknown) =>
        err instanceof Error ? err.message : 'Could not export building pack',
    })
  }
  const [editingSiteManager, setEditingSiteManager] = useState(false)
  const [siteManagerValue, setSiteManagerValue] = useState('')
  // Sprint 1 / B4 — inline edit for the core property fields. The new
  // form supports name / address / property_code / region / takeover_date /
  // site_type / operating_hours / access_notes; the detail page used to
  // show all of these read-only with a disabled Edit button.
  const [editingProperty, setEditingProperty] = useState(false)
  const [propertyDraft, setPropertyDraft] = useState({
    name: '',
    address: '',
    property_code: '',
    region: '',
    takeover_date: '',
    site_type: '',
    operating_hours: '',
    access_notes: '',
    site_manager_name: '',
    site_manager_phone: '',
    primary_technician_id: '',
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Area state
  const { data: areasWithCount, isLoading: areasLoading } = useAreasWithAssetCount(id)
  const createArea = useCreateArea()
  const updateArea = useUpdateArea()
  const deleteArea = useDeleteArea()
  const [showAddArea, setShowAddArea] = useState(false)
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null)
  const [deleteAreaState, setDeleteAreaState] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })

  // Add area form
  const addAreaForm = useForm<AreaFormData>({
    resolver: zodResolver(areaSchema),
    defaultValues: { name: '', floor: '', description: '' },
  })

  // Edit area form
  const editAreaForm = useForm<AreaFormData>({
    resolver: zodResolver(areaSchema),
  })

  const handleDelete = async () => {
    await deleteProperty.mutateAsync(id!)
    navigate('/dashboard/properties')
  }

  const handleAddArea = async (data: AreaFormData) => {
    await createArea.mutateAsync({
      property_id: id!,
      name: data.name,
      floor: data.floor || undefined,
      description: data.description || undefined,
    })
    addAreaForm.reset()
    setShowAddArea(false)
  }

  const handleEditArea = async (data: AreaFormData) => {
    if (!editingAreaId) return
    await updateArea.mutateAsync({
      id: editingAreaId,
      name: data.name,
      // `|| null`, not `|| undefined` — supabase-js drops undefined keys from the
      // PATCH, so clearing Floor/Description was a silent no-op (the old value
      // reappeared on refetch). null actually writes the cleared value.
      floor: data.floor || null,
      description: data.description || null,
    })
    setEditingAreaId(null)
    editAreaForm.reset()
  }

  const handleDeleteArea = async () => {
    await deleteArea.mutateAsync({ id: deleteAreaState.id, propertyId: id! })
    setDeleteAreaState({ open: false, id: '', name: '' })
  }

  const startEditArea = (area: Area & { asset_count: number }) => {
    setEditingAreaId(area.id)
    editAreaForm.reset({
      name: area.name,
      floor: area.floor || '',
      description: area.description || '',
    })
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !property) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/properties" className="inline-flex items-center gap-1.5 text-caption font-medium text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={14} />
          Back to Properties
        </Link>
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          {error ? `Failed to load property: ${(error as Error).message}` : 'Property not found.'}
        </div>
      </div>
    )
  }

  const clientInfo = property.clients as {
    id: string
    name: string
    contact_email?: string
    contact_phone?: string
    billing_email?: string
    billing_address?: string
    billing_terms?: string
    tax_number?: string
  } | null
  const areas = areasWithCount || []

  // Sprint 1 / B4 — wire up the property edit panel.
  const startEditProperty = () => {
    setPropertyDraft({
      name: property.name ?? '',
      address: property.address ?? '',
      property_code: property.property_code ?? '',
      region: property.region ?? '',
      // takeover_date is a DATE in postgres — slice to YYYY-MM-DD for the
      // <input type="date">, otherwise the timestamp form trips the input.
      takeover_date: property.takeover_date ? String(property.takeover_date).slice(0, 10) : '',
      site_type: (property as { site_type?: string | null }).site_type ?? '',
      operating_hours: (property as { operating_hours?: string | null }).operating_hours ?? '',
      access_notes: (property as { access_notes?: string | null }).access_notes ?? '',
      site_manager_name: (property as { site_manager_name?: string | null }).site_manager_name ?? '',
      site_manager_phone: (property as { site_manager_phone?: string | null }).site_manager_phone ?? '',
      primary_technician_id: (property as { primary_technician_id?: string | null }).primary_technician_id ?? '',
    })
    setEditingProperty(true)
  }

  const cancelEditProperty = () => setEditingProperty(false)

  const saveEditProperty = async () => {
    if (!id) return
    const trimmedName = propertyDraft.name.trim()
    if (!trimmedName) {
      // RHF would normally handle this; we're not using a full form here
      // because the existing layout is dl/dt/dd-shaped and a tiny inline
      // form fits more naturally than a full RHF setup.
      return
    }
    await updateProperty.mutateAsync({
      id,
      name: trimmedName,
      address: propertyDraft.address.trim() || null,
      property_code: propertyDraft.property_code.trim() || null,
      region: propertyDraft.region.trim() || null,
      takeover_date: propertyDraft.takeover_date || null,
      site_type: propertyDraft.site_type.trim() || null,
      operating_hours: propertyDraft.operating_hours.trim() || null,
      access_notes: propertyDraft.access_notes.trim() || null,
      site_manager_name: propertyDraft.site_manager_name.trim() || null,
      site_manager_phone: propertyDraft.site_manager_phone.trim() || null,
      primary_technician_id: propertyDraft.primary_technician_id || null,
    } as Parameters<typeof updateProperty.mutateAsync>[0])
    setEditingProperty(false)
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Properties', path: '/dashboard/properties' },
        { label: property.name },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <PageHeader title={(property as { property_number?: string | null }).property_number ? `${(property as { property_number?: string | null }).property_number} · ${property.name}` : property.name} />
          {property.property_code && (
            <p className="text-caption font-medium text-brand-500 mt-0.5">{property.property_code}</p>
          )}
          {clientInfo && (
            <Link to={`/dashboard/clients/${clientInfo.id}`} className="text-brand-600 hover:text-brand-700 text-caption font-medium">
              {clientInfo.name}
            </Link>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!editingProperty ? (
            <Button variant="outline" size="sm" onPress={startEditProperty}>
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                isDisabled={updateProperty.isPending}
                onPress={cancelEditProperty}
              >
                <X className="w-4 h-4" /> Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isDisabled={updateProperty.isPending || !propertyDraft.name.trim()}
                onPress={saveEditProperty}
              >
                <Check className="w-4 h-4" />
                {updateProperty.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            isDisabled={exportBuildingPack.isPending}
            onPress={handleExportBuildingPack}
          >
            <FileDown className="w-4 h-4" />
            {exportBuildingPack.isPending ? 'Exporting…' : 'Export building pack'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={deleteProperty.isPending}
            onPress={() => setConfirmOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title="Delete Property"
            message="Are you sure you want to delete this property? This action cannot be undone."
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Property Details Card */}
        <AppCard padding="md">
          <h2 className="text-body font-semibold text-text-primary mb-4">Property Details</h2>
          {editingProperty ? (
            // Sprint 1 / B4 — inline edit form covering every field the
            // /new page can set. Stays read-only outside of edit mode so
            // the existing layout is unchanged for non-editing visits.
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                  Name
                </label>
                <input
                  type="text"
                  value={propertyDraft.name}
                  onChange={(e) => setPropertyDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={propertyDraft.address}
                  onChange={(e) => setPropertyDraft((d) => ({ ...d, address: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Property code
                  </label>
                  <input
                    type="text"
                    value={propertyDraft.property_code}
                    onChange={(e) => setPropertyDraft((d) => ({ ...d, property_code: e.target.value }))}
                    placeholder="P-1402"
                    className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Site takeover date
                  </label>
                  <input
                    type="date"
                    value={propertyDraft.takeover_date}
                    onChange={(e) => setPropertyDraft((d) => ({ ...d, takeover_date: e.target.value }))}
                    className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Region
                  </label>
                  <input
                    type="text"
                    value={propertyDraft.region}
                    onChange={(e) => setPropertyDraft((d) => ({ ...d, region: e.target.value }))}
                    placeholder="South East"
                    className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Site type
                  </label>
                  <input
                    type="text"
                    value={propertyDraft.site_type}
                    onChange={(e) => setPropertyDraft((d) => ({ ...d, site_type: e.target.value }))}
                    placeholder="Commercial"
                    className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                  Operating hours
                </label>
                <input
                  type="text"
                  value={propertyDraft.operating_hours}
                  onChange={(e) => setPropertyDraft((d) => ({ ...d, operating_hours: e.target.value }))}
                  placeholder="Mon–Fri 08:00–18:00"
                  className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                  Access notes
                </label>
                <textarea
                  rows={3}
                  value={propertyDraft.access_notes}
                  onChange={(e) => setPropertyDraft((d) => ({ ...d, access_notes: e.target.value }))}
                  placeholder="Key location, alarm code, contact for site access…"
                  className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Access manager phone</label>
                <input
                  value={propertyDraft.site_manager_phone}
                  onChange={(e) => setPropertyDraft((d) => ({ ...d, site_manager_phone: e.target.value }))}
                  placeholder="+353 …"
                  className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <div>
                <label className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Primary technician</label>
                <select
                  value={propertyDraft.primary_technician_id}
                  onChange={(e) => setPropertyDraft((d) => ({ ...d, primary_technician_id: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-border-default bg-surface-page px-3 py-2 text-label focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="">— None —</option>
                  {(engineers ?? []).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
          <dl className="space-y-4">
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Address</dt>
                <dd className="text-label text-text-secondary mt-0.5">{property.address}</dd>
              </div>
            </div>
            {property.site_type && (
              <div className="flex items-start gap-2.5">
                <Building2 size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Site Type</dt>
                  <dd className="text-label mt-0.5">
                    <Chip variant="soft" color="default" size="sm">
                      {property.site_type}
                    </Chip>
                  </dd>
                </div>
              </div>
            )}
            {property.region && (
              <div className="flex items-start gap-2.5">
                <Layers size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Region</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{property.region}</dd>
                </div>
              </div>
            )}
            {property.takeover_date && (
              <div className="flex items-start gap-2.5">
                <ClipboardCheck size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Site Takeover Date</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{property.takeover_date}</dd>
                </div>
              </div>
            )}
            {property.operating_hours && (
              <div className="flex items-start gap-2.5">
                <Clock size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Operating Hours</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{property.operating_hours}</dd>
                </div>
              </div>
            )}
            {property.access_notes && (
              <div className="flex items-start gap-2.5">
                <KeyRound size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Access Notes</dt>
                  <dd className="text-label text-text-secondary mt-0.5 whitespace-pre-wrap">{property.access_notes}</dd>
                </div>
              </div>
            )}
            {property.emergency_details && (
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Emergency Details</dt>
                  <dd className="text-label text-text-secondary mt-0.5 whitespace-pre-wrap">{property.emergency_details}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2.5">
              <UserCircle size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div className="flex-1">
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Site Manager</dt>
                {editingSiteManager ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={siteManagerValue}
                      onChange={(e) => setSiteManagerValue(e.target.value)}
                      placeholder="Enter site manager name"
                      className="border border-border-default rounded-lg px-2.5 py-1.5 text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors placeholder:text-text-muted flex-1"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        {/* `|| null` (not undefined): undefined is dropped from
                            the PATCH body, so blanking the field wouldn't clear
                            it — the old name would reappear after refetch. Cast
                            (like saveEditProperty) since the type models the
                            column as string|undefined, not nullable. */}
                        await updateProperty.mutateAsync({ id: id!, site_manager_name: siteManagerValue || null } as Parameters<typeof updateProperty.mutateAsync>[0])
                        setEditingSiteManager(false)
                      }}
                      className="p-1.5 rounded-lg hover:bg-brand-500/10 text-text-accent transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingSiteManager(false)}
                      className="p-1.5 rounded-lg hover:bg-surface-page text-text-muted transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <dd className="text-label text-text-secondary mt-0.5 flex items-center gap-2">
                    <span>{(property as { site_manager_name?: string | null }).site_manager_name || (property as PropertyWithRelations).site_manager || 'Not assigned'}</span>
                    <button
                      onClick={() => {
                        setSiteManagerValue((property as { site_manager_name?: string | null }).site_manager_name || (property as PropertyWithRelations).site_manager || '')
                        setEditingSiteManager(true)
                      }}
                      className="p-1 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  </dd>
                )}
              </div>
            </div>
            {(property as { site_manager_phone?: string | null }).site_manager_phone && (
              <div className="flex items-start gap-2.5">
                <Phone size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Access Manager Phone</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{(property as { site_manager_phone?: string | null }).site_manager_phone}</dd>
                </div>
              </div>
            )}
            {technicianName((property as { primary_technician_id?: string | null }).primary_technician_id) && (
              <div className="flex items-start gap-2.5">
                <Wrench size={15} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Primary Technician</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{technicianName((property as { primary_technician_id?: string | null }).primary_technician_id)}</dd>
                </div>
              </div>
            )}
          </dl>
          )}
        </AppCard>

        {/* Client Info Card */}
        {clientInfo && (
          <AppCard padding="md">
            <h2 className="text-body font-semibold text-text-primary mb-4">Client Information</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Client Name</dt>
                <dd className="text-label text-text-secondary mt-0.5">
                  <Link to={`/dashboard/clients/${clientInfo.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                    {clientInfo.name}
                  </Link>
                </dd>
              </div>
              {clientInfo.contact_email && (
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Email</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{clientInfo.contact_email}</dd>
                </div>
              )}
              {clientInfo.contact_phone && (
                <div>
                  <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Phone</dt>
                  <dd className="text-label text-text-secondary mt-0.5">{clientInfo.contact_phone}</dd>
                </div>
              )}
              <div className="border-t border-border-subtle pt-4">
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Billing Source</dt>
                <dd className="text-label text-text-secondary mt-0.5">
                  Client-level billing only
                  {clientInfo.billing_email ? ` · ${clientInfo.billing_email}` : ''}
                  {clientInfo.billing_terms ? ` · ${clientInfo.billing_terms}` : ''}
                </dd>
              </div>
            </dl>
          </AppCard>
        )}
      </div>

      {/* Areas & Zones Section */}
      <AppCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-body font-semibold text-text-primary">Areas & Zones</h2>
            <p className="text-caption text-text-muted mt-0.5">Organize assets by area, zone, or floor within this property</p>
          </div>
          {!showAddArea && (
            <Button variant="primary" size="sm" onPress={() => setShowAddArea(true)}>
              <Plus size={14} />
              Add Area
            </Button>
          )}
        </div>

        {/* Add Area Form */}
        {showAddArea && (
          <div className="border border-brand-200 bg-brand-50/30 rounded-xl p-4 mb-4">
            <h3 className="text-label font-semibold text-text-primary mb-3">New Area</h3>
            <form onSubmit={addAreaForm.handleSubmit(handleAddArea)} className="space-y-3">
              <TextField isRequired isInvalid={!!addAreaForm.formState.errors.name}>
                <Label>Name</Label>
                <Input type="text" placeholder="e.g. Ground Floor, Server Room, Roof" autoFocus {...addAreaForm.register('name')} />
                {addAreaForm.formState.errors.name && <FieldError>{addAreaForm.formState.errors.name.message}</FieldError>}
              </TextField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField>
                  <Label>Floor</Label>
                  <Input type="text" placeholder="e.g. Ground, 1st, Basement" {...addAreaForm.register('floor')} />
                </TextField>
                <TextField>
                  <Label>Description</Label>
                  <Input type="text" placeholder="Brief description" {...addAreaForm.register('description')} />
                </TextField>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isDisabled={createArea.isPending}
                >
                  {createArea.isPending ? 'Adding...' : 'Add Area'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onPress={() => { setShowAddArea(false); addAreaForm.reset() }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Areas List */}
        {areasLoading ? (
          <CardGridSkeleton count={3} columns={3} />
        ) : areas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Layers size={32} strokeWidth={1.5} className="text-text-muted mb-3" />
            <p className="text-label text-text-muted text-center">
              No areas defined — Add areas to organize assets by zone or floor
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {areas.map((area) => (
              <AppCard key={area.id} padding="sm">
                {editingAreaId === area.id ? (
                  // Edit form inline
                  <form onSubmit={editAreaForm.handleSubmit(handleEditArea)} className="space-y-3">
                    <TextField isRequired isInvalid={!!editAreaForm.formState.errors.name}>
                      <Label>Name</Label>
                      <Input type="text" autoFocus {...editAreaForm.register('name')} />
                      {editAreaForm.formState.errors.name && <FieldError>{editAreaForm.formState.errors.name.message}</FieldError>}
                    </TextField>
                    <TextField>
                      <Label>Floor</Label>
                      <Input type="text" {...editAreaForm.register('floor')} />
                    </TextField>
                    <TextField>
                      <Label>Description</Label>
                      <Input type="text" {...editAreaForm.register('description')} />
                    </TextField>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isDisabled={updateArea.isPending}
                      >
                        {updateArea.isPending ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onPress={() => { setEditingAreaId(null); editAreaForm.reset() }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  // Display card
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Layers size={15} className="text-brand-500 shrink-0" />
                        <h3 className="text-label font-semibold text-text-primary">{area.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditArea(area)}
                          className="p-1.5 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors"
                          aria-label={`Edit ${area.name}`}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteAreaState({ open: true, id: area.id, name: area.name })}
                          className="p-1.5 rounded-lg hover:bg-status-overdue/10 text-text-muted hover:text-status-overdue transition-colors"
                          aria-label={`Delete ${area.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {area.floor && (
                      <span className="inline-block bg-surface-page text-muted-foreground text-micro px-2 py-0.5 rounded mb-2">
                        Floor: {area.floor}
                      </span>
                    )}
                    {area.description && (
                      <p className="text-caption text-text-muted mb-2">{area.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-auto pt-1 border-t border-border-subtle">
                      <Box size={12} className="text-text-muted" />
                      <span className="text-micro text-text-muted">
                        {area.asset_count} asset{area.asset_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </>
                )}
              </AppCard>
            ))}
          </div>
        )}
      </AppCard>

      {/* Delete Area Confirm Dialog */}
      <ConfirmDialog
        open={deleteAreaState.open}
        title="Delete Area"
        message={`Delete area "${deleteAreaState.name}"? Assets linked to this area will need to be reassigned.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteArea}
        onCancel={() => setDeleteAreaState({ open: false, id: '', name: '' })}
      />

      {/* Related Modules Card */}
      <AppCard padding="md">
        <h2 className="text-body font-semibold text-text-primary mb-4">Related Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to={`/dashboard/assets?property_id=${property.id}`}>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-surface-page transition-colors">
              <Box size={18} className="text-metric-teal" />
              <span className="text-label font-medium text-text-secondary">Assets</span>
            </div>
          </Link>
          <Link to={`/dashboard/compliance?property_id=${property.id}`}>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-surface-page transition-colors">
              <ClipboardCheck size={18} className="text-metric-green" />
              <span className="text-label font-medium text-text-secondary">Compliance</span>
            </div>
          </Link>
          <Link to={`/dashboard/maintenance?property_id=${property.id}`}>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-surface-page transition-colors">
              <Wrench size={18} className="text-metric-amber" />
              <span className="text-label font-medium text-text-secondary">Maintenance</span>
            </div>
          </Link>
        </div>
      </AppCard>

      {/* Notes */}
      <NotesSection propertyId={id} />

      {/* Site contacts (Wave 14 / Task 114) — invite tenant-portal users */}
      {clientInfo && id && (
        <SiteContactsPanel propertyId={id} clientId={clientInfo.id} />
      )}

      {/* Custom fields (00124) — hidden unless the org defined some */}
      <CustomFieldsCard
        entity="property"
        recordId={property.id}
        values={(property as { custom_fields?: Record<string, unknown> }).custom_fields}
      />

      {/* Site Timeline */}
      <AppCard padding="md">
        <h2 className="text-body font-semibold text-text-primary mb-4">Timeline</h2>
        <Timeline propertyId={id} limit={15} />
      </AppCard>
    </div>
  )
}
