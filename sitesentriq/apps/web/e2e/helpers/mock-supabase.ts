import type { Page, Route } from '@playwright/test'

/**
 * Per-table fixture overrides. Keys are Supabase table names — values are
 * arrays of rows that the REST stub will return.
 */
export type SupabaseFixtures = Record<string, unknown[]>

/**
 * Install lightweight `page.route()` handlers that stub the Supabase REST API
 * for a Playwright spec. The mocks intentionally answer with empty arrays for
 * any table you don't override, so pages that fan out into many queries still
 * render without 404s.
 *
 * Usage:
 *   await mockSupabaseRest(page, { clients: [{ id: '1', name: 'Acme' }] })
 */
export async function mockSupabaseRest(
  page: Page,
  fixtures: SupabaseFixtures = {},
): Promise<void> {
  // Auth — anyone hitting the token endpoint gets a fake session.
  await page.route(/supabase\.co\/auth\/v1\/.*/, async (route: Route) => {
    const url = route.request().url()
    if (url.includes('/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-access-token',
          refresh_token: 'fake-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: 'test-user',
            email: 'test@example.com',
            user_metadata: { full_name: 'Test User' },
            app_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

  // REST — match `/rest/v1/<table>?...` and return either fixtures or [].
  await page.route(/supabase\.co\/rest\/v1\/.*/, async (route: Route) => {
    const url = new URL(route.request().url())
    const tableMatch = url.pathname.match(/\/rest\/v1\/([^/?]+)/)
    const table = tableMatch?.[1] ?? ''
    const rows = fixtures[table] ?? []

    // Single-row queries (PostgREST sets Accept: application/vnd.pgrst.object+json)
    const accept = route.request().headers()['accept'] ?? ''
    const wantsSingle = accept.includes('vnd.pgrst.object+json')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wantsSingle ? (rows[0] ?? null) : rows),
    })
  })
}
