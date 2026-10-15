// src/routes/dashboard/integrations/sso/index.tsx
//
// Admin settings page for Single Sign-On.
//
// Cards:
//   1. Allowed sign-in methods   — display-only checkboxes; hint that
//      provider config lives in Supabase Dashboard.
//   2. Domain mappings           — table with Add/Edit/Disable, plus a
//      30-day provisioning count per row.
//   3. SCIM provisioning         — placeholder (Coming soon).
//   4. Recent SSO activity       — last 50 rows from the audit log.
//
// Gating: route-level RoleRoute (settings:write) — see App.tsx.

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, Modal, Spinner, Switch, TextField } from '@haumea/ui'
import { FormSelectController, Text } from '@haumea/ui'
import { TableSkeleton } from '@/components/shared/skeletons'
import {
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  Pencil,
  Activity,
  AlertCircle,
  Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAuthContext } from '@/contexts/auth-context'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────

interface DomainMapping {
  id: string
  organisation_id: string
  domain: string
  default_role: string
  auto_provision: boolean
  created_at: string
  disabled_at: string | null
}

interface ProvisioningLogRow {
  id: string
  email: string
  domain: string
  org_id: string | null
  provider: string
  action: string
  error_message: string | null
  created_at: string
}

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'scheduler', label: 'Scheduler' },
  { value: 'finance', label: 'Finance' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'client_admin', label: 'Client Admin' },
  { value: 'auditor', label: 'Auditor' },
] as const

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label])
)

const PROVIDER_LABEL: Record<string, string> = {
  azure: 'Microsoft',
  google: 'Google',
}

type ChipColor = 'warning' | 'danger' | 'accent' | 'success' | 'default'

const ACTION_COLOR: Record<string, ChipColor> = {
  provisioned: 'success',
  already_member: 'accent',
  no_mapping: 'default',
  blocked: 'warning',
  error: 'danger',
}

// ── Hooks ─────────────────────────────────────────────────────

function useDomainMappings(orgId: string | undefined) {
  return useQuery({
    queryKey: ['sso_domain_mappings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sso_domain_mappings')
        .select('*')
        .eq('organisation_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DomainMapping[]
    },
  })
}

function useProvisioningLog(orgId: string | undefined) {
  return useQuery({
    queryKey: ['sso_provisioning_log', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sso_provisioning_log')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as ProvisioningLogRow[]
    },
  })
}

// 30-day provisioning counts grouped by domain.
function useDomainCounts(orgId: string | undefined) {
  return useQuery({
    queryKey: ['sso_domain_counts_30d', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('sso_provisioning_log')
        .select('domain')
        .eq('org_id', orgId!)
        .gte('created_at', since)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        const d = (row as { domain: string }).domain
        counts[d] = (counts[d] ?? 0) + 1
      }
      return counts
    },
  })
}

// ── Form schema ────────────────────────────────────────────────

const mappingSchema = z.object({
  domain: z
    .string()
    .min(3, 'Enter a domain (e.g. acme.com)')
    .max(253, 'Too long')
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
      'Use lowercase letters, numbers, dots and hyphens'
    ),
  default_role: z.string().min(1),
  auto_provision: z.boolean(),
})

type MappingFormValues = z.infer<typeof mappingSchema>

// ── Card shell ────────────────────────────────────────────────

