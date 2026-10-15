import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Switch } from '@haumea/ui'
import { FormSelect, PageHeader, Heading, Text } from '@haumea/ui'
import { Plus, Sparkles, RefreshCw, Trash2, Save, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import {
  fetchRules,
  fetchRecentLog,
  DEFAULT_WEIGHTS,
  type AutoAssignRule,
  type AutoAssignWeights,
  type AutoAssignLogRow,
} from '@/lib/auto-assign'
import { ListSkeleton } from '@/components/shared/skeletons'

type Tab = 'rules' | 'activity' | 'settings'

const ACCREDITATION_OPTIONS = ['Gas Safe', 'NICEIC', 'F-Gas', 'IPAF', 'OFTEC', 'CSCS']

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'gas', label: 'Gas' },
  { value: 'boiler', label: 'Boiler' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'fire_safety', label: 'Fire Safety' },
  { value: 'refrigeration', label: 'Refrigeration' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'air_conditioning', label: 'Air Conditioning' },
  { value: 'lift', label: 'Lift / Height' },
]

interface RuleDraft {
  id?: string
  name: string
  category: string | null
  required_accreditations: string[]
  max_distance_km: number
  prefer_familiar: boolean
  weight_overrides: AutoAssignWeights
  enabled: boolean
}

const emptyDraft: RuleDraft = {
  name: '',
  category: '',
  required_accreditations: [],
  max_distance_km: 80,
  prefer_familiar: true,
  weight_overrides: { ...DEFAULT_WEIGHTS },
  enabled: true,
}

function ruleToDraft(rule: AutoAssignRule & { id?: string; name?: string }): RuleDraft {
  return {
    id: rule.id,
    name: rule.name ?? 'Unnamed rule',
    category: rule.category ?? '',
    required_accreditations: rule.required_accreditations ?? [],
    max_distance_km: rule.max_distance_km ?? 80,
    prefer_familiar: rule.prefer_familiar ?? true,
    weight_overrides: { ...DEFAULT_WEIGHTS, ...(rule.weight_overrides ?? {}) },
    enabled: rule.enabled ?? true,
  }
}

