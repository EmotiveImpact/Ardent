import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, Modal, Tooltip } from '@haumea/ui'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { AppCard, FormSelect, FormSelectController, PageHeader } from '@haumea/ui'
import { Users, Plus, Mail, Shield, User, Pencil, Trash2, Loader2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatRelativeTime } from '@haumea/utils'
import { supabase } from '@/lib/supabase'
import { logAuditEvent } from '@/lib/audit/log'
import { useAuth } from '@/hooks/use-auth'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import type { UserProfileRow } from '@haumea/types'

const ROLE_OPTIONS = ['org_admin', 'scheduler', 'finance', 'engineer', 'client_admin', 'auditor'] as const

// Roles the secure `invite-team-member` edge function accepts (its contract).
// Must be real, frontend-permissioned profiles roles — `manager` was offered here
// but is NOT a valid profiles.role and has no permission-map entry, so invited
// "managers" were locked out of the whole app. (Migration 00085 aligned the DB
// constraints + admin_update_member to this assignable set.)
const INVITE_ROLE_OPTIONS = ['org_admin', 'scheduler', 'finance', 'engineer', 'auditor'] as const
type InviteRole = (typeof INVITE_ROLE_OPTIONS)[number]

// Shape of an `organisation_invitations` row (RLS scopes SELECT to the org).
interface OrganisationInvitationRow {
  id: string
  organisation_id: string
  email: string
  role: InviteRole
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
  expires_at: string | null
  accepted_at: string | null
  invited_by_user_id: string | null
}

// Structured error codes returned by the `invite-team-member` edge function.
interface InviteErrorBody {
  error: string
  detail?: string
}

/**
 * supabase.functions.invoke surfaces non-2xx responses as a
 * FunctionsHttpError whose JSON body lives on `error.context`. We try the
 * structured body (preferred), then fall back to any payload carried on
 * `data`, so both delivery shapes the contract mentions are handled.
 */
async function readInviteError(
  err: unknown,
  data: unknown,
): Promise<InviteErrorBody | null> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = (await err.context.json()) as InviteErrorBody
      if (body && typeof body.error === 'string') return body
    } catch {
      /* body was not JSON — fall through */
    }
  }
  if (data && typeof data === 'object' && 'error' in data) {
    const body = data as InviteErrorBody
    if (typeof body.error === 'string') return body
  }
  return null
}

function inviteErrorMessage(body: InviteErrorBody | null): string {
  switch (body?.error) {
    case 'already_a_member':
      return "They're already in your team."
    case 'belongs_to_another_workspace':
      return (
        body.detail ||
        "That email already belongs to another workspace, so it can't be added here."
      )
    case 'already_has_account':
      return (
        body.detail ||
        "They already have an account — ask them to sign in; they'll join automatically."
      )
    case 'invalid_email':
      return 'Enter a valid email.'
    case 'invalid_role':
      return 'Pick a valid role.'
    case 'not_an_admin':
      return 'Only admins can invite people.'
    case 'not_authenticated':
      return 'Your session expired — sign in again.'
    default:
      return 'Could not send the invitation. Please try again.'
  }
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  org_admin: 'Admin',
  scheduler: 'Scheduler',
  finance: 'Finance',
  engineer: 'Engineer',
  client_admin: 'Client Admin',
  auditor: 'Auditor',
}

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const ROLE_CHIP_COLOR: Record<string, ChipColor> = {
  super_admin: 'accent',
  org_admin: 'accent',
  admin: 'accent',
  scheduler: 'accent',
  manager: 'accent',
  finance: 'warning',
  engineer: 'success',
  client_admin: 'accent',
  auditor: 'default',
  viewer: 'default',
}

// ── Hooks ───────────────────────────────────────────

