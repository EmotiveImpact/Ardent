// Renders an org's custom fields for one entity record (00124). Drop it on any
// entity detail page: <CustomFieldsCard entity="property" recordId={id}
// values={record.custom_fields} />. Hidden entirely when the org has defined
// no custom fields for that entity.

import { useEffect, useRef, useState } from 'react'
import { AppCard, Button, FormSelect, Switch } from '@haumea/ui'
import { SlidersHorizontal } from 'lucide-react'
import {
  useCustomFieldDefinitions,
  useSaveCustomFieldValues,
} from '@/hooks/use-custom-fields'
import type { CustomFieldEntity } from '@haumea/types'

const inputClass =
  'w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default'

export function CustomFieldsCard({
  entity,
  recordId,
  values,
}: {
  entity: CustomFieldEntity
  recordId: string
  values?: Record<string, unknown> | null
}) {
  const { data: defs = [] } = useCustomFieldDefinitions(entity)
  const save = useSaveCustomFieldValues(entity)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  // Track whether the user has edited — so a background refetch (window
  // refocus, or another query's invalidation) can't re-seed the draft and
  // wipe in-progress edits. (Same class as the dashboard-customize fix.)
  const dirty = useRef(false)

  // Reset + seed when switching to a different record.
  useEffect(() => {
    dirty.current = false
    setDraft({ ...(values ?? {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  // Sync from server values (initial async arrival + external updates) ONLY
  // while the form is untouched.
  useEffect(() => {
    if (!dirty.current) setDraft({ ...(values ?? {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])

  if (defs.length === 0) return null

  const set = (key: string, value: unknown) => {
    dirty.current = true
    setDraft((d) => ({ ...d, [key]: value }))
  }

  return (
    <AppCard padding="md">
      <h3 className="text-body font-semibold text-text-primary mb-3 inline-flex items-center gap-2">
        <SlidersHorizontal size={15} aria-hidden /> Additional details
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {defs.map((f) => {
          const v = draft[f.field_key]
          return (
            <div key={f.id}>
              <label className="mb-1 block text-caption font-medium text-text-secondary">
                {f.label}
              </label>
              {f.field_type === 'select' ? (
                <FormSelect
                  value={typeof v === 'string' ? v : ''}
                  onChange={(val: string) => set(f.field_key, val)}
                  ariaLabel={f.label}
                  placeholder="Select…"
                  options={[
                    { value: '', label: '—' },
                    ...(f.options ?? []).map((o) => ({ value: o, label: o })),
                  ]}
                />
              ) : f.field_type === 'boolean' ? (
                <div className="pt-1">
                  <Switch
                    isSelected={v === true}
                    onChange={() => set(f.field_key, v !== true)}
                    size="sm"
                    aria-label={f.label}
                  />
                </div>
              ) : (
                <input
                  type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                  value={v == null ? '' : String(v)}
                  onChange={(e) =>
                    set(
                      f.field_key,
                      f.field_type === 'number'
                        ? e.target.value === ''
                          ? null
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  className={inputClass}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4">
        <Button
          variant="primary"
          size="sm"
          isDisabled={save.isPending}
          onPress={() =>
            save.mutate(
              { id: recordId, values: draft },
              // Clear dirty so the post-save refetch re-syncs cleanly.
              { onSuccess: () => { dirty.current = false } },
            )
          }
        >
          {save.isPending ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </AppCard>
  )
}
