import { useEffect, useState } from 'react'
import { Chip, Button, Spinner } from '@haumea/ui'
import { Activity, Database, Radio, Cloud, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isObservabilityInitialised } from '@/lib/observability'
import { DeployStatusBanner } from '@/components/dev/deploy-status-banner'
import { APP_VERSION } from '@/lib/constants'
import { PageHeader } from '@haumea/ui'

type Status = 'ok' | 'fail' | 'unknown' | 'checking'

interface HealthRow {
  key: string
  label: string
  icon: typeof Database
  status: Status
  detail?: string
}

function statusChip(status: Status) {
  if (status === 'ok')
    return (
      <Chip size="sm" variant="soft" color="success">
        Healthy
      </Chip>
    )
  if (status === 'fail')
    return (
      <Chip size="sm" variant="soft" color="danger">
        Failing
      </Chip>
    )
  if (status === 'checking') return <Spinner size="sm" />
  return (
    <Chip size="sm" variant="soft" color="default">
      Unknown
    </Chip>
  )
}

export default function HealthPage() {
  const [rows, setRows] = useState<HealthRow[]>([
    { key: 'supabase', label: 'Supabase connection', icon: Database, status: 'checking' },
    { key: 'realtime', label: 'Realtime channel', icon: Radio, status: 'checking' },
    { key: 'sentry', label: 'Error tracking (Sentry)', icon: ShieldCheck, status: 'unknown' },
    { key: 'sw', label: 'Service worker', icon: Cloud, status: 'checking' },
  ])

  const version = APP_VERSION

  useEffect(() => {
    let cancelled = false

    // Supabase connection — `select 1` against a small RLS-safe table.
    ;(async () => {
      const start = performance.now()
      try {
        const { error } = await supabase.from('organisations').select('id').limit(1)
        const dur = Math.round(performance.now() - start)
        if (cancelled) return
        setRows((rows) =>
          rows.map((r) =>
            r.key === 'supabase'
              ? {
                  ...r,
                  status: error ? 'fail' : 'ok',
                  detail: error ? error.message : `Round-trip ${dur}ms`,
                }
              : r,
          ),
        )
      } catch (err) {
        if (cancelled) return
        setRows((rows) =>
          rows.map((r) =>
            r.key === 'supabase'
              ? {
                  ...r,
                  status: 'fail',
                  detail: err instanceof Error ? err.message : 'Unknown',
                }
              : r,
          ),
        )
      }
    })()

    // Realtime channel state — open a tiny channel, observe its state, close.
    const channel = supabase.channel('health-probe')
    channel.subscribe((status) => {
      if (cancelled) return
      const ok = status === 'SUBSCRIBED'
      setRows((rows) =>
        rows.map((r) =>
          r.key === 'realtime'
            ? {
                ...r,
                status: ok ? 'ok' : status === 'CLOSED' ? 'unknown' : 'fail',
                detail: status,
              }
            : r,
        ),
      )
      // Close shortly after we get a verdict.
      if (ok) {
        setTimeout(() => {
          supabase.removeChannel(channel)
        }, 300)
      }
    })

    // Sentry — synchronous flag.
    setRows((rows) =>
      rows.map((r) =>
        r.key === 'sentry'
          ? {
              ...r,
              status: isObservabilityInitialised() ? 'ok' : 'unknown',
              detail: isObservabilityInitialised()
                ? 'Initialised'
                : 'Disabled (no VITE_SENTRY_DSN)',
            }
          : r,
      ),
    )

    // Service worker — query the registration if PWA is up.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (cancelled) return
          setRows((rows) =>
            rows.map((r) =>
              r.key === 'sw'
                ? {
                    ...r,
                    status: reg?.active ? 'ok' : 'unknown',
                    detail: reg?.active
                      ? `Scope ${reg.scope}`
                      : 'Not registered yet',
                  }
                : r,
            ),
          )
        })
        .catch(() => {
          if (cancelled) return
          setRows((rows) =>
            rows.map((r) =>
              r.key === 'sw' ? { ...r, status: 'fail', detail: 'Lookup failed' } : r,
            ),
          )
        })
    } else {
      setRows((rows) =>
        rows.map((r) =>
          r.key === 'sw' ? { ...r, status: 'unknown', detail: 'Unsupported in browser' } : r,
        ),
      )
    }

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  const refresh = () => window.location.reload()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="System Health" />
          <p className="text-label text-text-secondary mt-1">
            Live diagnostics for the platform integrations.
          </p>
        </div>
        <Button size="sm" variant="outline" onPress={refresh}>
          <Activity size={14} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <DeployStatusBanner placement="health" />

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-6 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">Integrations</h2>
        </div>
        <div className="px-6 py-2">
          {rows.map((r) => {
            const Icon = r.icon
            return (
              <div
                key={r.key}
                className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-surface-page flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-text-muted" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-label font-medium text-text-primary">{r.label}</div>
                    {r.detail && (
                      <div className="text-caption text-text-muted truncate">{r.detail}</div>
                    )}
                  </div>
                </div>
                <div className="shrink-0">{statusChip(r.status)}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-6 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">Build</h2>
        </div>
        <div className="px-6 py-3">
          <div className="flex items-center justify-between py-1 text-label">
            <span className="text-text-secondary">Latest deployed version</span>
            <span className="font-mono text-text-primary">{version}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