function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { full_name?: string; role?: string } }) => {
      // Goes through the admin-gated admin_update_member RPC (00075): asserts the
      // caller is an org admin of the target's org + last-admin guard. Direct
      // profile role writes are blocked by the privilege-change trigger.
      const { error } = await supabase.rpc('admin_update_member', {
        p_user_id: id,
        p_full_name: updates.full_name ?? null,
        p_role: updates.role ?? 'engineer',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('User updated successfully')
    },
    onError: (error) => {
      toast.error(`Failed to update user: ${error.message}`)
    },
  })
}

function useDeleteProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // admin_remove_member RPC (00075): admin-gated, last-admin + no-self-remove
      // guards. Detaches the member from the org (revokes access) rather than
      // deleting the profile (which would orphan the auth account).
      const { error } = await supabase.rpc('admin_remove_member', { p_user_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Member removed from the team')
    },
    onError: (error) => {
      toast.error(`Failed to remove user: ${error.message}`)
    },
  })
}

function usePendingInvitations() {
  return useQuery({
    queryKey: ['organisation_invitations', 'pending'],
    queryFn: async (): Promise<OrganisationInvitationRow[]> => {
      const { data, error } = await supabase
        .from('organisation_invitations')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as OrganisationInvitationRow[]
    },
  })
}

function useRevokeInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => {
      // admin_revoke_invitation RPC (00075): admin-gated, same-org. Writes to
      // organisation_invitations are otherwise service-role only.
      const { error } = await supabase.rpc('admin_revoke_invitation', { p_invitation_id: invitationId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organisation_invitations', 'pending'] })
      toast.success('Invitation revoked')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke invitation')
    },
  })
}

function useInviteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: InviteRole }) => {
      const { data, error } = await supabase.functions.invoke('invite-team-member', {
        body: {
          email: payload.email,
          full_name: payload.full_name || undefined,
          role: payload.role,
        },
      })

      // Non-2xx responses come back as a FunctionsHttpError; read the
      // structured error code and translate it to a friendly message.
      if (error) {
        const body = await readInviteError(error, data)
        throw new Error(inviteErrorMessage(body))
      }

      return { email: payload.email, role: payload.role }
    },
    onSuccess: ({ email }) => {
      toast.success(`Invitation sent to ${email}`)
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['organisation_invitations', 'pending'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ── Edit user schema ────────────────────────────────

const editUserSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
})

type EditUserFormValues = z.infer<typeof editUserSchema>

// ── Component ───────────────────────────────────────

