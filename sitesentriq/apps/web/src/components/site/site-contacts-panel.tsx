// Wave 14 / Task 114 — FM-side panel: manage tenant invitees on a property.
// Used by /dashboard/properties/:id only. NOT shown in the tenant portal.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, TextField, Tooltip } from '@haumea/ui'
import { AppCard, FormSelectController } from '@haumea/ui'
import { Plus, Mail, Trash2, RefreshCw, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import type { PropertyContact } from '@haumea/types'
import { ListSkeleton } from '@/components/shared/skeletons'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined

const inviteSchema = z.object({
  email: z.string().email('Valid email required'),
  full_name: z.string().min(2, 'Name required'),
  role_at_site: z.string().min(2, 'Role required'),
})

type InviteFormData = z.infer<typeof inviteSchema>

const STATUS_CHIP_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  invited: 'warning',
  disabled: 'default',
}

interface Props {
  propertyId: string
  clientId: string
}

export function SiteContactsPanel({ propertyId, clientId }: Props) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role_at_site: 'site_lead' },
  })

  const { data: contacts, isLoading } = useQuery<PropertyContact[]>({
    queryKey: ['property-contacts', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_contacts')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PropertyContact[]
    },
  })

  const callInviteFn = async (input: InviteFormData) => {
    if (!SUPABASE_URL) throw new Error('Supabase not configured')
    const url = `${SUPABASE_URL}/functions/v1/site-invite`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        property_id: propertyId,
        client_id: clientId,
        email: input.email,
        full_name: input.full_name,
        role_at_site: input.role_at_site,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.error) {
      throw new Error(json?.error || `Invite failed (${res.status})`)
    }
    return json
  }

  const invite = useMutation({
    mutationFn: callInviteFn,
    onSuccess: () => {
      toast.success('Invite email sent')
      form.reset({ role_at_site: 'site_lead', email: '', full_name: '' })
      setShowAdd(false)
      qc.invalidateQueries({ queryKey: ['property-contacts', propertyId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const onResend = async (id: string) => {
    const c = contacts?.find((x) => x.id === id)
    if (!c) return
    setBusyId(id)
    try {
      await callInviteFn({
        email: c.email,
        full_name: c.full_name,
        role_at_site: c.role_at_site,
      })
      toast.success('Invite re-sent')
      qc.invalidateQueries({ queryKey: ['property-contacts', propertyId] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const onDisable = async (id: string) => {
    setBusyId(id)
    try {
      const { error } = await supabase
        .from('property_contacts')
        .update({ status: 'disabled' })
        .eq('id', id)
      if (error) throw error
      toast.success('Contact disabled')
      qc.invalidateQueries({ queryKey: ['property-contacts', propertyId] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const performDelete = async (id: string) => {
    setBusyId(id)
    try {
      const { error } = await supabase.from('property_contacts').delete().eq('id', id)
      if (error) throw error
      toast.success('Contact removed')
      qc.invalidateQueries({ queryKey: ['property-contacts', propertyId] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppCard padding="md">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-body font-semibold text-text-primary">Site contacts</h2>
          <p className="text-caption text-text-muted mt-0.5">
            People at this site with single-property portal access. They can raise
            call-outs and approve quotes for this site only.
          </p>
        </div>
        {!showAdd && (
          <Button variant="primary" size="sm" onPress={() => setShowAdd(true)}>
            <Plus size={14} /> Invite
          </Button>
        )}
      </div>

      {showAdd && (
        <form
          onSubmit={form.handleSubmit((d) => invite.mutate(d))}
          className="border border-brand-200 bg-brand-50/30 rounded-xl p-4 mb-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField isInvalid={!!form.formState.errors.full_name}>
              <Label>Full name</Label>
              <Input placeholder="Pat Manager" autoFocus {...form.register('full_name')} />
              {form.formState.errors.full_name && <FieldError>{form.formState.errors.full_name.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!form.formState.errors.email}>
              <Label>Email</Label>
              <Input placeholder="pat@example.com" {...form.register('email')} />
              {form.formState.errors.email && <FieldError>{form.formState.errors.email.message}</FieldError>}
            </TextField>
          </div>
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
              Role at site
            </label>
            <FormSelectController
              control={form.control}
              name="role_at_site"
              ariaLabel="Role at site"
              options={[
                { value: 'site_lead', label: 'Site lead' },
                { value: 'manager', label: 'Manager' },
                { value: 'duty_manager', label: 'Duty manager' },
                { value: 'facilities_lead', label: 'Facilities lead' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" size="sm" isDisabled={invite.isPending}>
              {invite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => {
                setShowAdd(false)
                form.reset()
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <ListSkeleton rows={3} framed={false} />
      ) : !contacts || contacts.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-text-muted">
          <Mail size={28} strokeWidth={1.5} className="mb-2" />
          <p className="text-label">No site contacts yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="py-3 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <p className="text-label font-medium text-text-primary">
                  {c.full_name}
                </p>
                <p className="text-micro text-text-muted mt-0.5">
                  {c.email} · {c.role_at_site}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip variant="soft" color={STATUS_CHIP_COLOR[c.status] ?? 'default'} size="sm">
                  {c.status}
                </Chip>
                {c.status === 'invited' && (
                  <Tooltip delay={400}>
                    <Tooltip.Trigger>
                      <button
                        onClick={() => onResend(c.id)}
                        disabled={busyId === c.id}
                        className="p-1.5 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary disabled:opacity-50"
                        aria-label="Resend invite"
                      >
                        <RefreshCw size={12} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="top">
                      <Tooltip.Arrow />
                      Resend invite
                    </Tooltip.Content>
                  </Tooltip>
                )}
                {c.status !== 'disabled' && (
                  <Tooltip delay={400}>
                    <Tooltip.Trigger>
                      <button
                        onClick={() => onDisable(c.id)}
                        disabled={busyId === c.id}
                        className="p-1.5 rounded-lg hover:bg-surface-page text-text-muted hover:text-status-due-soon disabled:opacity-50"
                        aria-label="Disable access"
                      >
                        <UserMinus size={12} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="top">
                      <Tooltip.Arrow />
                      Disable access
                    </Tooltip.Content>
                  </Tooltip>
                )}
                <Tooltip delay={400}>
                  <Tooltip.Trigger>
                    <button
                      onClick={() => setPendingDelete({ id: c.id, name: c.full_name })}
                      disabled={busyId === c.id}
                      className="p-1.5 rounded-lg hover:bg-status-overdue/10 text-text-muted hover:text-status-overdue disabled:opacity-50"
                      aria-label="Delete contact"
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content placement="top">
                    <Tooltip.Arrow />
                    Delete contact
                  </Tooltip.Content>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete contact"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.name} and revoke their access? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete contact"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) {
            performDelete(pendingDelete.id)
            setPendingDelete(null)
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </AppCard>
  )
}