function CardShell({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-surface-card border border-border-default rounded-xl mb-4 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-body font-semibold text-text-primary">
            {title}
          </span>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

// ── Component ──────────────────────────────────────────────────

export default function SsoSettingsPage() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()
  const orgId = organisation?.id

  const { data: mappings = [], isLoading: mappingsLoading } =
    useDomainMappings(orgId)
  const { data: log = [], isLoading: logLoading } = useProvisioningLog(orgId)
  const { data: counts = {} } = useDomainCounts(orgId)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DomainMapping | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MappingFormValues>({
    resolver: zodResolver(mappingSchema),
    defaultValues: {
      domain: '',
      default_role: 'engineer',
      auto_provision: true,
    },
  })

  const watchAuto = watch('auto_provision')

  // Close modal on Escape.
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen])

  function openAdd() {
    setEditing(null)
    reset({ domain: '', default_role: 'engineer', auto_provision: true })
    setModalOpen(true)
  }

  function openEdit(row: DomainMapping) {
    setEditing(row)
    reset({
      domain: row.domain,
      default_role: row.default_role,
      auto_provision: row.auto_provision,
    })
    setModalOpen(true)
  }

  // ── Mutations ────────────────────────────────────────────────

  const saveMapping = useMutation({
    mutationFn: async (values: MappingFormValues) => {
      if (!orgId) throw new Error('No organisation in context')
      if (editing) {
        const { error } = await supabase
          .from('sso_domain_mappings')
          .update({
            domain: values.domain.toLowerCase(),
            default_role: values.default_role,
            auto_provision: values.auto_provision,
          })
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('sso_domain_mappings').insert({
          organisation_id: orgId,
          domain: values.domain.toLowerCase(),
          default_role: values.default_role,
          auto_provision: values.auto_provision,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso_domain_mappings', orgId] })
      toast.success(editing ? 'Domain mapping updated' : 'Domain mapping added')
      setModalOpen(false)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save mapping'
      toast.error(msg)
    },
  })

  const toggleDisabled = useMutation({
    mutationFn: async (row: DomainMapping) => {
      const { error } = await supabase
        .from('sso_domain_mappings')
        .update({
          disabled_at: row.disabled_at ? null : new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso_domain_mappings', orgId] })
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : 'Failed to toggle mapping'
      toast.error(msg)
    },
  })

  const onSubmit = (values: MappingFormValues) => {
    saveMapping.mutate(values)
  }

  // ── Derived ──────────────────────────────────────────────────

  const sortedMappings = useMemo(() => {
    return [...mappings].sort((a, b) => {
      // Active first, then alphabetical by domain.
      if (!a.disabled_at && b.disabled_at) return -1
      if (a.disabled_at && !b.disabled_at) return 1
      return a.domain.localeCompare(b.domain)
    })
  }, [mappings])

  return (
    <div className="p-6 max-w-6xl">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Integrations' },
          { label: 'SSO' },
        ]}
      />

      <div className="flex items-start justify-between mb-6">
        <div>
          {/* TODO(Wave F): Migrate this complex title to PageHeader once icon/adornment support exists. */}
          <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em] flex items-center gap-2">
            <KeyRound size={20} className="text-brand-500" />
            Single Sign-On
          </h1>
          <p className="text-label text-text-secondary mt-1">
            Allow your team to sign in with Microsoft Entra or Google Workspace.
          </p>
        </div>
      </div>

      {/* Card 1 — Allowed sign-in methods */}
      <CardShell
        icon={<ShieldCheck size={16} className="text-brand-500" />}
        title="Allowed sign-in methods"
      >
        <Text scale="caption" tone="muted" className="mb-3">
          These are display-only. Provider client IDs and secrets are
          configured in Supabase Dashboard → Authentication → Providers.
        </Text>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-3 border border-border-default rounded-lg">
            <div>
              <p className="text-label font-medium text-text-primary">
                Microsoft Entra ID (Azure AD)
              </p>
              <Text scale="caption" tone="muted">
                Sign in with a Microsoft work or school account.
              </Text>
            </div>
            <Chip size="sm" color="accent" variant="soft">
              Configured externally
            </Chip>
          </div>
          <div className="flex items-center justify-between p-3 border border-border-default rounded-lg">
            <div>
              <p className="text-label font-medium text-text-primary">
                Google Workspace
              </p>
              <Text scale="caption" tone="muted">
                Sign in with a Google account.
              </Text>
            </div>
            <Chip size="sm" color="accent" variant="soft">
              Configured externally
            </Chip>
          </div>
          <div className="flex items-center justify-between p-3 border border-border-default rounded-lg">
            <div>
              <p className="text-label font-medium text-text-primary">
                Email + Password
              </p>
              <Text scale="caption" tone="muted">
                Always available as a fallback.
              </Text>
            </div>
            <Chip size="sm" color="default" variant="soft">
              Always on
            </Chip>
          </div>
        </div>
      </CardShell>

      {/* Card 2 — Domain mappings */}
      <CardShell
        icon={<Globe size={16} className="text-brand-500" />}
        title="Domain mappings"
        action={
          <Button variant="primary" size="sm" onPress={openAdd}>
            <Plus size={14} className="mr-1.5" />
            Add domain
          </Button>
        }
      >
        <Text scale="caption" tone="muted" className="mb-3">
          When a user signs in via SSO with an email at one of these domains,
          they're automatically added to your organisation with the chosen role.
        </Text>

        {mappingsLoading ? (
          <TableSkeleton rows={3} cols={4} showHeader={false} showSearch={false} />
        ) : sortedMappings.length === 0 ? (
          <div className="border border-dashed border-border-default rounded-lg p-6 text-center">
            <p className="text-label text-text-secondary">
              No domains mapped yet. Add one to enable JIT provisioning.
            </p>
          </div>
        ) : (
          <table
            aria-label="Domain mappings"
            className="bg-surface-card border border-border-default rounded-xl overflow-hidden"
          >
              <thead><tr>
                <th
                  id="domain"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Domain
                </th>
                <th
                  id="role"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Default Role
                </th>
                <th
                  id="auto"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Auto Provision
                </th>
                <th
                  id="count"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  30-day Sign-ins
                </th>
                <th
                  id="status"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Status
                </th>
                <th
                  id="actions"
                  className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Actions
                </th>
              </tr></thead>
              <tbody>
                {sortedMappings.map((row) => (
                  <tr
                    key={row.id}
                    id={row.id}
                    className="border-b border-border-subtle hover:bg-surface-page"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-label text-text-primary">
                        {row.domain}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Chip size="sm" color="default" variant="soft">
                        {ROLE_LABEL[row.default_role] ?? row.default_role}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      {row.auto_provision ? (
                        <Chip size="sm" color="success" variant="soft">
                          On
                        </Chip>
                      ) : (
                        <Chip size="sm" color="warning" variant="soft">
                          Off
                        </Chip>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-label text-text-secondary">
                        {counts[row.domain] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.disabled_at ? (
                        <Chip size="sm" color="default" variant="soft">
                          Disabled
                        </Chip>
                      ) : (
                        <Chip size="sm" color="success" variant="soft">
                          Active
                        </Chip>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Edit"
                          onPress={() => openEdit(row)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={row.disabled_at ? 'Enable' : 'Disable'}
                          onPress={() => toggleDisabled.mutate(row)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        )}
      </CardShell>

      {/* Card 3 — SCIM placeholder */}
      <CardShell
        icon={<ShieldCheck size={16} className="text-brand-500" />}
        title="SCIM provisioning"
      >
        <div className="flex items-start gap-3 p-3 rounded-lg border border-border-default bg-surface-page">
          <AlertCircle size={16} className="text-text-muted mt-0.5" />
          <div>
            <p className="text-label font-medium text-text-primary">
              Coming soon
            </p>
            <Text scale="caption" tone="muted" className="mt-0.5">
              Automatic user lifecycle (create / update / deactivate) from your
              identity provider via SCIM 2.0. Currently users are JIT-provisioned
              on first sign-in.
            </Text>
          </div>
        </div>
      </CardShell>

      {/* Card 4 — Recent activity */}
      <CardShell
        icon={<Activity size={16} className="text-brand-500" />}
        title="Recent SSO activity"
      >
        {logLoading ? (
          <TableSkeleton rows={4} cols={4} showHeader={false} showSearch={false} />
        ) : log.length === 0 ? (
          <p className="text-label text-text-secondary py-4 text-center">
            No SSO activity yet.
          </p>
        ) : (
          <table
            aria-label="SSO activity"
            className="bg-surface-card border border-border-default rounded-xl overflow-hidden"
          >
              <thead><tr>
                <th
                  id="when"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  When
                </th>
                <th
                  id="email"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Email
                </th>
                <th
                  id="provider"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Provider
                </th>
                <th
                  id="action"
                  className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]"
                >
                  Action
                </th>
              </tr></thead>
              <tbody>
                {log.map((row) => (
                  <tr
                    key={row.id}
                    id={row.id}
                    className="border-b border-border-subtle hover:bg-surface-page"
                  >
                    <td className="px-4 py-3">
                      <span className="text-caption text-text-muted whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-label text-text-primary">
                        {row.email}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Chip size="sm" color="default" variant="soft">
                        {PROVIDER_LABEL[row.provider] ?? row.provider}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={ACTION_COLOR[row.action] ?? 'default'}
                      >
                        {row.action.replace(/_/g, ' ')}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        )}
      </CardShell>

      {/* ── Modal — Wave 17C: HeroUI <Modal> ─────────────── */}
      <Modal.Backdrop
        isOpen={modalOpen}
        onOpenChange={(next) => {
          if (!next) setModalOpen(false)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                {editing ? 'Edit domain mapping' : 'Add domain mapping'}
              </Modal.Heading>
            </Modal.Header>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Modal.Body className="flex flex-col gap-4">
                <TextField isInvalid={!!errors.domain}>
                  <Label>Domain</Label>
                  <Input placeholder="acme.com" className="font-mono" {...register('domain')} />
                  <p className="text-caption text-text-muted mt-1">
                    Lowercase. The part after the @ in user emails.
                  </p>
                  {errors.domain && <FieldError>{errors.domain.message}</FieldError>}
                </TextField>

                <div>
                  <label className="block text-label font-medium text-text-secondary mb-1.5">
                    Default role
                  </label>
                  <FormSelectController
                    control={control}
                    name="default_role"
                    ariaLabel="Default role"
                    options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border border-border-default rounded-lg">
                  <div>
                    <p className="text-label font-medium text-text-primary">
                      Auto-provision new users
                    </p>
                    <p className="text-caption text-text-muted">
                      Off = block sign-in until an admin invites the user manually.
                    </p>
                  </div>
                  <Switch
                    isSelected={watchAuto}
                    onChange={(v: boolean) => setValue('auto_provision', v)}
                    aria-label="Auto-provision new users"
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="tertiary"
                  onPress={() => setModalOpen(false)}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isDisabled={isSubmitting || saveMapping.isPending}
                >
                  {(isSubmitting || saveMapping.isPending) && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  {editing ? 'Save changes' : 'Add domain'}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
