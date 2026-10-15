// Wave 17C — UpgradeModal migrated to HeroUI v3 <Modal>.
//
// Soft paywall — shown when a user on a lower-tier plan opens a feature
// locked behind a higher tier. We deliberately don't enforce on the server
// yet; this is purely a nudge.
//
// Internally renders <Modal.Backdrop isOpen=…> in controlled mode and
// surfaces canonical accessibility behaviour (focus trap, ESC, scroll lock,
// click-outside-to-close) for free.

import { useNavigate } from 'react-router'
import { Sparkles } from 'lucide-react'
import { Button, Modal } from '@haumea/ui'
import { getFeatureMeta, getPlanForFeature, type GatedFeature } from '@/lib/billing/plan-gating'

interface UpgradeModalProps {
  /** When true the modal is rendered. Closing routes the user back to /dashboard. */
  isOpen: boolean
  feature: GatedFeature
  /** Optional override for the close handler. Default: navigate(-1). */
  onClose?: () => void
}

export function UpgradeModal({ isOpen, feature, onClose }: UpgradeModalProps) {
  const navigate = useNavigate()
  const meta = getFeatureMeta(feature)
  const plan = getPlanForFeature(feature)

  const handleClose = () => {
    if (onClose) {
      onClose()
      return
    }
    navigate('/dashboard')
  }

  const handleUpgrade = () => navigate('/dashboard/settings/billing')

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      variant="blur"
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <Sparkles className="size-5" />
            </Modal.Icon>
            <Modal.Heading>
              Upgrade to {plan.name} to unlock {meta.label}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-label text-text-secondary leading-relaxed">{meta.description}</p>

            <div className="mt-4 p-4 bg-surface-elevated border border-border-subtle rounded-lg">
              <p className="text-micro font-semibold text-text-muted uppercase tracking-wider mb-2">
                {plan.name} includes
              </p>
              <ul className="space-y-1.5">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="text-label text-text-secondary flex items-start gap-2">
                    <span className="text-brand-500 flex-shrink-0">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {plan.pricePerSeat != null && (
                <p className="text-caption text-text-muted mt-3">
                  From <strong className="text-text-primary">£{plan.pricePerSeat}</strong> per seat / month
                </p>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={handleClose}>
              Not now
            </Button>
            <Button variant="primary" onPress={handleUpgrade}>
              See plans
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
