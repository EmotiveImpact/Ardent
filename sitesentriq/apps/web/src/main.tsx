import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'
import { AuthProvider } from '@/contexts/auth-context'
import { ThemeProvider } from '@/contexts/theme-context'
import { initObservability } from '@/lib/observability'
import { APP_VERSION } from '@/lib/constants'
import './index.css'
import App from './App'

// Initialise Sentry as early as possible so subsequent errors are captured.
// No-op when VITE_SENTRY_DSN is unset (dev/test/local builds).
initObservability()

// ──────────────────────────────────────────────────────────────────
// Wave 17 perf — persist the query cache to IndexedDB so every page
// reload / new tab paints data INSTANTLY from disk, then revalidates
// in the background. Pattern: stale-while-revalidate.
//
// Why IndexedDB (via idb-keyval) over localStorage:
//   - Async, doesn't block first paint
//   - 50–250 MB quota vs localStorage's ~5 MB
//   - Survives tab close, browser restart, etc.
//
// Cache invalidation:
//   - `buster` keyed to APP_VERSION (from package.json) — every deploy
//     bumps the version, which invalidates stale schemas after a release.
//   - `maxAge: 24h` — anything older than a day is discarded so we don't
//     show users week-old numbers if they revisit infrequently.
//   - Per-query staleTime (5 min default) decides whether to revalidate
//     in the background; the persisted cache decides whether to render
//     INSTANTLY vs. wait for the network.
// ──────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh without turning every route mount into a network
      // storm. Persisted results older than this revalidate on mount; fresh
      // results paint from memory/IndexedDB without blocking navigation.
      staleTime: 60_000,
      // gcTime defines how long inactive queries linger in memory +
      // persistence. 24h is generous enough to survive overnight tab
      // restores while still bounded.
      gcTime: 1000 * 60 * 60 * 24,
      // Default TanStack behaviour is enough here: stale queries revalidate
      // on mount/reconnect, while Supabase Realtime drives live updates.
      // Avoid refetch-on-focus and global polling; on busy dashboard pages
      // those settings caused dozens of duplicate Supabase requests.
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
})

const IDB_KEY = 'haumea-query-cache'

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get(k),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  key: IDB_KEY,
  // Throttle writes — batches rapid query updates into a single
  // IDB write per 1s to keep the main thread happy.
  throttleTime: 1000,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user" — globally honour prefers-reduced-motion: framer
        drops transform/layout animation (keeps opacity) so no component needs
        to branch on it by hand. */}
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          // 24h: anything older is dropped so a long-absent user doesn't
          // see stale data from a previous week.
          maxAge: 1000 * 60 * 60 * 24,
          // Buster: bumping APP_VERSION (via package.json) blows away
          // the cache on every deploy. This protects against schema
          // changes between releases.
          buster: APP_VERSION,
          dehydrateOptions: {
            // Don't persist failed queries — they'd just re-fail on
            // restore. Successful queries only.
            shouldDehydrateQuery: (q) => q.state.status === 'success',
          },
        }}
      >
        <AuthProvider>
          <App />
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
    </MotionConfig>
  </StrictMode>,
)
