// Pure-logic unit tests for the mobile workspace. We deliberately scope
// vitest to lib/__tests__ — anything under app/ or components/ pulls in
// React Native's renderer, which vitest's default Node environment can't
// load. Hooks/components should be exercised through Detox / Maestro
// later; here we just want fast feedback on the offline-queue, formatters,
// and other plain TS modules.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
  },
})
