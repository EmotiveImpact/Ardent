import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Spinner } from '@haumea/ui'
import { toast } from 'sonner'

import { useAuthContext } from '@/contexts/auth-context'
import {
  useOnboarding,
  useUpdateOnboardingState,
  type OnboardingState,
} from '@/hooks/use-onboarding'
import {
  WizardLayout,
  ONBOARDING_TOTAL_STEPS,
} from '@/components/onboarding/wizard-layout'
import {
  Step1Welcome,
  Step1Preview,
} from '@/components/onboarding/steps/step-1-welcome'
import {
  Step2Client,
  Step2Preview,
} from '@/components/onboarding/steps/step-2-client'
import {
  Step3Property,
  Step3Preview,
} from '@/components/onboarding/steps/step-3-property'
import {
  Step4Asset,
  Step4Preview,
} from '@/components/onboarding/steps/step-4-asset'
import {
  Step5Compliance,
  Step5CompliancePreview,
} from '@/components/onboarding/steps/step-5-compliance'
import { Step5Ppm, Step5Preview } from '@/components/onboarding/steps/step-5-ppm'

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: {
    title: "Let's get your workspace set up",
    subtitle:
      'A quick 6-step tour. You can skip any step and come back to it later from settings.',
  },
  2: {
    title: 'Add your first client',
    subtitle: 'Clients are the companies you work for. Their properties live underneath them.',
  },
  3: {
    title: 'Add your first property',
    subtitle: 'Add a building or site under your client. We can geocode addresses for the map.',
  },
  4: {
    title: 'Register your first asset',
    subtitle:
      'Assets are the equipment you maintain — boilers, fire panels, lifts, anything inspected.',
  },
  5: {
    title: 'Add your first compliance item',
    subtitle:
      'This is what powers your Compliance Score — the dashboard headline your clients care about most.',
  },
  6: {
    title: 'Schedule recurring maintenance',
    subtitle: "Set up a PPM cycle so the right work gets booked at the right time.",
  },
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { profile, organisation, loading: authLoading } = useAuthContext()
  const { data: state, isLoading: stateLoading } = useOnboarding()
  const update = useUpdateOnboardingState()

  // Locally tracked entity ids so each step can default-select what we just created.
  const [createdClientId, setCreatedClientId] = useState<string | null>(null)
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null)
  const [createdAssetId, setCreatedAssetId] = useState<string | null>(null)

  const [step, setStep] = useState<number>(1)
  const [skipped, setSkipped] = useState<number[]>([])

  // Hydrate from server state once
  useEffect(() => {
    if (!state) return
    setStep(Math.min(Math.max(state.current_step ?? 1, 1), ONBOARDING_TOTAL_STEPS))
    setSkipped(state.skipped_steps ?? [])
  }, [state])

  // First-time visit: stamp `started_at` so the dashboard knows we've engaged.
  useEffect(() => {
    if (!state) return
    if (state.completed) return
    if (!state.started_at) {
      update.mutate({ started_at: new Date().toISOString(), current_step: state.current_step ?? 1 })
    }
    // intentionally exclude `update` (mutation reference is stable enough; mutation only fires once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.started_at, state?.completed])

  // Gate: only org_admin can run the wizard
  useEffect(() => {
    if (authLoading) return
    if (!profile) return
    if (profile.role !== 'org_admin' && profile.role !== 'super_admin') {
      navigate('/dashboard', { replace: true })
    }
  }, [authLoading, profile, navigate])

  // If onboarding is already complete, send them home.
  useEffect(() => {
    if (state?.completed) navigate('/dashboard', { replace: true })
  }, [state?.completed, navigate])

  if (authLoading || stateLoading || !state) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface-page">
        <Spinner size="lg" />
      </div>
    )
  }

  const goTo = (next: number) => {
    const clamped = Math.max(1, Math.min(ONBOARDING_TOTAL_STEPS, next))
    setStep(clamped)
    update.mutate({ current_step: clamped })
  }

  const handleAdvance = (next: number) => goTo(next)
  const handleBack = () => goTo(step - 1)

  const handleSkipStep = async () => {
    const nextSkipped = Array.from(new Set([...skipped, step])).sort((a, b) => a - b)
    setSkipped(nextSkipped)
    await update.mutateAsync({
      skipped_steps: nextSkipped,
      current_step: step + 1,
    })
    if (step >= ONBOARDING_TOTAL_STEPS) {
      finish({ skipAll: false })
      return
    }
    setStep(step + 1)
  }

  const finish = async ({ skipAll }: { skipAll: boolean }) => {
    const remaining = []
    if (skipAll) {
      for (let i = step; i <= ONBOARDING_TOTAL_STEPS; i++) {
        if (!skipped.includes(i)) remaining.push(i)
      }
    }
    const finalSkipped = Array.from(new Set([...skipped, ...remaining])).sort((a, b) => a - b)
    await update.mutateAsync({
      completed: true,
      completed_at: new Date().toISOString(),
      skipped_steps: finalSkipped,
    } satisfies Partial<OnboardingState>)
    if (skipAll) {
      toast.success("All set — you can run the tour later from Settings.")
    } else {
      toast.success("You're all set up — welcome aboard!")
    }
    navigate('/dashboard', { replace: true })
  }

  const onCompleteFinalStep = () => {
    toast.success("Workspace ready — let's go!")
    navigate('/dashboard', { replace: true })
  }

  const titleBlock = STEP_TITLES[step]

  return (
    <WizardLayout
      step={step}
      skippedSteps={skipped}
      title={titleBlock.title}
      subtitle={titleBlock.subtitle}
      preview={
        step === 1 ? (
          <Step1Preview />
        ) : step === 2 ? (
          <Step2Preview orgName={organisation?.name} />
        ) : step === 3 ? (
          <Step3Preview />
        ) : step === 4 ? (
          <Step4Preview />
        ) : step === 5 ? (
          <Step5CompliancePreview />
        ) : (
          <Step5Preview />
        )
      }
      onSkipAll={() => finish({ skipAll: true })}
      isSkippingAll={update.isPending}
    >
      {step === 1 && (
        <Step1Welcome
          onAdvance={() => handleAdvance(2)}
          onSkipStep={handleSkipStep}
        />
      )}
      {step === 2 && (
        <Step2Client
          onAdvance={(id) => {
            setCreatedClientId(id)
            handleAdvance(3)
          }}
          onBack={handleBack}
          onSkipStep={handleSkipStep}
        />
      )}
      {step === 3 && (
        <Step3Property
          defaultClientId={createdClientId}
          onAdvance={(id) => {
            setCreatedPropertyId(id)
            handleAdvance(4)
          }}
          onBack={handleBack}
          onSkipStep={handleSkipStep}
        />
      )}
      {step === 4 && (
        <Step4Asset
          defaultPropertyId={createdPropertyId}
          onAdvance={(id) => {
            setCreatedAssetId(id)
            handleAdvance(5)
          }}
          onBack={handleBack}
          onSkipStep={handleSkipStep}
        />
      )}
      {step === 5 && (
        <Step5Compliance
          defaultAssetId={createdAssetId}
          onAdvance={() => handleAdvance(6)}
          onBack={handleBack}
          onSkipStep={handleSkipStep}
        />
      )}
      {step === 6 && (
        <Step5Ppm
          defaultAssetId={createdAssetId}
          onBack={handleBack}
          onSkipStep={handleSkipStep}
          onComplete={onCompleteFinalStep}
        />
      )}
    </WizardLayout>
  )
}
