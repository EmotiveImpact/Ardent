import { useEffect, useState } from 'react'
import { Button, Card } from '@haumea/ui'
import { Download, X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

const DISMISS_KEY = 'haumea_install_dismissed_at'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    if (!v) return false
    return Date.now() - Number(v) < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window.navigator as any).standalone) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

function isMobileLike(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(max-width: 768px)').matches) return true
  // Some Android tablets: also surface if pointer is coarse
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024
}

/**
 * Captures `beforeinstallprompt` and shows a dismissible banner on mobile-sized
 * viewports. Hidden when already installed or recently dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed() || !isMobileLike()) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      setVisible(false)
      setDeferred(null)
    }
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  if (!visible || !deferred) return null

  const handleInstall = async () => {
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setVisible(false)
      }
      setDeferred(null)
    } catch {
      setVisible(false)
    }
  }

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setVisible(false)
  }

  return (
    <div className="md:hidden fixed inset-x-3 bottom-3 z-40">
      <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default shadow-xl !p-3 flex flex-row items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500/15 text-brand-500 flex items-center justify-center flex-shrink-0">
          <Smartphone size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label font-semibold text-text-primary leading-tight">Install Facilities OS</p>
          <p className="text-micro text-text-secondary mt-0.5">Faster access from your home screen.</p>
        </div>
        <Button
          size="sm"
          variant="primary"
          onPress={handleInstall}
        >
          <Download size={14} />
          Install
        </Button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors flex-shrink-0"
        >
          <X size={16} />
        </button>
      </Card>
    </div>
  )
}
