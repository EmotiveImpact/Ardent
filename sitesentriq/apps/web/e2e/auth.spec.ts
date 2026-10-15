import { test, expect } from '@playwright/test'

test.describe('public auth routes', () => {
  test('redirects /login for the signed-in dev user', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/(dashboard|onboarding)$/)
    await expect(page.getByText(/Haumea|workspace|Good/i).first()).toBeVisible()
  })

  test('redirects /register for the signed-in dev user', async ({ page }) => {
    await page.goto('/register')
    await expect(page).toHaveURL(/\/(dashboard|onboarding)$/)
  })
})
