import { useState, useMemo } from 'react'
import { Button, Chip } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { CreditCard, Sparkles, AlertCircle, Building2, Calendar, Users, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useSubscription, daysUntil } from '@/hooks/use-subscription'
import { useProperties } from '@/hooks/use-properties'
import { useAuthContext } from '@/contexts/auth-context'
import { supabase } from '@/lib/supabase'
import { PLANS, PLAN_ORDER, getPlan, type PlanId } from '@/lib/billing/plans'
import { CardGridSkeleton, KpiGridSkeleton } from '@/components/shared/skeletons'

export default function BillingSettingsPage() {
  const navigate = useNavigate()
  const { organisation } = useAuthContext()
  const { data: sub, isLoading } = useSubscription()
  const { data: properties = [] } = useProperties()
  const [working, setWorking] = useState(false)

  const currentPlan = getPlan(sub?.plan)
  const trialDaysLeft = daysUntil(sub?.trial_ends_at ?? null)
  const periodDaysLeft = daysUntil(sub?.current_period_end ?? null)

  const projectedNextCharge = useMemo(() => {
    if (!sub) return null
    if (currentPlan.pricePerSeat == null) return null
    return currentPlan.pricePerSeat * (sub.seats || 1)
  }, [sub, currentPlan])

  const propertyLimit = currentPlan.propertyLimit
  const propertyUsage = properties.length
  const propertyPct =
    propertyLimit != null ? Math.min(100, Math.round((propertyUsage / propertyLimit) * 100)) : 0

  // ── Actions ─────────────────────────────────────────────
  const startCheckout = async (planId: PlanId) => {
    if (!organisation?.id) {
      toast.error('No organisation in context')
      return
    }
    if (planId === 'enterprise') {
      navigate('/contact?type=enterprise')
      return
    }

    setWorking(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          planId,
          seats: Math.max(1, sub?.seats || 1),
          orgId: organisation.id,
          returnUrl: `${window.location.origin}/dashboard/settings/billing`,
        },
      })
      if (error) throw error
      if (!data?.url) throw new Error('No checkout URL returned')
      window.location.href = data.url
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start checkout'
      toast.error(msg)
      setWorking(false)
    }
  }

  const openPortal = async () => {
    if (!organisation?.id) return
    setWorking(true)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', {
        body: {
          orgId: organisation.id,
          returnUrl: `${window.location.origin}/dashboard/settings/billing`,
        },
      })
      if (error) throw error
      if (!data?.url) throw new Error('No portal URL returned')
      window.location.href = data.url
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open billing portal'
      toast.error(msg)
      setWorking(false)
    }
  }

  // ── Render ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5 max-w-[1100px]">
        <KpiGridSkeleton count={3} />
        <CardGridSkeleton count={3} columns={3} />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-[1100px]">
      <Breadcrumbs
        items={[
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Billing' },
        ]}
      />

      <div>
        <PageHeader title="Billing" subtitle="Plan, seats, and payment method." />
      </div>

      {/* Trial banner */}
      {sub?.status === 'trialing' && trialDaysLeft != null && (
        <div className="flex items-start gap-3 p-4 bg-brand-500/10 border border-brand-500/30 rounded-xl">
          <Sparkles size={18} className="text-brand-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-body font-semibold text-text-primary">
              Your trial ends in {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}
            </p>
            <p className="text-label text-text-secondary mt-0.5">
              Add a payment method to keep your team running without interruption.
            </p>
          </div>
          <Button variant="primary" size="sm" onPress={() => startCheckout(currentPlan.id)} isDisabled={working}>
            Add payment method
          </Button>
        </div>
      )}

      {/* Past-due banner */}
      {sub?.status === 'past_due' && (
        <div className="flex items-start gap-3 p-4 bg-status-overdue/10 border border-status-overdue/30 rounded-xl">
          <AlertCircle size={18} className="text-status-overdue flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-body font-semibold text-text-primary">Payment failed</p>
            <p className="text-label text-text-secondary mt-0.5">
              Your last payment didn&apos;t go through. Update your card to avoid service interruption.
            </p>
          </div>
          <Button variant="primary" size="sm" onPress={openPortal} isDisabled={working}>
            Update card
          </Button>
        </div>
      )}

      {/* Current plan */}
      <AppCard padding="none" className="overflow-hidden">
        <header className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-text-muted" />
            <h2 className="text-body font-semibold text-text-primary">Current plan</h2>
          </div>
          <StatusChip status={sub?.status} />
        </header>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Plan" value={currentPlan.name} icon={Sparkles} />
          <Stat
            label="Seats"
            value={sub ? `${sub.seats}` : '—'}
            icon={Users}
          />
          <Stat
            label="Period ends"
            value={
              sub?.current_period_end
                ? new Date(sub.current_period_end).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'
            }
            icon={Calendar}
          />
          <Stat
            label="Next charge"
            value={
              projectedNextCharge != null
                ? `£${projectedNextCharge.toLocaleString('en-GB')}`
                : currentPlan.pricePerSeat == null
                ? 'Custom'
                : '—'
            }
            icon={Receipt}
          />
        </div>
        <footer className="px-5 py-4 border-t border-border-subtle flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={openPortal}
            isDisabled={working || !sub?.stripe_customer_id}
          >
            Manage subscription
          </Button>
          {!sub?.stripe_customer_id && (
            <span className="text-caption text-text-muted">
              Subscribe first to access the Stripe Billing Portal.
            </span>
          )}
        </footer>
      </AppCard>

      {/* Usage */}
      <AppCard padding="none" className="overflow-hidden">
        <header className="px-5 py-4 border-b border-border-subtle flex items-center gap-2">
          <Building2 size={16} className="text-text-muted" />
          <h2 className="text-body font-semibold text-text-primary">Usage</h2>
        </header>
        <div className="p-5 space-y-4">
          {/* Properties */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-label font-medium text-text-primary">Properties</span>
              <span className="text-caption text-text-muted">
                {propertyUsage}{propertyLimit != null ? ` / ${propertyLimit}` : ''}
              </span>
            </div>
            {propertyLimit != null && (
              <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    propertyPct >= 90 ? 'bg-status-overdue' : propertyPct >= 75 ? 'bg-status-due-soon' : 'bg-brand-500'
                  }`}
                  style={{ width: `${propertyPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Period progress */}
          {periodDaysLeft != null && sub?.current_period_start && sub.current_period_end && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-label font-medium text-text-primary">Days remaining in period</span>
                <span className="text-caption text-text-muted">{periodDaysLeft} days</span>
              </div>
              <PeriodBar
                start={sub.current_period_start}
                end={sub.current_period_end}
              />
            </div>
          )}
        </div>
      </AppCard>

      {/* Plan switcher */}
      <AppCard padding="none" className="overflow-hidden">
        <header className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">Switch plan</h2>
          <p className="text-caption text-text-muted mt-0.5">
            Changes apply immediately and prorate at the next billing cycle.
          </p>
        </header>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id]
            const isCurrent = sub?.plan === id
            return (
              <div
                key={id}
                className={`relative rounded-xl border p-4 transition-colors ${
                  isCurrent
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-border-default bg-surface-elevated/30 hover:border-border-strong'
                }`}
              >
                {p.popular && (
                  <Chip size="sm" color="accent" variant="soft" className="absolute -top-2 right-3">
                    Most popular
                  </Chip>
                )}
                <h3 className="text-body font-semibold text-text-primary">{p.name}</h3>
                <p className="text-caption text-text-muted mt-0.5 mb-3 line-clamp-2">{p.tagline}</p>
                <p className="text-[18px] font-bold text-text-primary">
                  {p.pricePerSeat != null ? (
                    <>
                      £{p.pricePerSeat}
                      <span className="text-caption font-normal text-text-muted"> /seat/mo</span>
                    </>
                  ) : (
                    'Custom'
                  )}
                </p>
                <Button
                  size="sm"
                  className="mt-4 w-full"
                  variant={isCurrent ? 'ghost' : 'primary'}
                  isDisabled={isCurrent || working}
                  onPress={() => startCheckout(id)}
                >
                  {isCurrent ? 'Current plan' : id === 'enterprise' ? 'Talk to sales' : `Switch to ${p.name}`}
                </Button>
              </div>
            )
          })}
        </div>
      </AppCard>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-text-muted" />
        <span className="text-micro font-medium text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[15px] font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function StatusChip({ status }: { status: string | undefined }) {
  if (!status) return <Chip size="sm" variant="soft">No subscription</Chip>
  const map: Record<string, { color: 'accent' | 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
    trialing: { color: 'accent', label: 'Trial' },
    active: { color: 'success', label: 'Active' },
    past_due: { color: 'danger', label: 'Past due' },
    canceled: { color: 'default', label: 'Cancelled' },
    unpaid: { color: 'danger', label: 'Unpaid' },
    incomplete: { color: 'warning', label: 'Incomplete' },
    incomplete_expired: { color: 'default', label: 'Expired' },
    paused: { color: 'warning', label: 'Paused' },
  }
  const cfg = map[status] ?? { color: 'default' as const, label: status }
  return (
    <Chip size="sm" color={cfg.color} variant="soft">
      {cfg.label}
    </Chip>
  )
}

function PeriodBar({ start, end }: { start: string; end: string }) {
  const [now] = useState(() => Date.now())
  const pct = useMemo(() => {
    const startMs = new Date(start).getTime()
    const total = new Date(end).getTime() - startMs
    const elapsed = now - startMs
    return total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0
  }, [end, now, start])
  return (
    <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
      <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}
