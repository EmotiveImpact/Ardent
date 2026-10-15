/**
 * /dashboard/compliance/statements
 *
 * History page for the Monthly Statement of Compliance. Lists every
 * past statement with the period range, average score, and a download
 * link to the PDF (or HTML fallback). Admins also get a "Generate now"
 * button to backfill / refresh the previous month.
 *
 * Sibling to the dashboard widget — same hook, just paged out for
 * "show me everything we have".
 */

import { useState } from 'react'
import { Skeleton, Chip, Button } from '@haumea/ui'
import { Download, FileText, RefreshCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import {
  useStatementsOfCompliance,
  useGenerateStatementNow,
  getSignedStatementUrl,
  type StatementOfComplianceRow,
} from '@/hooks/use-statements-of-compliance'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { Text } from '@haumea/ui'

function formatMonth(period_start: string): string {
  return new Date(period_start + 'T00:00:00Z').toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatDate(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function scoreToneClasses(score: number): string {
  if (score >= 85) return 'text-status-compliant'
  if (score >= 70) return 'text-brand-500'
  if (score >= 50) return 'text-status-due-soon'
  return 'text-status-overdue'
}

interface DownloadButtonProps {
  row: StatementOfComplianceRow
}

function DownloadButton({ row }: DownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!row.pdf_url) {
      toast.error('No file available for this statement')
      return
    }
    setLoading(true)
    try {
      const url = await getSignedStatementUrl(row.pdf_url)
      if (!url) {
        toast.error('Could not load file')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onPress={handleClick}
      isDisabled={!row.pdf_url || loading}
    >
      <Download size={13} strokeWidth={2.4} />
      {loading ? 'Opening…' : 'Download'}
    </Button>
  )
}

export default function StatementsOfCompliancePage() {
  const { profile } = useAuth()
  const { data, isLoading } = useStatementsOfCompliance({ limit: 36 })
  const generate = useGenerateStatementNow()

  const canGenerate = profile?.role === 'org_admin' || profile?.role === 'super_admin'

  const handleGenerate = async () => {
    try {
      const result = await generate.mutateAsync(undefined)
      const r = result.results[0]
      if (r?.status === 'generated') {
        toast.success(`Statement generated for ${formatMonth(result.period_start)}`)
      } else if (r?.status === 'skipped') {
        toast.error(`Skipped — ${r.message}`)
      } else {
        toast.error(r?.message ?? 'Generation failed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate statement')
    }
  }

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Compliance', path: '/dashboard/compliance' },
          { label: 'Statements of Compliance' },
        ]}
      />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {/* TODO(Wave F): Migrate this complex title to PageHeader once icon/adornment support exists. */}
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary flex items-center gap-2">
            <FileText size={20} className="text-metric-violet" strokeWidth={2.2} />
            Statements of Compliance
          </h1>
          <p className="mt-1 text-label text-text-secondary max-w-2xl">
            A branded PDF is generated automatically on the 1st of each month from your daily
            compliance scores. Forward these to your insurer, board, lender or auditors as
            evidence of your compliance posture for the period.
          </p>
        </div>
        {canGenerate && (
          <Button
            variant="primary"
            onPress={handleGenerate}
            isDisabled={generate.isPending}
          >
            <RefreshCcw size={14} className={generate.isPending ? 'animate-spin' : ''} strokeWidth={2.2} />
            {generate.isPending ? 'Generating…' : 'Generate now'}
          </Button>
        )}
      </header>

      <section className="rounded-xl border border-border-default bg-surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-elevated">
              <ShieldCheck size={28} className="text-text-muted" />
            </div>
            <Text scale="body" weight="semibold">
              No statements yet
            </Text>
            <p className="mt-1 text-caption text-text-muted max-w-md">
              The first statement will appear after the 1st of next month. Admins can also
              click <strong>Generate now</strong> above to backfill the previous month.
            </p>
          </div>
        ) : (
          <table aria-label="Statements of Compliance">
            <thead><tr>
              <th>Period</th>
              <th>Range</th>
              <th>Average score</th>
              <th>Email</th>
              <th>Generated</th>
              <th>{''}</th>
            </tr></thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} id={row.id}>
                  <td>
                    <div>
                      <p className="text-label font-medium text-text-primary">
                        {formatMonth(row.period_start)}
                      </p>
                      <Text scale="micro" tone="muted">
                        {formatDate(row.period_start)} – {formatDate(row.period_end)}
                      </Text>
                    </div>
                  </td>
                  <td>
                    <span className="text-label text-text-secondary">
                      {row.score_min}–{row.score_max}
                    </span>
                  </td>
                  <td>
                    <span className={`text-[18px] font-semibold tracking-tight ${scoreToneClasses(row.score_avg)}`}>
                      {row.score_avg}
                      <Text scale="micro" as="span" tone="muted" className="ml-0.5">/100</Text>
                    </span>
                  </td>
                  <td>
                    {row.email_sent_at ? (
                      <Chip size="sm" variant="soft" color="success">Sent</Chip>
                    ) : (
                      <Chip size="sm" variant="soft" color="default">Not sent</Chip>
                    )}
                  </td>
                  <td>
                    <Text scale="caption" as="span" tone="muted">
                      {formatDate(row.created_at.slice(0, 10))}
                    </Text>
                  </td>
                  <td>
                    <DownloadButton row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