export default function AutoAssignAdminPage() {
  const { organisation, profile } = useAuth()
  const orgId = organisation?.id ?? profile?.organisation_id ?? ''
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('rules')

  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const isEditing = draft !== null
  const [pendingDeleteRule, setPendingDeleteRule] = useState<{ id: string; name: string } | null>(
    null,
  )

  // Rules
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
  } = useQuery({
    queryKey: ['auto-assign-rules', orgId],
    enabled: !!orgId,
    queryFn: () => fetchRules(orgId),
  })

  const upsertMutation = useMutation({
    mutationFn: async (d: RuleDraft) => {
      const payload = {
        organisation_id: orgId,
        name: d.name,
        category: d.category || null,
        required_accreditations: d.required_accreditations,
        max_distance_km: d.max_distance_km,
        prefer_familiar: d.prefer_familiar,
        weight_overrides: d.weight_overrides,
        enabled: d.enabled,
        created_by_user_id: profile?.id ?? null,
      }
      if (d.id) {
        const { error } = await supabase
          .from('auto_assignment_rules')
          .update(payload)
          .eq('id', d.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('auto_assignment_rules').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Rule saved')
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['auto-assign-rules', orgId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('auto_assignment_rules')
        .update({ enabled })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-assign-rules', orgId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('auto_assignment_rules')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Rule deleted')
      queryClient.invalidateQueries({ queryKey: ['auto-assign-rules', orgId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Activity
  const {
    data: log,
    isLoading: logLoading,
    refetch: refetchLog,
  } = useQuery({
    queryKey: ['auto-assign-log', orgId],
    enabled: !!orgId && tab === 'activity',
    queryFn: () => fetchRecentLog(orgId, 100),
  })

  const [logFilter, setLogFilter] = useState<'all' | 'apply' | 'suggest'>('all')
  const filteredLog = useMemo<AutoAssignLogRow[]>(() => {
    if (!log) return []
    if (logFilter === 'all') return log
    return log.filter((l) => l.mode === logFilter)
  }, [log, logFilter])

  // Settings
  const { data: settings } = useQuery({
    queryKey: ['auto-assign-settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_assignment_settings')
        .select('*')
        .eq('organisation_id', orgId)
        .maybeSingle()
      if (error) throw error
      return (
        data ?? {
          organisation_id: orgId,
          auto_assign_on_create: false,
          notify_on_auto_assign: true,
          confidence_threshold: 70,
        }
      )
    },
  })

  const [autoOnCreate, setAutoOnCreate] = useState(false)
  const [notifyOnAssign, setNotifyOnAssign] = useState(true)
  const [confidenceThreshold, setConfidenceThreshold] = useState(70)

  useEffect(() => {
    if (settings) {
      setAutoOnCreate(!!settings.auto_assign_on_create)
      setNotifyOnAssign(!!settings.notify_on_auto_assign)
      setConfidenceThreshold(settings.confidence_threshold ?? 70)
    }
  }, [settings])

  const saveSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('auto_assignment_settings').upsert(
        {
          organisation_id: orgId,
          auto_assign_on_create: autoOnCreate,
          notify_on_auto_assign: notifyOnAssign,
          confidence_threshold: confidenceThreshold,
        },
        { onConflict: 'organisation_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['auto-assign-settings', orgId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const totalWeight = draft
    ? Object.values(draft.weight_overrides).reduce((a, b) => a + b, 0)
    : 100

  const updateWeight = (key: keyof AutoAssignWeights, value: number) => {
    if (!draft) return
    setDraft({
      ...draft,
      weight_overrides: { ...draft.weight_overrides, [key]: value },
    })
  }

  const toggleAccreditation = (accred: string) => {
    if (!draft) return
    const next = new Set(draft.required_accreditations)
    if (next.has(accred)) next.delete(accred)
    else next.add(accred)
    setDraft({ ...draft, required_accreditations: Array.from(next) })
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Auto-assign' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Auto-assign" subtitle="Rules and automation for engineer assignment" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        {(
          [
            { key: 'rules', label: 'Rules' },
            { key: 'activity', label: 'Activity' },
            { key: 'settings', label: 'Settings' },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-label font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'text-text-primary border-brand-500'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rules tab */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onPress={() => setDraft({ ...emptyDraft })}
              isDisabled={isEditing}
            >
              <Plus size={14} />
              New Rule
            </Button>
          </div>

          {isEditing && draft && (
            <div className="bg-surface-card border border-border-default rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <Heading level={3} scale="body">
                  {draft.id ? 'Edit Rule' : 'New Rule'}
                </Heading>
                <Button variant="ghost" size="sm" onPress={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Gas engineers near London"
                    className="w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-card focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                    Category
                  </label>
                  <FormSelect
                    value={draft.category ?? ''}
                    onChange={(v) => setDraft({ ...draft, category: v || null })}
                    ariaLabel="Category"
                    options={CATEGORY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                  Required Accreditations
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACCREDITATION_OPTIONS.map((a) => {
                    const active = draft.required_accreditations.includes(a)
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAccreditation(a)}
                        className={`px-3 py-1 rounded-full text-caption font-medium border transition-colors ${
                          active
                            ? 'bg-accent-soft text-accent-soft-foreground border-accent'
                            : 'bg-surface-card text-text-secondary border-border-default hover:bg-surface-page'
                        }`}
                      >
                        {a}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                  <span>Max distance ({draft.max_distance_km}km)</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={5}
                  value={draft.max_distance_km}
                  onChange={(e) =>
                    setDraft({ ...draft, max_distance_km: Number(e.target.value) })
                  }
                  className="w-full accent-brand-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-label font-medium text-text-primary">Prefer familiar</p>
                  <Text scale="caption" tone="muted">
                    Boost engineers who have worked at the property before
                  </Text>
                </div>
                <Switch
                  isSelected={draft.prefer_familiar}
                  onChange={() =>
                    setDraft({ ...draft, prefer_familiar: !draft.prefer_familiar })
                  }
                />
              </div>

              <div className="border-t border-border-subtle pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-label font-semibold text-text-primary">
                    Weight Overrides
                  </h4>
                  <div className="flex items-center gap-2">
                    <Chip
                      variant="soft"
                      color={Math.abs(totalWeight - 100) < 1 ? 'success' : 'warning'}
                      size="sm"
                    >
                      Σ {totalWeight}%
                    </Chip>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        setDraft({
                          ...draft,
                          weight_overrides: { ...DEFAULT_WEIGHTS },
                        })
                      }
                    >
                      <RefreshCw size={12} /> Reset
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {(Object.keys(DEFAULT_WEIGHTS) as (keyof AutoAssignWeights)[]).map(
                    (k) => (
                      <div key={k}>
                        <div className="flex items-center justify-between mb-1">
                          <Text scale="caption" as="span" tone="subtle" weight="medium" className="capitalize">
                            {k}
                          </Text>
                          <Text scale="caption" as="span" tone="muted">
                            {draft.weight_overrides[k]}%
                          </Text>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={draft.weight_overrides[k]}
                          onChange={(e) => updateWeight(k, Number(e.target.value))}
                          className="w-full accent-brand-500"
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border-subtle pt-4">
                <div className="flex items-center gap-2">
                  <Switch
                    isSelected={draft.enabled}
                    onChange={() => setDraft({ ...draft, enabled: !draft.enabled })}
                  />
                  <span className="text-label text-text-secondary">
                    {draft.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onPress={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    isDisabled={!draft.name || upsertMutation.isPending}
                    onPress={() => upsertMutation.mutate(draft)}
                  >
                    <Save size={14} />
                    Save Rule
                  </Button>
                </div>
              </div>
            </div>
          )}

          {rulesLoading && <ListSkeleton rows={4} withAvatar={false} />}
          {rulesError && (
            <p className="text-label text-status-overdue">
              {(rulesError as Error).message}
            </p>
          )}

          {!rulesLoading && rules && rules.length === 0 && !isEditing && (
            <div className="bg-surface-card border border-border-default rounded-xl p-10 text-center">
              <Sparkles size={28} className="mx-auto mb-2 text-text-muted" />
              <Text scale="body" weight="medium">No rules yet</Text>
              <Text scale="caption" tone="muted" className="mt-1">
                Create a rule to control how engineers are matched to jobs.
              </Text>
            </div>
          )}

          {rules && rules.length > 0 && (
            <div className="bg-surface-card border border-border-default rounded-xl divide-y divide-border-subtle">
              {rules.map((r) => {
                const rule = r as AutoAssignRule & { id: string; name: string; enabled: boolean }
                return (
                  <div
                    key={rule.id}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-label font-medium text-text-primary truncate">
                          {rule.name}
                        </p>
                        {!rule.enabled && (
                          <Chip variant="soft" color="default" size="sm">
                            Disabled
                          </Chip>
                        )}
                      </div>
                      <Text scale="micro" tone="muted" className="mt-0.5">
                        {rule.category ? `Category: ${rule.category}` : 'All categories'} ·{' '}
                        Max {rule.max_distance_km}km ·{' '}
                        {rule.required_accreditations.length > 0
                          ? rule.required_accreditations.join(', ')
                          : 'No required accreditations'}
                      </Text>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        isSelected={rule.enabled}
                        onChange={() =>
                          toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })
                        }
                        size="sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setDraft(ruleToDraft(rule))}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setPendingDeleteRule({ id: rule.id, name: rule.name })}
                        aria-label="Delete rule"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity tab */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-text-muted" />
            <div className="w-40">
              <FormSelect<'all' | 'apply' | 'suggest'>
                value={logFilter}
                onChange={setLogFilter}
                ariaLabel="Mode filter"
                options={[
                  { value: 'all', label: 'All modes' },
                  { value: 'apply', label: 'Applied' },
                  { value: 'suggest', label: 'Suggestions' },
                ]}
              />
            </div>
            <Button variant="ghost" size="sm" onPress={() => refetchLog()}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>

          {logLoading && <ListSkeleton rows={5} />}

          {!logLoading && filteredLog.length === 0 && (
            <div className="bg-surface-card border border-border-default rounded-xl p-10 text-center text-label text-text-muted">
              No activity yet.
            </div>
          )}

          {filteredLog.length > 0 && (
            <div className="bg-surface-card border border-border-default rounded-xl divide-y divide-border-subtle">
              {filteredLog.map((row) => (
                <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-label font-medium text-text-primary truncate">
                      Job {row.job_id?.slice(0, 8) ?? '—'}
                      <Chip
                        variant="soft"
                        color={row.applied ? 'success' : 'default'}
                        size="sm"
                        className="ml-2"
                      >
                        {row.applied ? 'Applied' : row.mode}
                      </Chip>
                    </p>
                    <Text scale="micro" tone="muted">
                      {new Date(row.created_at).toLocaleString()} · top score{' '}
                      {row.top_score ?? '—'}
                    </Text>
                  </div>
                  {row.job_id && (
                    <Link
                      to={`/dashboard/jobs/${row.job_id}`}
                      className="text-caption font-medium text-brand-500 hover:underline"
                    >
                      Open job →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="bg-surface-card border border-border-default rounded-xl p-5 space-y-5 max-w-[680px]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-label font-medium text-text-primary">
                Auto-assign on job create
              </p>
              <Text scale="caption" tone="muted">
                Apply the top suggestion automatically when a job is created.
              </Text>
            </div>
            <Switch
              isSelected={autoOnCreate}
              onChange={() => setAutoOnCreate((v) => !v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-label font-medium text-text-primary">
                Notify engineer on auto-assign
              </p>
              <Text scale="caption" tone="muted">
                Send an in-app notification when a job is auto-assigned.
              </Text>
            </div>
            <Switch
              isSelected={notifyOnAssign}
              onChange={() => setNotifyOnAssign((v) => !v)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-label font-medium text-text-primary">
                Confidence threshold
              </p>
              <Text scale="caption" as="span" tone="muted">{confidenceThreshold}</Text>
            </div>
            <input
              type="range"
              min={30}
              max={90}
              step={5}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <Text scale="caption" tone="muted" className="mt-1">
              Only auto-assign when the top score is at or above this value.
            </Text>
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              isDisabled={saveSettings.isPending}
              onPress={() => saveSettings.mutate()}
            >
              <Save size={14} /> Save settings
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteRule !== null}
        title="Delete Auto-Assign Rule"
        message={
          pendingDeleteRule
            ? `Delete "${pendingDeleteRule.name}"? This rule applies to your whole organisation and cannot be undone.`
            : ''
        }
        confirmLabel="Delete rule"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteRule) {
            deleteMutation.mutate(pendingDeleteRule.id)
            setPendingDeleteRule(null)
          }
        }}
        onCancel={() => setPendingDeleteRule(null)}
      />
    </div>
  )
}
