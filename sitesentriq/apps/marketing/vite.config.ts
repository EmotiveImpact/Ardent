import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Marketing site is intentionally trimmed compared to apps/web —
// no PWA, no Sentry, no chunk splits. It's a static-ish site that
// should ship as small as possible.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175, // distinct from apps/web (5174) so both can run side-by-side
    open: false,
  },
})