export default function UsersPage() {
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<InviteRole>('engineer')

  const [editingUser, setEditingUser] = useState<UserProfileRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserProfileRow | null>(null)

  const { user: currentUser } = useAuth()
  const { data: users, isLoading } = useProfiles()
  const { data: pendingInvitations, isLoading: invitesLoading } = usePendingInvitations()
  const inviteMutation = useInviteUser()
  const updateMutation = useUpdateProfile()
  const deleteMutation = useDeleteProfile()
  const revokeMutation = useRevokeInvitation()

  const {
    register: editRegister,
    handleSubmit: handleEditSubmit,
    reset: resetEditForm,
    control: editControl,
    formState: { errors: editErrors },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
  })

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    try {
      // onError surfaces the friendly toast; we only reset on success.
      await inviteMutation.mutateAsync({ email: email.trim(), full_name: name.trim(), role })
      setEmail('')
      setName('')
      setRole('engineer')
      setShowInvite(false)
    } catch {
      /* handled by mutation.onError */
    }
  }

  // Re-send is just another invite with the same email + role.
  const handleResend = (invitation: OrganisationInvitationRow) => {
    inviteMutation.mutate({ email: invitation.email, full_name: '', role: invitation.role })
  }

  const openEditModal = (user: UserProfileRow) => {
    setEditingUser(user)
    resetEditForm({
      full_name: user.full_name || '',
      role: user.role || 'engineer',
    })
  }

  const onEditSubmit = (values: EditUserFormValues) => {
    if (!editingUser) return
    const previousRole = editingUser.role
    updateMutation.mutate(
      { id: editingUser.id, updates: { full_name: values.full_name, role: values.role } },
      {
        onSuccess: () => {
          if (values.role !== previousRole) {
            void logAuditEvent({
              action: 'user.role_changed',
              entityType: 'user',
              entityId: editingUser.id,
              summary: `Changed role for ${editingUser.email} from ${previousRole} to ${values.role}`,
              metadata: { previous_role: previousRole, new_role: values.role },
              severity: 'warning',
            })
          }
          setEditingUser(null)
        },
      },
    )
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
      },
    })
  }

  const isCurrentUser = (userId: string) => currentUser?.id === userId

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Users" />
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="bg-foreground text-background hover:bg-foreground/90 px-4 py-2 rounded-lg text-label font-medium transition-colors flex items-center gap-1.5"
        >
          <Plus size={15} />
          Invite User
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <AppCard padding="lg">
        <form onSubmit={handleInvite}>
          <h2 className="text-body font-semibold text-text-primary mb-4">Invite a new team member</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="add-user-name" className="text-label font-medium text-text-secondary block mb-1.5">Full name</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  id="add-user-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-border-default rounded-lg pl-9 pr-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                />
              </div>
            </div>
            <div>
              <label htmlFor="add-user-email" className="text-label font-medium text-text-secondary block mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  id="add-user-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full border border-border-default rounded-lg pl-9 pr-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-label font-medium text-text-secondary block mb-1.5">Role</label>
              <div className="relative">
                <Shield size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10" />
                <div className="[&_select]:pl-9">
                  <FormSelect<InviteRole>
                    value={role}
                    onChange={setRole}
                    ariaLabel="Role"
                    options={INVITE_ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] || r }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={inviteMutation.isPending}
                className="bg-foreground text-background hover:bg-foreground/90 px-4 py-2 rounded-lg text-label font-medium transition-colors w-full disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invite'
                )}
              </button>
            </div>
          </div>
        </form>
        </AppCard>
      )}

      {/* Pending invitations */}
      {!invitesLoading && (pendingInvitations?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h2 className="text-label font-semibold text-text-primary">Pending invitations</h2>
          <table aria-label="Pending invitations" className="w-full bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <thead><tr>
                <th id="pending-email" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Email</th>
                <th id="pending-role" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Role</th>
                <th id="pending-invited" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Invited</th>
                <th id="pending-actions" className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
              </tr></thead>
              <tbody>
                {(pendingInvitations ?? []).map((invitation) => (
                  <tr key={invitation.id} id={invitation.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-surface-page flex items-center justify-center">
                          <Mail size={13} className="text-text-muted" />
                        </div>
                        <span className="text-label font-medium text-text-secondary">{invitation.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={ROLE_CHIP_COLOR[invitation.role] ?? 'default'} size="sm">
                        {ROLE_LABELS[invitation.role] || invitation.role}
                      </Chip>
                    </td>
                    <td className="py-3 px-4 text-caption text-text-muted">
                      invited {formatRelativeTime(invitation.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip delay={400}>
                          <Tooltip.Trigger>
                            <button
                              onClick={() => handleResend(invitation)}
                              disabled={inviteMutation.isPending}
                              className="p-1.5 rounded-md text-text-muted hover:text-text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                              aria-label="Resend invitation"
                            >
                              <Send size={14} />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Content placement="top">
                            <Tooltip.Arrow />
                            Resend invitation
                          </Tooltip.Content>
                        </Tooltip>
                        <Tooltip delay={400}>
                          <Tooltip.Trigger>
                            <button
                              onClick={() => revokeMutation.mutate(invitation.id)}
                              disabled={revokeMutation.isPending}
                              className="p-1.5 rounded-md text-text-muted hover:text-status-overdue hover:bg-status-overdue/10 transition-colors disabled:opacity-50"
                              aria-label="Revoke invitation"
                            >
                              <X size={14} />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Content placement="top">
                            <Tooltip.Arrow />
                            Revoke invitation
                          </Tooltip.Content>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <AppCard padding="none" className="py-12 text-center text-text-muted text-label">
          Loading users...
        </AppCard>
      ) : (users?.length ?? 0) === 0 ? (
        <AppCard padding="none" className="py-12 text-center text-text-muted text-label">
          No users found. Invite your first team member above.
        </AppCard>
      ) : (
        <table aria-label="Users" className="w-full bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Email</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Role</th>
              <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
            </tr></thead>
            <tbody>
              {(users || []).map((user: UserProfileRow) => (
                <tr key={user.id} id={user.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-surface-page flex items-center justify-center">
                        <Users size={13} className="text-text-muted" />
                      </div>
                      <div>
                        <span className="text-label font-medium text-text-secondary block">
                          {user.full_name || 'Unnamed'}
                        </span>
                        {isCurrentUser(user.id) && (
                          <span className="text-micro text-text-muted">You</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-label text-text-secondary">{user.email}</td>
                  <td className="py-3 px-4">
                    <Chip variant="soft" color={ROLE_CHIP_COLOR[user.role] ?? 'default'} size="sm">
                      {ROLE_LABELS[user.role] || user.role || 'Engineer'}
                    </Chip>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip delay={400}>
                        <Tooltip.Trigger>
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-page transition-colors"
                            aria-label="Edit user"
                          >
                            <Pencil size={14} />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="top">
                          <Tooltip.Arrow />
                          Edit user
                        </Tooltip.Content>
                      </Tooltip>
                      {!isCurrentUser(user.id) && (
                        <Tooltip delay={400}>
                          <Tooltip.Trigger>
                            <button
                              onClick={() => setDeleteTarget(user)}
                              className="p-1.5 rounded-md text-text-muted hover:text-status-overdue hover:bg-status-overdue/10 transition-colors"
                              aria-label="Remove user"
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Content placement="top">
                            <Tooltip.Arrow />
                            Remove user
                          </Tooltip.Content>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      )}

      {/* Edit User Modal — Wave 17C: HeroUI <Modal> */}
      <Modal.Backdrop
        isOpen={!!editingUser}
        onOpenChange={(next) => {
          if (!next) setEditingUser(null)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Edit User</Modal.Heading>
            </Modal.Header>
            {editingUser && (
              <form onSubmit={handleEditSubmit(onEditSubmit)}>
                <Modal.Body className="space-y-4">
                  <div>
                    <label htmlFor="edit-user-email" className="text-label font-medium text-text-secondary block mb-1.5">Email</label>
                    <input
                      id="edit-user-email"
                      type="text"
                      value={editingUser.email}
                      readOnly
                      className="w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-page text-text-muted cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-user-name" className="text-label font-medium text-text-secondary block mb-1.5">
                      Full Name <span className="text-status-overdue">*</span>
                    </label>
                    <input
                      id="edit-user-name"
                      type="text"
                      {...editRegister('full_name')}
                      placeholder="Full name"
                      className="w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
                    />
                    {editErrors.full_name && (
                      <p className="text-caption text-status-overdue mt-1">{editErrors.full_name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-label font-medium text-text-secondary block mb-1.5">
                      Role <span className="text-status-overdue">*</span>
                    </label>
                    <FormSelectController
                      control={editControl}
                      name="role"
                      ariaLabel="Role"
                      options={ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] || r }))}
                    />
                    {editErrors.role && (
                      <p className="text-caption text-status-overdue mt-1">{editErrors.role.message}</p>
                    )}
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    type="button"
                    variant="tertiary"
                    onPress={() => setEditingUser(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isDisabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove User"
        message={`Are you sure you want to remove ${deleteTarget?.full_name || deleteTarget?.email || 'this user'}? This action cannot be undone.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
