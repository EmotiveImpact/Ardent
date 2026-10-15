// SLA Policies admin page (Wave 10 / Task 105).
//
// Lists every sla_policies row for the org. Add / edit via inline modal,
// delete via confirm dialog (default policies cannot be deleted).
//
// Empty state: "Seed defaults" CTA which calls the
// `seed_default_sla_policies` RPC for the org.

import { useState } from 'react'
import { Button, Chip, Modal } from '@haumea/ui'
import { AppCard, FormSelect } from '@haumea/ui'
import { Plus, Pencil, Trash2, Sparkles, Clock, Briefcase } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { TableSkeleton } from '@/components/shared/skeletons'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAuth } from '@/hooks/use-auth'
import {
  useSlaPolicies,
  useUpsertSlaPolicy,
  useDeleteSlaPolicy,
  useSeedDefaultSlaPolicies,
  type UpsertSlaPolicyInput,
} from '@/lib/sla'
import type { SlaPolicy } from '@/lib/sla'

const PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
]

const inputClass =
  'bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-navy-950/30'

function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins}m`
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(mins / (60 * 24))
  const h = Math.floor((mins % (60 * 24)) / 60)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

interface DraftPolicy {
  id?: string
  name: string
  applies_to_priority: string
  applies_to_category: string
  response_minutes: number
  completion_minutes: number
  business_hours_only: boolean
  is_default: boolean
}

const emptyDraft: DraftPolicy = {
  name: '',
  applies_to_priority: '',
  applies_to_category: '',
  response_minutes: 120,
  completion_minutes: 1440,
  business_hours_only: false,
  is_default: false,
}

export default function SlaPoliciesPage() {
  const { profile } = useAuth()
  const orgId = profile?.organisation_id ?? ''
  const { data: policies, isLoading } = useSlaPolicies()
  const upsert = useUpsertSlaPolicy()
  const remove = useDeleteSlaPolicy()
  const seed = useSeedDefaultSlaPolicies()

  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState<DraftPolicy>(emptyDraft)
  const [confirmDelete, setConfirmDelete] = useState<SlaPolicy | null>(null)

  const openNew = () => {
    setDraft(emptyDraft)
    setModalOpen(true)
  }
  const openEdit = (p: SlaPolicy) => {
    setDraft({
      id: p.id,
      name: p.name,
      applies_to_priority: p.applies_to_priority ?? '',
      applies_to_category: p.applies_to_category ?? '',
      response_minutes: p.response_minutes,
      completion_minutes: p.completion_minutes,
      business_hours_only: p.business_hours_only,
      is_default: p.is_default,
    })
    setModalOpen(true)
  }

  const submitDraft = async () => {
    if (!orgId) return
    if (!draft.name.trim()) return
    if (draft.response_minutes <= 0 || draft.completion_minutes <= 0) return
    const payload: UpsertSlaPolicyInput = {
      id: draft.id,
      organisation_id: orgId,
      name: draft.name.trim(),
      applies_to_priority: draft.applies_to_priority || null,
      applies_to_category: draft.applies_to_category.trim() || null,
      response_minutes: Math.floor(draft.response_minutes),
      completion_minutes: Math.floor(draft.completion_minutes),
      business_hours_only: draft.business_hours_only,
      is_default: draft.is_default,
    }
    await upsert.mutateAsync(payload)
    setModalOpen(false)
  }

  const confirmDeletion = async () => {
    if (!confirmDelete) return
    await remove.mutateAsync({ id: confirmDelete.id, is_default: confirmDelete.is_default })
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'SLA Policies' },
        ]}
      />

      <SectionHeader
        variant="page"
        title="SLA Policies"
        subtitle="Define response and completion targets per priority and job category."
        action={
          <div className="flex items-center gap-2">
            {(policies?.length ?? 0) === 0 && !isLoading && (
              <Button
                variant="outline"
                size="sm"
                onPress={() => orgId && seed.mutate(orgId)}
                isDisabled={!orgId || seed.isPending}
              >
                <Sparkles size={14} />
                Seed defaults
              </Button>
            )}
            <Button variant="primary" size="sm" onPress={openNew} isDisabled={!orgId}>
              <Plus size={14} />
              Add policy
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
      ) : (policies ?? []).length === 0 ? (
        <AppCard padding="none" className="overflow-hidden">
          <EmptyState
            icon={Clock}
            title="No SLA policies yet"
            description="Define response and completion targets per priority. Seed the standard 5-tier set in one click, or add your own."
            action={
              <Button
                variant="primary"
                size="sm"
                onPress={() => orgId && seed.mutate(orgId)}
                isDisabled={!orgId || seed.isPending}
              >
                <Sparkles size={14} />
                Seed defaults
              </Button>
            }
          />
        </AppCard>
      ) : (
        <AppCard padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="SLA policies" className="w-full">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Priority
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Category
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Response
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Completion
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Hours
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Default
                  </th>
                  <th className="py-3 px-4 text-right text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Actions
                  </th>
                </tr></thead>
                <tbody>
                  {(policies ?? []).map((p) => (
                    <tr
                      key={p.id}
                      id={p.id}
                      className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0"
                    >
                      <td className="py-3 px-4 text-label font-medium text-text-primary">
                        {p.name}
                      </td>
                      <td className="py-3 px-4">
                        {p.applies_to_priority ? (
                          <Chip size="sm" variant="soft" color="default">
                            {p.applies_to_priority}
                          </Chip>
                        ) : (
                          <span className="text-caption text-text-muted">Any</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {p.applies_to_category ? (
                          <span className="inline-flex items-center gap-1">
                            <Briefcase size={11} className="text-text-muted" />
                            {p.applies_to_category}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {minutesLabel(p.response_minutes)}
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {minutesLabel(p.completion_minutes)}
                      </td>
                      <td className="py-3 px-4 text-caption text-text-secondary">
                        {p.business_hours_only ? '9–5 Mon–Fri' : '24/7'}
                      </td>
                      <td className="py-3 px-4">
                        {p.is_default ? (
                          <Chip size="sm" variant="soft" color="success">
                            Default
                          </Chip>
                        ) : (
                          <span className="text-caption text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={() => openEdit(p)}
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={() => setConfirmDelete(p)}
                            isDisabled={p.is_default}
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2
                              size={13}
                              className={p.is_default ? 'text-text-muted' : 'text-status-overdue'}
                            />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </AppCard>
      )}

      {/* Modal — add / edit (Wave 17C: HeroUI <Modal>) */}
      <Modal.Backdrop
        isOpen={modalOpen}
        onOpenChange={(next) => {
          if (!next) setModalOpen(false)
        }}
      >
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                {draft.id ? 'Edit SLA policy' : 'New SLA policy'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. High priority — gas"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                    Priority match
                  </label>
                  <FormSelect
                    value={draft.applies_to_priority}
                    onChange={(v) => setDraft({ ...draft, applies_to_priority: v })}
                    ariaLabel="Priority match"
                    options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                  />
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                    Category match (optional)
                  </label>
                  <input
                    type="text"
                    value={draft.applies_to_category}
                    onChange={(e) =>
                      setDraft({ ...draft, applies_to_category: e.target.value })
                    }
                    placeholder="e.g. gas, electrical, hvac"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                    Response (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={draft.response_minutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        response_minutes: Number(e.target.value) || 0,
                      })
                    }
                    className={inputClass}
                  />
                  <p className="text-micro text-text-muted mt-1">
                    {minutesLabel(Math.max(0, draft.response_minutes))}
                  </p>
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                    Completion (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={draft.completion_minutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        completion_minutes: Number(e.target.value) || 0,
                      })
                    }
                    className={inputClass}
                  />
                  <p className="text-micro text-text-muted mt-1">
                    {minutesLabel(Math.max(0, draft.completion_minutes))}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-label text-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.business_hours_only}
                    onChange={(e) =>
                      setDraft({ ...draft, business_hours_only: e.target.checked })
                    }
                    className="rounded border-border-strong accent-brand-500"
                  />
                  Business hours only (Mon–Fri 09:00–17:00 UK)
                </label>
                <label className="flex items-center gap-2 text-label text-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.is_default}
                    onChange={(e) =>
                      setDraft({ ...draft, is_default: e.target.checked })
                    }
                    className="rounded border-border-strong accent-brand-500"
                  />
                  Use as default fallback when no other policy matches
                </label>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={submitDraft}
                isDisabled={
                  !draft.name.trim() ||
                  draft.response_minutes <= 0 ||
                  draft.completion_minutes <= 0 ||
                  upsert.isPending
                }
              >
                {draft.id ? 'Save changes' : 'Create policy'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete SLA policy"
        message={
          confirmDelete
            ? `Delete "${confirmDelete.name}"? Jobs already linked to it will keep their targets, but new jobs won't match it.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDeletion}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
