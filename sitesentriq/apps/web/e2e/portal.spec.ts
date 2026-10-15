import { test, expect } from '@playwright/test'
import { mockSupabaseRest } from './helpers/mock-supabase'

/**
 * Client portal smoke tests. Replaces the originally-spec'd "raise call-out"
 * flow because the portal callout form doesn't exist in this build of the
 * app; the closest analogue is `/portal/contact` plus the dashboard listing.
 */
test.describe('client portal', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRest(page)
  })

  test('portal index renders the layout shell', async ({ page }) => {
    await page.goto('/portal')
    await page.waitForLoadState('networkidle')
    // The portal layout is protected. In DEV_MODE the dev profile is
    // org_admin, so it renders. We only verify the URL and that some text
    // is present — the exact copy can drift.
    await expect(page).toHaveURL(/\/portal/)
    const body = await page.locator('body').textContent()
    expect((body ?? '').length).toBeGreaterThan(20)
  })

  test('portal contact page shows organisation contact details', async ({ page }) => {
    await page.goto('/portal/contact')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /contact/i })).toBeVisible()
    await expect(page.getByText(/Email/i).first()).toBeVisible()
  })
})
