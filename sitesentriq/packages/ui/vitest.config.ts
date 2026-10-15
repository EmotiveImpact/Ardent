import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Mirrors apps/web's vitest setup so primitives in this package can ship
// with their own tests without depending on the web app's test harness.
// jsdom is required because our primitives mount real DOM (HeroUI deep
// down calls matchMedia / ResizeObserver — see setup.ts shims).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
  },
})
