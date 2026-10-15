import type { ReactNode } from 'react'
import { DeployStatusBanner } from '@/components/dev/deploy-status-banner'
import {
  DashboardKpiGrid,
  DashboardPurchaseOrderWidgets,
  DashboardQuoteTypeWidgets,
} from '@/components/dashboard/dashboard-kpi-grid'
import { DashboardKpiHeroRow } from '@/components/dashboard/dashboard-kpi-hero-row'
import {
  DashboardJobsActivityFeed,
  DashboardRecentActivityRail,
} from '@/components/dashboard/dashboard-jobs-activity-feed'
import { DashboardComplianceFeed } from '@/components/dashboard/dashboard-compliance-feed'
import { DashboardComplianceScoreCard } from '@/components/dashboard/dashboard-compliance-score-card'
import { DashboardTrendChart } from '@/components/dashboard/dashboard-trend-chart'
import { DashboardStatementOfCompliancePulse } from '@/components/dashboard/dashboard-statement-of-compliance-pulse'
import { DashboardCustomize } from '@/components/dashboard/dashboard-customize'
import { InsightsPanel } from '@/components/shared/insights-panel'
import { useDashboardPrefs } from '@/hooks/use-dashboard-prefs'
import { mergeLayout, zoneOrder } from '@/lib/dashboard-widgets'
import { useAuth } from '@/hooks/use-auth'

// Renderers per widget key (registry: lib/dashboard-widgets.ts). The hero
// greeting row is pinned — everything below it is user-composable (W1-T4).
const WIDGET_RENDERERS: Record<string, () => ReactNode> = {
  compliance_overview: () => (
    // Compliance flagship — the product's headline metric. Prominent, but at
    // 2/3 (a single 0-100 score doesn't fill a full row) paired with its
    // reporting sibling, the Statement of Compliance.
    <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <DashboardComplianceScoreCard />
      </div>
      <div className="lg:col-span-1">
        <DashboardStatementOfCompliancePulse />
      </div>
    </div>
  ),
  kpi_grid: () => (
    <div>
      <h2 className="sr-only">Today&apos;s Operation</h2>
      <DashboardKpiGrid />
    </div>
  ),
  trend_chart: () => <DashboardTrendChart />,
  jobs_activity: () => <DashboardJobsActivityFeed />,
  quote_widgets: () => <DashboardQuoteTypeWidgets />,
  po_widgets: () => <DashboardPurchaseOrderWidgets />,
  compliance_feed: () => <DashboardComplianceFeed />,
  insights: () => <InsightsPanel variant="compact" />,
  activity_rail: () => <DashboardRecentActivityRail />,
}

export default function DashboardPage() {
  const { profile, organisation } = useAuth()
  const { data: savedLayout } = useDashboardPrefs()

  const greetingName = (profile?.full_name?.split(' ')[0] ?? 'there').trim()
  const orgName = organisation?.name ?? 'Your organisation'
  const showDeployBanner = profile?.role === 'super_admin'

  const layout = mergeLayout(savedLayout)
  const mainKeys = zoneOrder(layout, 'main')
  const leftKeys = zoneOrder(layout, 'left')
  const showRail = zoneOrder(layout, 'rail').length > 0
  const showLowerGrid = leftKeys.length > 0 || showRail

  return (
    <div className="space-y-5">
      {showDeployBanner ? <DeployStatusBanner placement="dashboard" /> : null}

      {/* Greeting leads — sets context before the numbers. Pinned. */}
      <DashboardKpiHeroRow greetingName={greetingName} orgName={orgName} />

      <div className="flex justify-end -mt-2">
        <DashboardCustomize />
      </div>

      {mainKeys.map((key) => (
        <div key={key}>{WIDGET_RENDERERS[key]?.()}</div>
      ))}

      {showLowerGrid && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {leftKeys.length > 0 && (
            <div className={`space-y-5 ${showRail ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              {leftKeys.map((key) => (
                <div key={key}>{WIDGET_RENDERERS[key]?.()}</div>
              ))}
            </div>
          )}
          {showRail && (
            <div className="lg:col-span-1">
              <DashboardRecentActivityRail />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
