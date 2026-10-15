import { useState } from 'react'
import { Link } from 'react-router'
import { Sparkles, X } from 'lucide-react'
import { useSubscription, daysUntil } from '@/hooks/use-subscription'

const SESSION_DISMISS_KEY = 'haumea_trial_banner_dismissed'

/**
 * Soft top-of-app banner shown only when:
 *   - the org's subscription status === 'trialing'
 *   - the trial has 7 or fewer days remaining
 *   - the user hasn't dismissed it this session (sessionStorage)
 *
 * Click X to dismiss for the session. Refresh of a new tab will show it again.
 */
export function TrialBanner() {
  const { data: sub } = useSubscription()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed) return null
  if (!sub || sub.status !== 'trialing') return null

  const daysLeft = daysUntil(sub.trial_ends_at)
  if (daysLeft == null || daysLeft > 7) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  const dayLabel = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'in 1 day' : `in ${daysLeft} days`

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-4 py-2.5 bg-brand-500/10 border-b border-brand-500/30 text-label text-text-primary"
    >
      <Sparkles size={15} className="text-brand-500 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        Your trial ends <strong>{dayLabel}</strong>. Add a payment method to keep your team running.
      </span>
      <Link
        to="/dashboard/settings/billing"
        className="text-caption font-semibold text-brand-500 hover:text-brand-400 transition-colors whitespace-nowrap"
      >
        Add payment method →
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss trial banner"
        className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated/60 transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
