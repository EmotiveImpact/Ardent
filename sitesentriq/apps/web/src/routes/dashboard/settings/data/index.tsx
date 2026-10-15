// Admin "Data & Privacy" page (Wave 12 / Task 108).
//
// Tabs:
//   - Requests: list of all GDPR requests in the org
//   - Export:   admin-on-behalf data export
//   - Delete:   admin-on-behalf right-to-be-forgotten
//
// Routes to: /dashboard/settings/data
// Permissions: data:export and data:delete (org_admin / super_admin only)

import { useMemo, useState } from 'react'
import { Button, Chip, Spinner, Tabs } from '@haumea/ui'
import { TableSkeleton } from '@/components/shared/skeletons'
import { AppCard, FormSelect } from '@haumea/ui'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useGdprRequests,
  useOrgMembers,
  useTriggerGdprDelete,
  useTriggerGdprExport,
} from '@/lib/gdpr'
import type { GdprRequestStatus, GdprRequestWithSubject } from '@/lib/gdpr'

type Tab = 'requests' | 'export' | 'delete'

const inputClass =
  'bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-navy-950/30'

function statusChip(s: GdprRequestStatus) {
  const map: Record<GdprRequestStatus, { color: 'default' | 'warning' | 'success' | 'danger'; label: string }> = {
    pending: { color: 'default', label: 'Pending' },
    processing: { color: 'warning', label: 'Processing' },
    completed: { color: 'success', label: 'Completed' },
    failed: { color: 'danger', label: 'Failed' },
    cancelled: { color: 'default', label: 'Cancelled' },
  }
  const m = map[s]
  return (
    <Chip size="sm" variant="soft" color={m.color}>
      {m.label}
    </Chip>
  )
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DataPrivacyAdminPage() {
  const { profile } = useAuth()
  const { can } = usePermissions()
  const canExport = can('data:export')
  const canDelete = can('data:delete')

  const [tab, setTab] = useState<Tab>('requests')
  const { data: requests, isLoading } = useGdprRequests()
  const { data: members } = useOrgMembers()

  // Export form state
  const [exportSubject, setExportSubject] = useState('')
  const triggerExport = useTriggerGdprExport()

  // Delete form state
  const [deleteSubject, setDeleteSubject] = useState('')
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const triggerDelete = useTriggerGdprDelete()

  const deleteSubjectEmail = useMemo(() => {
    return members?.find((m) => m.id === deleteSubject)?.email ?? ''
  }, [deleteSubject, members])

  const expectedPhrase = deleteSubjectEmail ? `DELETE-${deleteSubjectEmail}` : ''

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'requests', label: 'Requests', icon: <FileText size={14} /> },
    { id: 'export', label: 'Export', icon: <Download size={14} /> },
    { id: 'delete', label: 'Delete', icon: <Trash2 size={14} /> },
  ]

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Data & Privacy' },
        ]}
      />

      <SectionHeader
        variant="page"
        title="Data & Privacy"
        subtitle="UK GDPR compliance — export user data on request, anonymise on the right to be forgotten."
        icon={<Shield size={20} />}
      />

      {/* Tabs */}
      <Tabs
        variant="secondary"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(key as Tab)}
        aria-label="Data and privacy section"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Data and privacy section">
            {tabs.map((t) => (
              <Tabs.Tab key={t.id} id={t.id}>
                <span className="inline-flex items-center gap-1.5">
                  {t.icon}
                  {t.label}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {/* Requests tab */}
      {tab === 'requests' && (
        <AppCard padding="none" className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
          ) : (requests ?? []).length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No GDPR requests yet"
              description="Subject Access Requests and right-to-be-forgotten requests appear here once submitted by users or admins."
            />
          ) : (
            <div className="overflow-x-auto">
              <table aria-label="GDPR requests" className="w-full">
                  <thead><tr>
                    <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Subject
                    </th>
                    <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Requested by
                    </th>
                    <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Created
                    </th>
                    <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Completed
                    </th>
                    <th className="py-3 px-4 text-right text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                      Result
                    </th>
                  </tr></thead>
                  <tbody>
                    {(requests ?? []).map((r: GdprRequestWithSubject) => (
                      <tr
                        key={r.id}
                        id={r.id}
                        className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0"
                      >
                        <td className="py-3 px-4">
                          <Chip size="sm" variant="soft" color={r.request_type === 'delete' ? 'danger' : 'default'}>
                            {r.request_type === 'delete' ? (
                              <span className="inline-flex items-center gap-1">
                                <ShieldOff size={11} /> Delete
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Download size={11} /> Export
                              </span>
                            )}
                          </Chip>
                        </td>
                        <td className="py-3 px-4 text-label text-text-primary">
                          {r.subject_full_name || r.subject_email || '—'}
                          {r.subject_email && r.subject_full_name && (
                            <div className="text-micro text-text-muted">{r.subject_email}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-label text-text-secondary">
                          {r.requested_by_full_name || r.requested_by_email || '—'}
                        </td>
                        <td className="py-3 px-4">{statusChip(r.status)}</td>
                        <td className="py-3 px-4 text-caption text-text-secondary">
                          {formatDate(r.created_at)}
                        </td>
                        <td className="py-3 px-4 text-caption text-text-secondary">
                          {formatDate(r.completed_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {r.request_type === 'export' && r.download_url && r.status === 'completed' ? (
                            <a
                              href={r.download_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-caption text-brand-500 hover:underline"
                            >
                              <Download size={12} /> Download
                            </a>
                          ) : r.failure_reason ? (
                            <span className="text-micro text-status-overdue" title={r.failure_reason}>
                              {r.failure_reason.slice(0, 40)}
                            </span>
                          ) : (
                            <span className="text-caption text-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          )}
        </AppCard>
      )}

      {/* Export tab */}
      {tab === 'export' && (
        <AppCard padding="lg" className="max-w-2xl">
          <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/10 shrink-0">
              <Download size={18} className="text-brand-500" />
            </div>
            <div>
              <h2 className="text-body font-semibold text-text-primary">Subject Access Request</h2>
              <p className="text-caption text-text-muted mt-0.5">
                Export every row of personal data we hold about a user as a JSON blob. UK GDPR Article 15 obliges
                a response within 30 days; this is instant.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
              Data subject
            </label>
            <FormSelect
              value={exportSubject}
              onChange={setExportSubject}
              ariaLabel="Data subject"
              placeholder="Select a user…"
              disabled={!canExport}
              options={(members ?? []).map((m) => ({ value: m.id, label: `${m.full_name || m.email} (${m.role})` }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              isDisabled={!exportSubject || !canExport || triggerExport.isPending}
              onPress={() => triggerExport.mutate(exportSubject)}
            >
              {triggerExport.isPending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner size="sm" /> Generating…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Download size={13} /> Generate export
                </span>
              )}
            </Button>
            {triggerExport.data?.download_url && (
              <a
                href={triggerExport.data.download_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-caption text-brand-500 hover:underline"
              >
                <Download size={12} /> Download export ({Math.round((triggerExport.data.expires_in_seconds ?? 0) / 86400)}-day link)
              </a>
            )}
          </div>

          {triggerExport.isSuccess && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-status-compliant/10 border border-status-compliant/20">
              <CheckCircle2 size={14} className="text-status-compliant mt-0.5 shrink-0" />
              <div className="text-caption text-text-secondary">
                Export complete. Download link is valid for 7 days. The request is logged in the Requests tab.
              </div>
            </div>
          )}
          </div>
        </AppCard>
      )}

      {/* Delete tab */}
      {tab === 'delete' && (
        <AppCard padding="lg" className="max-w-2xl">
          <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-status-overdue/10 shrink-0">
              <ShieldOff size={18} className="text-status-overdue" />
            </div>
            <div>
              <h2 className="text-body font-semibold text-text-primary">Right to be forgotten</h2>
              <p className="text-caption text-text-muted mt-0.5">
                Anonymise a user's personal data. UK GDPR Article 17. This is irreversible.
              </p>
            </div>
          </div>

          {/* What gets anonymised vs preserved */}
          <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/5 p-4 space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-status-overdue mt-0.5 shrink-0" />
              <h4 className="text-caption font-semibold text-text-primary uppercase tracking-[0.04em]">
                What this does
              </h4>
            </div>
            <ul className="text-caption text-text-secondary space-y-1.5 ml-6 list-disc">
              <li>
                <strong>Anonymises:</strong> auth.users email + bans login, profile name/phone/avatar, engineer
                record (name + signature image), notes authored by the user, field event metadata
              </li>
              <li>
                <strong>Preserves (audit integrity):</strong> notifications, timeline events, audit log entries,
                AI usage log, system audit events, import runs — actor IDs remain but joined profile shows
                "Deleted User"
              </li>
              <li>
                <strong>Cannot be undone.</strong> Hard delete with 30-day escrow is roadmap v2.
              </li>
            </ul>
          </div>

          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
              Data subject
            </label>
            <FormSelect
              value={deleteSubject}
              onChange={(v) => {
                setDeleteSubject(v)
                setConfirmPhrase('')
              }}
              ariaLabel="Data subject"
              placeholder="Select a user…"
              disabled={!canDelete}
              options={(members ?? [])
                .filter((m) => m.id !== profile?.id)
                .map((m) => ({ value: m.id, label: `${m.full_name || m.email} (${m.role})` }))}
            />
          </div>

          {deleteSubject && (
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Type to confirm
              </label>
              <input
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder={expectedPhrase}
                className={inputClass + ' font-mono'}
                autoComplete="off"
              />
              <p className="text-micro text-text-muted mt-1">
                Type exactly <code className="font-mono text-text-secondary">{expectedPhrase}</code> to enable the delete button.
              </p>
            </div>
          )}

          <Button
            variant="danger"
            size="sm"
            isDisabled={
              !canDelete ||
              !deleteSubject ||
              confirmPhrase.trim().toLowerCase() !== expectedPhrase.toLowerCase() ||
              triggerDelete.isPending
            }
            onPress={() =>
              triggerDelete.mutate({
                subject_user_id: deleteSubject,
                confirmation_phrase: confirmPhrase.trim(),
              })
            }
          >
            {triggerDelete.isPending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="sm" /> Anonymising…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Trash2 size={13} /> Permanently anonymise this user's data
              </span>
            )}
          </Button>

          {triggerDelete.isSuccess && triggerDelete.data && (
            <div className="rounded-lg bg-surface-page border border-border-default p-4">
              <h4 className="text-caption font-semibold text-text-primary mb-2 inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-status-compliant" /> Anonymisation complete
              </h4>
              <ul className="text-micro text-text-secondary space-y-1 font-mono">
                {Object.entries(triggerDelete.data.steps).map(([k, v]) => (
                  <li key={k}>
                    <span className="text-text-muted">{k}</span>: {String(v)}
                  </li>
                ))}
              </ul>
              {triggerDelete.data.warnings.length > 0 && (
                <div className="mt-2 text-micro text-status-due">
                  <strong>Warnings:</strong> {triggerDelete.data.warnings.join(', ')}
                </div>
              )}
            </div>
          )}
          </div>
        </AppCard>
      )}
    </div>
  )
}
