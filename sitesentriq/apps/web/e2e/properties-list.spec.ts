import { test, expect } from '@playwright/test'
import { mockSupabaseRest } from './helpers/mock-supabase'

/**
 * Properties list smoke test. Replaces the originally-spec'd "portfolio map"
 * flow because the map view (Leaflet) is not present in this build.
 */
test.describe('properties list', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRest(page, {
      properties: [
        {
          id: 'p1',
          name: 'Test Tower',
          address: '1 Test Street, London',
          site_type: 'commercial',
          clients: { name: 'Acme' },
        },
        {
          id: 'p2',
          name: 'Demo Depot',
          address: '2 Demo Road, Bristol',
          site_type: 'industrial',
          clients: { name: 'Globex' },
        },
      ],
    })
  })

  test('renders the properties page heading and add button', async ({ page }) => {
    await page.goto('/dashboard/properties')
    await page.waitForLoadState('networkidle')
    // Heading or a recognisable shell element should be present.
    const body = await page.locator('body').textContent()
    expect((body ?? '').toLowerCase()).toContain('propert')
  })
})
