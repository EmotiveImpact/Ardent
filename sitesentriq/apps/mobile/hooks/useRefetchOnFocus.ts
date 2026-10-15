import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'

/**
 * Re-run a refetch each time the screen regains focus.
 *
 * Why: the list/badge hooks (useJobs, useNotifications) only fetch on mount and
 * on manual pull-to-refresh. Because expo-router keeps tab screens mounted,
 * returning from a job detail after a check-in/out — or from the notifications
 * screen after marking all read — left the list/badge showing stale data until
 * the app was relaunched. This refetches on focus so the engineer always sees
 * the current state.
 *
 * The first focus is skipped because the hook's own mount effect already did
 * the initial (skeleton-showing) load — we don't want to double-fetch. The
 * refetch is called with `{ silent: true }` so subsequent focus refreshes swap
 * the data underneath without flashing a skeleton.
 */
export function useRefetchOnFocus(refetch: (opts?: { silent?: boolean }) => void) {
  const first = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false
        return
      }
      refetch({ silent: true })
    }, [refetch]),
  )
}
