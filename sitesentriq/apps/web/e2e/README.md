# End-to-end tests

Playwright suite that runs against a local `vite preview` server. Configured
in [`../playwright.config.ts`](../playwright.config.ts).

## Run

```bash
# One-time browser install
npm run e2e:install

# Headless run
npm run e2e

# Interactive UI mode
npm run e2e:ui
```

The config boots `npm run preview` on port 4173 automatically. If that port
is in use, set `E2E_PORT=4174` in your shell.

## Mocking Supabase

These tests run **without a real Supabase backend**. We intercept REST and
auth calls via `page.route()` in the [`helpers/mock-supabase.ts`](helpers/mock-supabase.ts)
helper:

```ts
import { mockSupabaseRest } from './helpers/mock-supabase'

test.beforeEach(async ({ page }) => {
  await mockSupabaseRest(page, {
    clients: [{ id: '1', name: 'Acme' }],
    // Tables not listed return an empty array.
  })
})
```

The default helper:

- Returns the supplied rows for `GET /rest/v1/<table>?...`
- Returns `null`/the first row for queries asking for a single object
  (Accept header `application/vnd.pgrst.object+json`)
- Returns a fake session from `/auth/v1/token`

Add new fixtures by extending the `fixtures` argument — no other config is
required.

## Adding a test

Create a new `*.spec.ts` file in this directory. Spec files outside `e2e/`
are ignored by `playwright.config.ts`. Example skeleton:

```ts
import { test, expect } from '@playwright/test'
import { mockSupabaseRest } from './helpers/mock-supabase'

test.describe('my feature', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseRest(page)
  })

  test('does the thing', async ({ page }) => {
    await page.goto('/dashboard/my-feature')
    await expect(page.getByRole('heading', { name: /my feature/i })).toBeVisible()
  })
})
```

## CI notes

- Only Chromium is installed in CI to keep runs fast (~2 minutes vs ~6 min for
  all three browsers). Add `firefox` / `webkit` projects to
  `playwright.config.ts` when cross-browser coverage is needed.
- The Playwright browser cache is keyed by lockfile hash in
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- DEV_MODE: the build is produced without `VITE_SUPABASE_URL`, so the auth
  context seeds a deterministic dev user. Protected routes are reachable
  directly. If you point preview at a real Supabase URL, all of these tests
  will need real auth.
