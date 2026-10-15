import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import strip from '@rollup/plugin-strip'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
) as { name: string; version: string }

// Package metadata is the source of truth for the visible app version,
// persisted-query-cache buster, and Sentry release name. Do not read
// VITE_APP_VERSION here: a stale hosting env var can make the sidebar show
// an old release even after package.json has been bumped.
const APP_VERSION = `${pkg.name}@${pkg.version}`

// Only attach the Sentry plugin when an auth token is present so local builds
// don't fail. CI / production builds set SENTRY_AUTH_TOKEN as a secret.
const sentryEnabled = !!process.env.SENTRY_AUTH_TOKEN

export default defineConfig(({ command }) => ({
  // Production console-stripping. Vite 8 uses Rolldown (not esbuild), so the
  // old `esbuild.drop` option is gone. Rolldown's native minify `dropConsole`
  // is all-or-nothing (no per-method control, no pure-funcs equivalent), and
  // Vite only exposes `build.minify` as a string/boolean — it can't pass a
  // granular compress object anyway. So we use the bundler-agnostic
  // @rollup/plugin-strip (it runs as a Rolldown plugin) which DOES support
  // per-function patterns. It is added ONLY on `vite build` (command ===
  // 'build') below, so `vite dev` stays fully verbose. We strip console.log /
  // info / debug + debugger, but KEEP console.error / console.warn for real
  // production diagnostics.
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate: new SW versions activate without a user prompt.
      // Combined with skipWaiting + clientsClaim below, deploying ships
      // the new bundle to all open tabs on next navigation. Previously
      // 'prompt' meant if a user ignored / never saw the toast, they
      // were stuck on a stale build forever — which was why "live
      // updates aren't working even after reload" persisted.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'Facilities OS',
        short_name: 'FacilOS',
        description: 'Facilities compliance and service management platform',
        theme_color: '#e8772e',
        background_color: '#0d0d15',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/dashboard',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-maskable-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        categories: ['business', 'productivity'],
      },
      workbox: {
        // skipWaiting: a new SW activates without waiting for old tabs
        // to close. clientsClaim: the new SW takes over open tabs on
        // first navigation. Together they make autoUpdate effective —
        // without these, a user with a stuck tab keeps the old SW alive.
        skipWaiting: true,
        clientsClaim: true,
        // cleanupOutdatedCaches: removes precache from prior SW versions
        // so storage doesn't grow unbounded across deploys.
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//],
        // Pull in the Web Push event handlers (push + notificationclick).
        // The file lives in /public so it ships at /push-sw.js — workbox
        // imports it into the generated SW via importScripts at runtime.
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          // API routes — always fresh, fall back to cache
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase Storage — large binaries, revalidate in background
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase REST/Auth — fresh first
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth|realtime)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts CSS — stale-while-revalidate
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Google Fonts files — cache first
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Static assets (images, svgs from same origin) — cache first
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && (request.destination === 'image' || request.destination === 'font'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    // Source-map upload to Sentry. Must be the LAST plugin so it sees the
    // final bundle. Skipped without an auth token.
    ...(sentryEnabled
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: APP_VERSION },
            // Don't fail the build on a transient upload hiccup.
            errorHandler: (err) => {
              console.warn('[sentry-vite-plugin]', err.message)
            },
          }),
        ]
      : []),
    // Production-only: strip console.log/info/debug + debugger statements.
    // Guarded by `command === 'build'` so the dev server keeps every log.
    // KEEPS console.error / console.warn (omitted from the functions list).
    ...(command === 'build'
      ? [
          strip({
            include: ['**/*.{js,jsx,ts,tsx}'],
            functions: ['console.log', 'console.info', 'console.debug'],
            debugger: true,
            sourceMap: true,
          }),
        ]
      : []),
  ],
  define: {
    // Build-time injection so the SDK can tag the release without an env read.
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    watch: {
      ignored: [
        '**/.claude/**',
        '**/mobile/**',
        '**/dist/**',
        '**/supabase/.branches/**',
      ],
    },
  },
  build: {
    // Required for Sentry to symbolicate stacks in the dashboard.
    sourcemap: true,
    // React 19 + React DOM is deliberately isolated into a long-lived vendor
    // chunk. The audited gzip size is acceptable; keep warnings focused on
    // accidental new regressions above this level.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // ── React Aria + Stately (used by HeroUI under the hood) ──
          // These were silently bundling into the `react` chunk via the
          // /react/ pattern, inflating it to 727 KB. Splitting them out
          // into their own chunk lets the browser parallel-download.
          // Sprint 1.5 / H4 — Rolldown (vite 8) silently merges a chunk
          // whose name is a prefix of another existing chunk. Naming this
          // 'react-aria' caused the entire bucket to disappear into the
          // 'react' chunk (688 KB). Renaming to 'aria-stately' makes it
          // a real chunk again.
          if (
            id.includes('react-aria-components') ||
            id.includes('react-aria') ||
            id.includes('react-stately') ||
            id.includes('@react-aria') ||
            id.includes('@react-stately') ||
            id.includes('@react-types')
          ) {
            return 'aria-stately'
          }

          // ── Leaflet (map view — lazy on the portfolio map only) ──
          if (id.includes('react-leaflet') || id.includes('leaflet')) {
            return 'leaflet'
          }

          // ── React Router separate from react-core ──
          if (id.includes('react-router')) return 'react-router'

          // ── React core (react, react-dom, scheduler, react-is) ──
          // Tightened the matcher: only bare `react/`, `react-dom/`,
          // `scheduler/`, `react-is/` rather than any path containing
          // /react/.
          if (id.match(/[\\/](react|react-dom|scheduler|react-is)[\\/]/)) {
            return 'react'
          }

          if (id.includes('@heroui')) return 'heroui'
          if (id.includes('recharts') || id.includes('d3-')) return 'recharts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack')) return 'tanstack'
          if (id.includes('framer-motion')) return 'framer'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) return 'forms'
          return 'vendor'
        },
      },
    },
  },
}))
