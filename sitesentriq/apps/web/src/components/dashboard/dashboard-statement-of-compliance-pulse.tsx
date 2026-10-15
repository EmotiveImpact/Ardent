import { Link } from 'react-router'
import { Skeleton } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { ArrowRight, Download, FileText, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import {
  getSignedStatementUrl,
  useGenerateStatementNow,
  useStatementsOfCompliance,
} from '@/hooks/use-statements-of-compliance'

function formatStatementMonthLabel(periodStart: string): string {
  const d = new Date(periodStart + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function DashboardStatementOfCompliancePulse() {
  const { profile } = useAuth()
  const { data: statements, isLoading } = useStatementsOfCompliance({ limit: 1 })
  const generate = useGenerateStatementNow()
  const latest = statements?.[0] ?? null

  const canGenerate = profile?.role === 'org_admin' || profile?.role === 'super_admin'

  const handleDownload = async () => {
    if (!latest?.pdf_url) return
    const url = await getSignedStatementUrl(latest.pdf_url)
    if (!url) {
      toast.error('Could not load statement')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleGenerate = async () => {
    try {
      const result = await generate.mutateAsync(undefined)
      const r = result.results[0]
      if (r?.status === 'generated') {
        toast.success(`Statement generated for ${formatStatementMonthLabel(result.period_start)}`)
      } else if (r?.status === 'skipped') {
        toast.error(`Skipped - ${r.message}`)
      } else {
        toast.error(r?.message ?? 'Generation failed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate statement')
    }
  }

  return (
    <AppCard padding="lg" className="relative h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(560px circle at 88% 0%, rgba(139,92,246,0.10), transparent 55%), radial-gradient(420px circle at 0% 100%, rgba(139,92,246,0.06), transparent 60%)',
        }}
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-[0.08em] text-metric-violet whitespace-nowrap">
              <FileText size={12} strokeWidth={2.4} className="shrink-0" />
              Statement of Compliance
            </p>
            <p className="mt-1 text-label text-text-secondary">
              The monthly PDF you can forward to insurers, your board or lenders.
            </p>
          </div>
          {canGenerate ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generate.isPending}
              title={generate.isPending ? 'Generating…' : 'Generate statement now'}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-default bg-surface-elevated text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Generate statement now"
            >
              <RefreshCcw size={14} className={generate.isPending ? 'animate-spin' : ''} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : !latest ? (
          <div className="mt-5 flex flex-1 flex-col items-start gap-3 rounded-xl border border-dashed border-border-default bg-surface-elevated/60 px-4 py-5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-metric-violet/10 text-metric-violet">
              <FileText size={18} strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-body font-semibold text-text-primary">No statement generated yet</p>
              <p className="mt-0.5 text-caption text-text-muted">
                A branded PDF is created on the 1st of each month from your daily compliance scores.
                {canGenerate ? ' Click Generate now to produce one for last month.' : ''}
              </p>
            </div>
          </div>
        ) : (
          /* Grow + centre the content so it fills the card's height (matched to
             the taller Compliance Score card) instead of bunching at the top. */
          <div className="mt-5 flex flex-1 flex-col justify-center gap-6">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-text-primary">
                  {latest.score_avg}
                </span>
                <span className="text-body font-medium text-text-muted">avg / 100</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-label font-medium text-text-primary">
                  {formatStatementMonthLabel(latest.period_start)}
                </span>
                <span className="text-micro text-text-muted">
                  Range {latest.score_min}-{latest.score_max}
                  {latest.email_sent_at ? ' - emailed' : ''}
                </span>
              </div>
            </div>
            {/* Score range visual — fills space meaningfully + shows where the
                month's average sits within its min–max band. */}
            <div>
              <div className="relative h-2 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className="absolute inset-y-0 rounded-full bg-metric-violet/25"
                  style={{ left: `${latest.score_min}%`, right: `${100 - latest.score_max}%` }}
                />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-metric-violet ring-2 ring-surface-card"
                  style={{ left: `${latest.score_avg}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-micro text-text-muted">
                <span>0</span>
                <span>Avg {latest.score_avg}</span>
                <span>100</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!latest.pdf_url}
                className="inline-flex items-center gap-1.5 rounded-lg bg-metric-violet/10 px-3 py-2 text-caption font-semibold text-metric-violet transition-colors hover:bg-metric-violet/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={13} strokeWidth={2.4} />
                Download PDF
              </button>
              <Link
                to="/dashboard/compliance/statements"
                className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-caption font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                View all
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppCard>
  )
}
