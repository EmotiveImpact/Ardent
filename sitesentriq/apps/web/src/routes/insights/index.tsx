import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Sparkles } from 'lucide-react'
import { InsightsPanel } from '@/components/shared/insights-panel'
import { useInsights } from '@/hooks/use-insights'
import { formatCurrency } from '@haumea/utils'
import { featureFlags } from '@/lib/feature-flags'
import { useSubscription } from '@/hooks/use-subscription'
import { planAllows } from '@/lib/billing/plan-gating'
import { UpgradeModal } from '@/components/shared/upgrade-modal'
import { PageHeader } from '@haumea/ui'

export default function InsightsPage() {
  const { atRisk, revenue, capacity } = useInsights()
  const navigate = useNavigate()
  const { data: subscription, isLoading: subLoading } = useSubscription()
  const [modalOpen, setModalOpen] = useState(true)

  // Soft paywall: Starter plans see an upgrade modal instead of the panel.
  // We don't block the network calls — the rendered surface is the gate.
  if (!subLoading && !planAllows(subscription?.plan, 'insights')) {
    return (
      <UpgradeModal
        isOpen={modalOpen}
        feature="insights"
        onClose={() => {
          setModalOpen(false)
          navigate('/dashboard')
        }}
      />
    )
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-brand-500" />
          <PageHeader title="Insights" />
        </div>
        <p className="text-label text-text-muted">Operational signals from your live data — directional, not predictive.</p>
      </div>

      <InsightsPanel variant="full" showHeader={false} />

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* At-risk clients table */}
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
            <h3 className="text-body font-semibold text-text-primary">At-Risk Clients</h3>
            <p className="text-caption text-text-muted mt-0.5">Clients flagged by compliance & invoice signals</p>
          </div>
          <div className="p-5">
            {!atRisk || atRisk.count === 0 ? (
              <p className="text-label text-text-muted text-center py-6">No clients currently at risk.</p>
            ) : (
              <ul className="space-y-2">
                {atRisk.clients.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-elevated/50 border border-border-subtle"
                  >
                    <div>
                      <p className="text-label font-medium text-text-primary">{c.name}</p>
                      <p className="text-micro text-text-muted">{c.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Revenue trend bars */}
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
            <h3 className="text-body font-semibold text-text-primary">Revenue Trend</h3>
            <p className="text-caption text-text-muted mt-0.5">Last 6 months — trend signal, not a forecast.</p>
          </div>
          <div className="p-5">
            {!revenue || revenue.monthly.length === 0 ? (
              <p className="text-label text-text-muted text-center py-6">Not enough invoice history yet.</p>
            ) : (
              <>
                <div className="flex items-end gap-1.5 h-32">
                  {revenue.monthly.map((v, i) => {
                    const max = Math.max(...revenue.monthly, revenue.forecast, 1)
                    const heightPct = (v / max) * 100
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end">
                        <div
                          className="w-full rounded-t bg-metric-teal/40 transition-all"
                          style={{ height: `${heightPct}%`, minHeight: v > 0 ? 4 : 0 }}
                          title={formatCurrency(v)}
                        />
                      </div>
                    )
                  })}
                  {featureFlags.insightsForecast && (
                    <div className="flex-1 flex flex-col items-center justify-end">
                      <div
                        className="w-full rounded-t bg-brand-500 border-2 border-dashed border-brand-300 transition-all"
                        style={{
                          height: `${(revenue.forecast / Math.max(...revenue.monthly, revenue.forecast, 1)) * 100}%`,
                          minHeight: 4,
                        }}
                        title={`Projected: ${formatCurrency(revenue.forecast)}`}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3 text-micro text-text-muted">
                  <span>6 months ago</span>
                  <span className="font-medium">{featureFlags.insightsForecast ? 'Projected' : 'This month'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Capacity heatmap (next 14 days) */}
        <div className="bg-surface-card border border-border-default rounded-xl lg:col-span-2">
          <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
            <h3 className="text-body font-semibold text-text-primary">Engineer Capacity</h3>
            <p className="text-caption text-text-muted mt-0.5">Workload signal — next 14 days</p>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-3">
              <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Active Engineers</p>
              <p className="text-title font-bold text-text-primary mt-1">{capacity?.totalEngineers ?? 0}</p>
            </div>
            <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-3">
              <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Scheduled Jobs</p>
              <p className="text-title font-bold text-text-primary mt-1">{capacity?.totalJobs ?? 0}</p>
            </div>
            <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-3">
              <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Over-booked</p>
              <p className="text-title font-bold text-metric-rose mt-1">{capacity?.overBooked ?? 0}</p>
            </div>
            <div className="bg-surface-elevated/50 border border-border-subtle rounded-lg p-3">
              <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Under-booked</p>
              <p className="text-title font-bold text-metric-teal mt-1">{capacity?.underBooked ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
