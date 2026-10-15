// Plan-gated feature flags.
//
// We deliberately do NOT enforce these limits on the server yet —
// premature, given Stripe isn't live and customers haven't been
// onboarded. The intent today is purely UI: nudge Starter customers
// toward Growth when they hit a paywalled surface.
//
// Convention:
//   - feature `key` is a dotted slug, used in <PlanGate feature="..."/>
//   - `requiredPlan` is the lowest plan tier that includes the feature
//   - `growthOnly` means Enterprise also has access (the inclusion model
//     is hierarchical: starter ⊂ growth ⊂ enterprise)

import type { PlanId } from './plans'
import { PLANS } from './plans'

export type GatedFeature = 'insights' | 'audit_log' | 'integrations' | 'sso' | 'branding'

interface FeatureSpec {
  /** Lowest plan tier that unlocks this feature. */
  requiredPlan: PlanId
  /** Short label used in upgrade modals. */
  label: string
  /** One-sentence reason shown in the upgrade modal. */
  description: string
}

const FEATURES: Record<GatedFeature, FeatureSpec> = {
  insights: {
    requiredPlan: 'growth',
    label: 'Insights',
    description: 'Operational signals across compliance, capacity, revenue trend, and at-risk clients.',
  },
  audit_log: {
    requiredPlan: 'growth',
    label: 'Audit log',
    description: 'Per-user activity log with full export — required for ISO/SOC audits.',
  },
  integrations: {
    requiredPlan: 'growth',
    label: 'Integrations',
    description: 'Webhooks + REST API for syncing with finance and CMMS systems.',
  },
  sso: {
    requiredPlan: 'enterprise',
    label: 'SSO & SAML',
    description: 'Single sign-on via Okta, Google Workspace, or Azure AD.',
  },
  branding: {
    requiredPlan: 'growth',
    label: 'White-label branding',
    description: 'Show your logo and brand colours in the client portal — turn the platform into a value-add you can resell.',
  },
}

/** Plan hierarchy — index = strictly increasing tier. */
const PLAN_RANK: Record<PlanId, number> = {
  starter: 0,
  growth: 1,
  enterprise: 2,
}

/**
 * Returns true if a given current plan is allowed to use the feature.
 * Unknown / unset plan defaults to `starter` (most restrictive).
 */
export function planAllows(currentPlan: PlanId | undefined | null, feature: GatedFeature): boolean {
  const cur = (currentPlan && PLAN_RANK[currentPlan] != null) ? currentPlan : 'starter'
  const required = FEATURES[feature].requiredPlan
  return PLAN_RANK[cur] >= PLAN_RANK[required]
}

/**
 * Returns the upgrade target needed for a feature, or `null` if the
 * current plan already includes it.
 */
export function requiresPlan(currentPlan: PlanId | undefined | null, feature: GatedFeature): PlanId | null {
  if (planAllows(currentPlan, feature)) return null
  return FEATURES[feature].requiredPlan
}

export function getFeatureMeta(feature: GatedFeature): FeatureSpec {
  return FEATURES[feature]
}

export function getPlanForFeature(feature: GatedFeature) {
  return PLANS[FEATURES[feature].requiredPlan]
}
