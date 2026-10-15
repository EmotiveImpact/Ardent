import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Mounts a sonner toast when a new service worker version is detected,
 * with a Refresh action that activates the new SW and reloads the page.
 *
 * Also fires a one-shot toast when the app first becomes available offline.
 */
export function SWUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      // Optional: log SW URL during dev/staging diagnostics
      if (typeof console !== 'undefined') {
        console.info('[SW] registered:', swUrl)
      }
    },
    onRegisterError(error) {
      console.warn('[SW] registration failed', error)
    },
  })

  useEffect(() => {
    if (needRefresh) {
      toast('New version available', {
        description: 'Refresh to load the latest update.',
        duration: Infinity,
        action: {
          label: 'Refresh',
          onClick: () => {
            updateServiceWorker(true)
          },
        },
        onDismiss: () => setNeedRefresh(false),
      })
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  useEffect(() => {
    if (offlineReady) {
      toast.success('Ready to work offline', {
        description: 'The app will keep working without a connection.',
        duration: 4000,
        onAutoClose: () => setOfflineReady(false),
        onDismiss: () => setOfflineReady(false),
      })
    }
  }, [offlineReady, setOfflineReady])

  return null
}
