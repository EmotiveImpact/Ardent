// Custom fields settings editor (00124). Define per-org fields for each entity;
// they then appear on that entity's detail pages via <CustomFieldsCard>.

import { useState } from 'react'
import { Link } from 'react-router'
import { AppCard, Button, Chip, FormSelect, Modal, PageHeader } from '@haumea/ui'
import { ArrowLeft, Plus, Trash2, SlidersHorizontal } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import {
  useAllCustomFieldDefinitions,
  useSaveCustomFieldDefinition,
  useDeleteCustomFieldDefinition,
} from '@/hooks/use-custom-fields'
import type { CustomFieldEntity, CustomFieldType } from '@haumea/types'

const ENTITIES: { value: CustomFieldEntity; label: string }[] = [
  { value: 'property', label: 'Properties' },
  { value: 'asset', label: 'Assets' },
  { value: 'client', label: 'Clients' },
  { value: 'job', label: 'Jobs' },
  { value: 'subcontractor', label: 'Subcontractors' },
  { value: 'contract', label: 'Contracts' },
]

const TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'boolean', label: 'Yes / No' },
]

const inputClass =
  'w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default'

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export default function CustomFieldsSettingsPage() {
  const [entity, setEntity] = useState<CustomFieldEntity>('property')
  const { data: defs = [] } = useAllCustomFieldDefinitions(entity)
  const saveDef = useSaveCustomFieldDefinition()
  const deleteDef = useDeleteCustomFieldDefinition()

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [optionsText, setOptionsText] = useState('')

  const submit = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    const key = slugify(trimmed)
    // Upsert by field_key: re-adding a label that maps to an existing key
    // updates it instead of hitting the unique(org,entity,field_key) error.
    const existing = defs.find((d) => d.field_key === key)
    saveDef.mutate(
      {
        id: existing?.id,
        entity,
        field_key: key,
        label: trimmed,
        field_type: type,
        options:
          type === 'select'
            ? optionsText.split(',').map((o) => o.trim()).filter(Boolean)
            : null,
        sort_order: defs.length,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setLabel('')
          setType('text')
          setOptionsText('')
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Custom fields' },
        ]}
      />
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard/settings"
          className="p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Back to settings"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <PageHeader title="Custom fields" subtitle="Add your own fields to any record type" />
      </div>

      <AppCard padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="min-w-56">
            <label className="mb-1 block text-caption font-medium text-text-secondary">
              Record type
            </label>
            <FormSelect
              value={entity}
              onChange={(v: string) => setEntity(v as CustomFieldEntity)}
              ariaLabel="Record type"
              options={ENTITIES}
            />
          </div>
          <Button variant="primary" size="sm" onPress={() => setOpen(true)}>
            <Plus size={14} /> Add field
          </Button>
        </div>

        {defs.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-text-muted">
            <SlidersHorizontal size={26} strokeWidth={1.5} className="mb-2" />
            <p className="text-label">No custom fields for {ENTITIES.find((e) => e.value === entity)?.label} yet.</p>
            <p className="text-caption">Add one to show it on every {entity} record.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {defs.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-text-primary">{f.label}</p>
                  <p className="text-caption text-text-muted">
                    key: {f.field_key}
                    {f.field_type === 'select' && f.options?.length
                      ? ` · ${f.options.join(', ')}`
                      : ''}
                  </p>
                </div>
                <Chip variant="soft" size="sm" className="capitalize">
                  {TYPES.find((t) => t.value === f.field_type)?.label ?? f.field_type}
                </Chip>
                {!f.is_active && <Chip variant="soft" size="sm" color="default">hidden</Chip>}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${f.label}`}
                  isDisabled={deleteDef.isPending}
                  onPress={() => deleteDef.mutate(f.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <Modal.Backdrop isOpen={open} onOpenChange={(n) => !n && setOpen(false)}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add custom field</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-caption font-medium text-text-secondary">
                    Field label <span className="text-status-overdue">*</span>
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Warranty expiry"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-caption font-medium text-text-secondary">Type</label>
                  <FormSelect
                    value={type}
                    onChange={(v: string) => setType(v as CustomFieldType)}
                    ariaLabel="Field type"
                    options={TYPES}
                  />
                </div>
                {type === 'select' && (
                  <div>
                    <label className="mb-1 block text-caption font-medium text-text-secondary">
                      Options (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={optionsText}
                      onChange={(e) => setOptionsText(e.target.value)}
                      className={inputClass}
                      placeholder="e.g. Gold, Silver, Bronze"
                    />
                  </div>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <div className="flex w-full justify-end gap-2">
                <Button variant="secondary" size="sm" onPress={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!label.trim() || saveDef.isPending}
                  onPress={submit}
                >
                  {saveDef.isPending ? 'Adding…' : 'Add field'}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
