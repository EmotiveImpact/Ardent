import { test, expect } from '@playwright/test'
import { mockSupabaseRest } from './helpers/mock-supabase'

/**
 * Dashboard reachability under DEV_MODE.
 *
 * The build is produced with no `VITE_SUPABASE_URL`, so the auth context
 * seeds a deterministic dev user and `/dashboard` is reachable directly. We
 * also stub Supabase REST calls so the dashboard's TanStack Query fetches
 * resolve without a backend.
 */
test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRest(page, {
      organisations: [
        {
          id: 'dev-org-001',
          onboarding_state: { completed: true },
        },
      ],
    })
  })

  test('loads /dashboard without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/dashboard')

    // Heading is set via APP_NAME ("Haumea") — wait for the layout shell.
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.waitForLoadState('networkidle')

    // Filter out known noisy warnings (PWA service-worker registration in
    // headless previews, recharts ResizeObserver shim).
    const significant = errors.filter(
      e => !/ResizeObserver|service worker|registerSW/i.test(e),
    )
    expect(significant).toEqual([])
  })

  test('marketing landing page renders at /', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Marketing layout should produce visible content.
    const body = await page.locator('body').textContent()
    expect((body ?? '').length).toBeGreaterThan(20)
  })
})
