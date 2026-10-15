import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4173)
const HOST = process.env.E2E_HOST ?? 'localhost'

/**
 * Playwright configuration for Haumea / Facilities OS e2e tests.
 *
 * - Boots `vite preview` on port 4173 by default.
 * - Mocks Supabase REST endpoints inside each spec via `page.route()` so the
 *   suite runs offline. See `e2e/README.md` for the mocking conventions.
 * - Only chromium is wired up — keeps CI fast. Add firefox/webkit projects
 *   here when cross-browser coverage is needed.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      `VITE_SUPABASE_URL=https://placeholder.supabase.co ` +
      `VITE_SUPABASE_ANON_KEY=placeholder ` +
      `npm run build && npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
