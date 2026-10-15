import { test, expect } from '@playwright/test'
import { mockSupabaseRest } from './helpers/mock-supabase'

test.describe('command palette', () => {
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

  test('topbar trigger opens the palette and Escape closes it', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /open command palette/i }).click()

    const search = page.getByPlaceholder(/search clients/i)
    await expect(search).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
    await expect(search).not.toBeVisible()
  })

})
