/**
 * Supabase instrumentation. Two complementary layers:
 *
 *  1. `Sentry.supabaseIntegration({ supabaseClient })` — built-in v10 integration
 *     that auto-traces every `from(...)` query as a span and captures auth
 *     operation breadcrumbs. We register it lazily so dev builds without a
 *     Sentry DSN don't pull the integration code path.
 *
 *  2. A lightweight `from()` wrapper that:
 *       - logs slow queries (>1000ms) as Sentry breadcrumbs
 *       - forwards Supabase-shape errors to `logError` with the table name as
 *         context so they're searchable in Sentry's "tag" filter
 *
 * The wrapper preserves the SupabaseClient type so consumers don't need to
 * change any imports — `import { supabase } from '@/lib/supabase'` keeps
 * working unchanged.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Sentry, isObservabilityInitialised, logError } from '@/lib/observability'

const SLOW_QUERY_MS = 1000
const OPTIONAL_PENDING_MIGRATION_TABLES = new Set([
  'suppliers',
  'purchase_orders',
  'purchase_order_lines',
  'engineer_locations',
  'supplier_items',
  'quote_revisions',
  'contract_routine_templates',
])

function isRequestCancellation(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'string') {
    const value = error.toLowerCase()
    return (
      value.includes('aborterror') ||
      value.includes('timeouterror') ||
      value.includes('signal is aborted') ||
      value.includes('request was aborted')
    )
  }
  if (typeof error !== 'object') return false
  const fields = error as {
    name?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }
  const text = [
    fields.name,
    fields.message,
    fields.details,
    fields.hint,
    safeStringify(error),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return (
    text.includes('aborterror') ||
    text.includes('timeouterror') ||
    text.includes('signal is aborted') ||
    text.includes('request was aborted')
  )
}

function isExpectedPendingMigrationMiss(error: unknown, table: string): boolean {
  if (!OPTIONAL_PENDING_MIGRATION_TABLES.has(table)) return false
  if (!error || typeof error !== 'object') return false

  const fields = error as {
    code?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }
  const text = [fields.message, fields.details, fields.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  return fields.code === 'PGRST205' || text.includes('schema cache') || text.includes('does not exist')
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

export function instrumentSupabase<T extends SupabaseClient>(client: T): T {
  // Register the official integration if Sentry is up. Safe no-op otherwise.
  if (isObservabilityInitialised()) {
    try {
      Sentry.addIntegration(Sentry.supabaseIntegration({ supabaseClient: client }))
    } catch {
      // Older bundles or odd polyfills — fall through to the manual wrapper.
    }
  }

  // Manual `from()` wrap for slow-query + error breadcrumbs. We don't replace
  // the `from` method on the prototype (that would interact badly with the
  // Sentry integration above) — instead we use a Proxy that ONLY intercepts
  // the `from` getter and instruments the eventual thenable.
  const original = client.from.bind(client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client as any).from = (table: string) => {
    const builder = original(table)
    return wrapBuilder(builder, table)
  }

  return client
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapBuilder(builder: any, table: string) {
  // PostgrestQueryBuilder methods (select/insert/update/delete/upsert) return
  // a PostgrestFilterBuilder which is thenable. We need to wrap *that* — but
  // it chains, so wrap each method's result as well.
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'then') {
        // Direct await on the builder — wrap the thenable.
        return wrapThen(target, table)
      }
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = value.apply(target, args)
          if (result && typeof result === 'object' && 'then' in result) {
            return wrapBuilder(result, table)
          }
          return result
        }
      }
      return value
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapThen(target: any, table: string) {
  // Returns a new `then` that times the query.
  return (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => {
    const start = performance.now()
    return target.then.call(
      target,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (value: any) => {
        const dur = performance.now() - start
        if (dur > SLOW_QUERY_MS && isObservabilityInitialised()) {
          Sentry.addBreadcrumb({
            category: 'supabase.slow',
            level: 'warning',
            message: `Slow query on "${table}" — ${Math.round(dur)}ms`,
            data: { table, duration_ms: Math.round(dur) },
          })
        }
        if (value && typeof value === 'object' && value.error) {
          if (!isRequestCancellation(value.error) && !isExpectedPendingMigrationMiss(value.error, table)) {
            logError(value.error, {
              kind: 'supabase.error',
              table,
              duration_ms: Math.round(dur),
            })
          }
        }
        return onfulfilled ? onfulfilled(value) : value
      },
      (reason: unknown) => {
        const dur = performance.now() - start
        if (!isRequestCancellation(reason)) {
          logError(reason, {
            kind: 'supabase.reject',
            table,
            duration_ms: Math.round(dur),
          })
        }
        return onrejected ? onrejected(reason) : Promise.reject(reason)
      },
    )
  }
}
