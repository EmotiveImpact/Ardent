// Subcontractor compliance requirements editor (completes W2-T5).
// Sets the per-org matrix the dispatch gate enforces: which insurance types
// are mandatory, which accreditation schemes are accepted (any-of), and
// whether an approved RAMS is required. Persists to
// subcontractor_compliance_requirements (00116); an absent row = the SQL
// default, so this screen seeds the org's first row on save.

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AppCard, Button, PageHeader, Switch } from '@haumea/ui'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import {
  useComplianceRequirements,
  useSaveComplianceRequirements,
} from '@/hooks/use-subcontractor-compliance'
import {
  DEFAULT_REQUIREMENTS,
  POLICY_TYPE_LABEL,
  SCHEME_LABEL,
  type ComplianceRequirements,
} from '@/lib/subcontractor-compliance'

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
      <span className="text-label text-text-secondary">{label}</span>
      <Switch isSelected={checked} onChange={onToggle} size="sm" aria-label={label} />
    </label>
  )
}

export default function ComplianceRequirementsPage() {
  const { data: saved, isLoading } = useComplianceRequirements()
  const save = useSaveComplianceRequirements()
  const [draft, setDraft] = useState<ComplianceRequirements>(DEFAULT_REQUIREMENTS)

  useEffect(() => {
    if (saved) setDraft(saved)
  }, [saved])

  const toggleInsurance = (type: string) =>
    setDraft((d) => ({
      ...d,
      insurance: d.insurance.includes(type)
        ? d.insurance.filter((t) => t !== type)
        : [...d.insurance, type],
    }))

  const toggleScheme = (scheme: string) =>
    setDraft((d) => ({
      ...d,
      accreditation_any_of: d.accreditation_any_of.includes(scheme)
        ? d.accreditation_any_of.filter((s) => s !== scheme)
        : [...d.accreditation_any_of, scheme],
    }))

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Subcontractor compliance' },
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
        <PageHeader
          title="Subcontractor compliance"
          subtitle="What a subcontractor must hold before a job can be assigned to them"
        />
      </div>

      {isLoading ? (
        <AppCard padding="md">
          <div className="h-24 animate-pulse rounded-lg bg-surface-page" />
        </AppCard>
      ) : (
        <>
          <AppCard padding="md">
            <h3 className="text-body font-semibold text-text-primary mb-1">Insurance</h3>
            <p className="text-caption text-text-muted mb-2">
              Every type ticked here must have a current (unexpired) policy on file.
            </p>
            <div className="divide-y divide-border-subtle">
              {Object.entries(POLICY_TYPE_LABEL).map(([type, label]) => (
                <CheckRow
                  key={type}
                  label={label}
                  checked={draft.insurance.includes(type)}
                  onToggle={() => toggleInsurance(type)}
                />
              ))}
            </div>
          </AppCard>

          <AppCard padding="md">
            <h3 className="text-body font-semibold text-text-primary mb-1">Accreditation</h3>
            <p className="text-caption text-text-muted mb-2">
              The subcontractor must hold at least <strong>one</strong> current accreditation from
              the schemes ticked here.
            </p>
            <div className="divide-y divide-border-subtle">
              {Object.entries(SCHEME_LABEL).map(([scheme, label]) => (
                <CheckRow
                  key={scheme}
                  label={label}
                  checked={draft.accreditation_any_of.includes(scheme)}
                  onToggle={() => toggleScheme(scheme)}
                />
              ))}
            </div>
          </AppCard>

          <AppCard padding="md">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="text-status-compliant mt-0.5" aria-hidden />
              <div className="flex-1">
                <CheckRow
                  label="Require an approved, in-date RAMS"
                  checked={draft.rams_required}
                  onToggle={() => setDraft((d) => ({ ...d, rams_required: !d.rams_required }))}
                />
                <p className="text-caption text-text-muted">
                  When on, a subcontractor needs at least one approved risk assessment & method
                  statement that hasn&apos;t expired.
                </p>
              </div>
            </div>
          </AppCard>

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onPress={() => setDraft(DEFAULT_REQUIREMENTS)}>
              Reset to default
            </Button>
            <Button
              variant="primary"
              size="sm"
              isDisabled={save.isPending}
              onPress={() => save.mutate(draft)}
            >
              {save.isPending ? 'Saving…' : 'Save requirements'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
