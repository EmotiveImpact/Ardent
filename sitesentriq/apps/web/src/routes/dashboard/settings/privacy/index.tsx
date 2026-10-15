// User-facing "Privacy" page (Wave 12 / Task 108).
//
// Self-service for ANY authenticated user:
//   - Download my data       → fires gdpr-export against own user_id
//   - Delete my account      → fires gdpr-delete against own user_id
//                              (read-only for the org's last admin)
//   - Privacy info panel     → what we collect, who has access, links
//
// Routes to: /dashboard/settings/privacy
// Permissions: privacy:read (every authenticated user)

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, Chip, Spinner } from '@haumea/ui'
import { ListSkeleton } from '@/components/shared/skeletons'
import { AppCard } from '@haumea/ui'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Shield,
  ShieldOff,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SectionHeader } from '@/components/shared/section-header'
import { useAuth } from '@/hooks/use-auth'
import {
  useGdprRequests,
  useOrgMembers,
  useTriggerGdprDelete,
  useTriggerGdprExport,
} from '@/lib/gdpr'
import type { GdprRequestStatus } from '@/lib/gdpr'

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

export default function PrivacyPage() {
  const { profile, signOut } = useAuth()
  const userId = profile?.id ?? ''
  const userEmail = profile?.email ?? ''
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'super_admin'

  const { data: members } = useOrgMembers()
  const { data: requests, isLoading } = useGdprRequests({ selfOnly: true })

  const triggerExport = useTriggerGdprExport()
  const triggerDelete = useTriggerGdprDelete()

  const [showDeleteFlow, setShowDeleteFlow] = useState(false)
  const [confirmPhrase, setConfirmPhrase] = useState('')

  // After a successful self-delete the user is anonymised + login-banned
  // server-side, but the live JWT stays valid until it expires — so honour the
  // "you will be signed out shortly" promise by actually signing out. The short
  // delay lets the confirmation message render first.
  useEffect(() => {
    if (!triggerDelete.isSuccess) return
    const t = setTimeout(() => {
      void signOut()
    }, 2500)
    return () => clearTimeout(t)
  }, [triggerDelete.isSuccess, signOut])
  const expectedPhrase = userEmail ? `DELETE-${userEmail}` : ''

  // Block self-delete if the caller is the org's last admin.
  const isLastAdmin = useMemo(() => {
    if (!isAdmin || !members) return false
    const otherAdmins = members.filter(
      (m) => m.id !== profile?.id && (m.role === 'org_admin' || m.role === 'super_admin'),
    )
    return otherAdmins.length === 0
  }, [isAdmin, members, profile?.id])

  return (
    <div className="space-y-6 max-w-[900px]">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Privacy' },
        ]}
      />

      <SectionHeader
        variant="page"
        title="Your data & privacy"
        subtitle="Download a copy of everything we hold about you, or request that your data is anonymised."
        icon={<Shield size={20} />}
      />

      {/* Privacy info panel */}
      <AppCard padding="lg">
        <div className="space-y-4">
        <h2 className="text-body font-semibold text-text-primary inline-flex items-center gap-1.5">
          <Eye size={14} className="text-brand-500" />
          What we collect
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 text-caption text-text-secondary">
          <div>
            <h4 className="text-caption font-medium text-text-primary mb-1">Account data</h4>
            <p>Name, email, phone (optional), role, organisation membership.</p>
          </div>
          <div>
            <h4 className="text-caption font-medium text-text-primary mb-1">Activity</h4>
            <p>Jobs you completed, photos you uploaded, notes you wrote, your sign-in events.</p>
          </div>
          <div>
            <h4 className="text-caption font-medium text-text-primary mb-1">Engineer records</h4>
            <p>If you're an engineer, your skills, accreditations, and signature image.</p>
          </div>
          <div>
            <h4 className="text-caption font-medium text-text-primary mb-1">Field telemetry</h4>
            <p>GPS check-in coordinates and on-site signature when starting / completing a job.</p>
          </div>
        </div>
        <div className="text-micro text-text-muted pt-2 border-t border-border-subtle">
          For our full commitments and how we keep your data safe, see our{' '}
          <a href="/about" className="text-brand-500 hover:underline inline-flex items-center gap-0.5">
            About page <ExternalLink size={10} />
          </a>
          .
        </div>
        </div>
      </AppCard>

      {/* Download my data */}
      <AppCard padding="lg">
        <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/10 shrink-0">
            <Download size={18} className="text-brand-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-body font-semibold text-text-primary">Download my data</h2>
            <p className="text-caption text-text-muted mt-0.5">
              Get a JSON file containing every row of personal data we hold about you. UK GDPR Article 15.
              Link is valid for 7 days once generated.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            isDisabled={!userId || triggerExport.isPending}
            onPress={() => triggerExport.mutate(userId)}
          >
            {triggerExport.isPending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="sm" /> Generating…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Download size={13} /> Generate my export
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
              <Download size={12} /> Download my data
            </a>
          )}
        </div>
        {triggerExport.isSuccess && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-status-compliant/10 border border-status-compliant/20">
            <CheckCircle2 size={14} className="text-status-compliant mt-0.5 shrink-0" />
            <div className="text-caption text-text-secondary">
              Your data is ready. The download link expires in 7 days.
            </div>
          </div>
        )}
        </div>
      </AppCard>

      {/* Delete my account */}
      <AppCard padding="lg">
        <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-status-overdue/10 shrink-0">
            <ShieldOff size={18} className="text-status-overdue" />
          </div>
          <div className="flex-1">
            <h2 className="text-body font-semibold text-text-primary">Delete my account</h2>
            <p className="text-caption text-text-muted mt-0.5">
              Permanently anonymise your personal data. UK GDPR Article 17. This is irreversible.
            </p>
          </div>
        </div>

        {isLastAdmin ? (
          <div className="rounded-lg border border-status-due-soon/30 bg-status-due-soon/5 p-4 flex items-start gap-2">
            <AlertTriangle size={14} className="text-status-due-soon mt-0.5 shrink-0" />
            <div className="text-caption text-text-secondary">
              You are the only admin in this organisation. Promote another user to admin first, then come back to
              delete your account.
            </div>
          </div>
        ) : !showDeleteFlow ? (
          <Button variant="danger-soft" size="sm" onPress={() => setShowDeleteFlow(true)}>
            <ShieldOff size={13} /> Start delete flow
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-status-overdue/30 bg-status-overdue/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-status-overdue mt-0.5 shrink-0" />
                <h4 className="text-caption font-semibold text-text-primary uppercase tracking-[0.04em]">
                  This is irreversible
                </h4>
              </div>
              <ul className="text-caption text-text-secondary space-y-1.5 ml-6 list-disc">
                {/* h4 below sits under h2 above — keeping h4 demoted because the
                    "What this does" panel inside a section is sub-section depth. */}
                <li>Your name, email, phone, and avatar will be removed.</li>
                <li>Your engineer record (if any) will be anonymised; signature image deleted.</li>
                <li>Notes you authored will show "[redacted by GDPR delete request]".</li>
                <li>Job completion history is preserved as "Deleted User" for audit / safety reasons.</li>
                <li>You will be permanently signed out and unable to sign in again.</li>
              </ul>
            </div>

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
                Type exactly <code className="font-mono text-text-secondary">{expectedPhrase}</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                isDisabled={
                  confirmPhrase.trim().toLowerCase() !== expectedPhrase.toLowerCase() ||
                  triggerDelete.isPending
                }
                onPress={() =>
                  triggerDelete.mutate({
                    subject_user_id: userId,
                    confirmation_phrase: confirmPhrase.trim(),
                  })
                }
              >
                {triggerDelete.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner size="sm" /> Deleting…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldOff size={13} /> Delete my account
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setShowDeleteFlow(false)}>
                Cancel
              </Button>
            </div>

            {triggerDelete.isSuccess && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-status-compliant/10 border border-status-compliant/20">
                <CheckCircle2 size={14} className="text-status-compliant mt-0.5 shrink-0" />
                <div className="text-caption text-text-secondary">
                  Your account has been anonymised. You will be signed out shortly.
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </AppCard>

      {/* My GDPR request history */}
      <AppCard padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary inline-flex items-center gap-1.5">
            <FileText size={14} className="text-brand-500" />
            My request history
          </h2>
          <p className="text-caption text-text-muted mt-0.5">
            Every export and delete request you've made.
          </p>
        </div>
        {isLoading ? (
          <ListSkeleton rows={3} withAvatar={false} framed={false} />
        ) : (requests ?? []).length === 0 ? (
          <div className="flex items-center justify-center py-10 text-caption text-text-muted gap-2">
            <Clock size={14} /> No requests yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="My GDPR requests" className="w-full">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Type
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Created
                  </th>
                  <th className="py-3 px-4 text-right text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
                    Result
                  </th>
                </tr></thead>
                <tbody>
                  {(requests ?? []).map((r) => (
                    <tr
                      key={r.id}
                      id={r.id}
                      className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0"
                    >
                      <td className="py-3 px-4">
                        <Chip size="sm" variant="soft" color={r.request_type === 'delete' ? 'danger' : 'default'}>
                          {r.request_type === 'delete' ? 'Delete' : 'Export'}
                        </Chip>
                      </td>
                      <td className="py-3 px-4">{statusChip(r.status)}</td>
                      <td className="py-3 px-4 text-caption text-text-secondary">
                        {new Date(r.created_at).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
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

      <p className="text-micro text-text-muted text-center">
        Need help? Contact us via{' '}
        <Link to="/contact" className="text-brand-500 hover:underline">
          our contact page
        </Link>
        .
      </p>
    </div>
  )
}
