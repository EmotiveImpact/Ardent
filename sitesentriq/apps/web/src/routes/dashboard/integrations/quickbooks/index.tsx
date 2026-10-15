// QuickBooks Online integration settings page.
// Routes:
//   /dashboard/integrations/quickbooks
//   /dashboard/integrations/quickbooks?code=...&realmId=...&state=... (OAuth callback)

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { Button, Switch, Chip } from '@haumea/ui'
import { Plug, Plug2, Activity, RefreshCw, Settings as SettingsIcon, AlertTriangle } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SkeletonBox } from '@/components/shared/skeletons'
import {
  useQuickBooksConnection,
  useExchangeQuickBooksCode,
  useDisconnectQuickBooks,
  useUpdateQuickBooksSettings,
  useAccountingSyncLog,
} from '@/lib/integrations/accounting/hooks'
import { buildQuickBooksAuthorizeUrl, generateOAuthState } from '@/lib/integrations/accounting/oauth'
import { formatDate } from '@haumea/utils'
import { PageHeader, Heading, Text } from '@haumea/ui'

const QB_STATE_KEY = 'quickbooks_oauth_state'

export default function QuickBooksIntegrationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: connection, isLoading } = useQuickBooksConnection()
  const { data: syncLog } = useAccountingSyncLog('quickbooks', 20)
  const exchange = useExchangeQuickBooksCode()
  const disconnect = useDisconnectQuickBooks()
  const updateSettings = useUpdateQuickBooksSettings()

  const clientIdConfigured = useMemo(() => Boolean(import.meta.env.VITE_QUICKBOOKS_CLIENT_ID), [])

  const [autoPush, setAutoPush] = useState(false)
  const [taxCodeRef, setTaxCodeRef] = useState('')
  const [accountRef, setAccountRef] = useState('')

  useEffect(() => {
    if (connection) {
      setAutoPush(Boolean(connection.auto_push_on_sent))
      setTaxCodeRef(connection.default_tax_code_ref ?? '')
      setAccountRef(connection.default_income_account_ref ?? '')
    }
  }, [connection])

  // OAuth callback
  useEffect(() => {
    const code = searchParams.get('code')
    const realmId = searchParams.get('realmId')
    const state = searchParams.get('state')
    if (!code || !realmId) return
    const expected = sessionStorage.getItem(QB_STATE_KEY)
    if (state && expected && state !== expected) {
      navigate('/dashboard/integrations/quickbooks', { replace: true })
      return
    }
    const redirectUri = `${window.location.origin}/dashboard/integrations/quickbooks`
    exchange.mutate(
      { code, redirectUri, realmId },
      {
        onSettled: () => {
          sessionStorage.removeItem(QB_STATE_KEY)
          navigate('/dashboard/integrations/quickbooks', { replace: true })
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleConnect = () => {
    const state = generateOAuthState()
    sessionStorage.setItem(QB_STATE_KEY, state)
    const url = buildQuickBooksAuthorizeUrl({ state })
    if (!url) return
    window.location.href = url
  }

  const handleSaveSettings = () => {
    updateSettings.mutate({
      auto_push_on_sent: autoPush,
      default_tax_code_ref: taxCodeRef || null,
      default_income_account_ref: accountRef || null,
    })
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Integrations', path: '/dashboard/integrations' },
          { label: 'QuickBooks' },
        ]}
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <Plug size={20} className="text-brand-500" />
        </div>
        <div>
          <PageHeader title="QuickBooks Online" />
          <p className="text-label text-text-muted">Push invoices to QuickBooks Online (US).</p>
        </div>
      </div>

      {!clientIdConfigured && (
        <div className="bg-surface-card border border-status-due-soon/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-status-due-soon shrink-0 mt-0.5" />
          <div>
            <p className="text-label font-medium text-text-primary">
              QuickBooks is not yet configured
            </p>
            <p className="text-caption text-text-muted mt-1">
              Set <code className="px-1 py-0.5 rounded bg-surface-page text-micro">VITE_QUICKBOOKS_CLIENT_ID</code>{' '}
              in your environment, plus <code className="px-1 py-0.5 rounded bg-surface-page text-micro">QUICKBOOKS_CLIENT_ID</code>{' '}
              and <code className="px-1 py-0.5 rounded bg-surface-page text-micro">QUICKBOOKS_CLIENT_SECRET</code>{' '}
              as Edge Function secrets, to enable connections.
            </p>
          </div>
        </div>
      )}

      {/* Connection card */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Plug2 size={16} className="text-text-muted" />
          <Heading level={2} scale="body">Connection Status</Heading>
        </div>
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">
              <SkeletonBox className="h-5 w-40" />
              <SkeletonBox className="h-4 w-64" />
              <SkeletonBox className="h-4 w-52" />
            </div>
          ) : connection ? (
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Chip variant="soft" color="success" size="sm">Connected</Chip>
                  {connection.quickbooks_company_name && (
                    <span className="text-label font-medium text-text-primary">
                      {connection.quickbooks_company_name}
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-caption">
                  <div>
                    <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">Realm ID</dt>
                    <dd className="text-text-secondary font-mono break-all">{connection.quickbooks_realm_id}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">Connected at</dt>
                    <dd className="text-text-secondary">{formatDate(connection.connected_at)}</dd>
                  </div>
                  {connection.connected_by_user_id && (
                    <div>
                      <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">Connected by</dt>
                      <dd className="text-text-secondary font-mono">{connection.connected_by_user_id.slice(0, 8)}…</dd>
                    </div>
                  )}
                  {connection.last_synced_at && (
                    <div>
                      <dt className="text-text-muted uppercase tracking-[0.04em] text-micro">Last sync</dt>
                      <dd className="text-text-secondary">{formatDate(connection.last_synced_at)}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <Button
                variant="danger"
                size="sm"
                isDisabled={disconnect.isPending}
                onPress={() => disconnect.mutate()}
              >
                {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <Chip variant="soft" color="default" size="sm">Disconnected</Chip>
                <p className="text-label text-text-muted mt-2">
                  Connect QuickBooks Online to sync invoices automatically.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                isDisabled={!clientIdConfigured || exchange.isPending}
                onPress={handleConnect}
              >
                {exchange.isPending ? 'Connecting…' : 'Connect QuickBooks'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Sync settings card */}
      {connection && (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
            <SettingsIcon size={16} className="text-text-muted" />
            <Heading level={2} scale="body">Sync Settings</Heading>
          </div>
          <div className="px-6 py-5 space-y-5 max-w-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-label font-medium text-text-primary">Auto-push on send</p>
                <Text scale="caption" tone="muted" className="mt-0.5">
                  When an invoice moves from draft to sent, push it to QuickBooks automatically.
                </Text>
              </div>
              <Switch isSelected={autoPush} onChange={() => setAutoPush((v) => !v)} />
            </div>

            <div>
              <label className="text-label font-medium text-text-secondary block mb-1.5">
                Default Tax Code Ref
              </label>
              <input
                type="text"
                value={taxCodeRef}
                onChange={(e) => setTaxCodeRef(e.target.value)}
                placeholder="TAX"
                className="w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
              />
              <Text scale="micro" tone="muted" className="mt-1">
                QuickBooks TaxCodeRef (e.g. TAX / NON). Find this in QuickBooks &gt; Taxes.
              </Text>
            </div>

            <div>
              <label className="text-label font-medium text-text-secondary block mb-1.5">
                Default Income Account Ref
              </label>
              <input
                type="text"
                value={accountRef}
                onChange={(e) => setAccountRef(e.target.value)}
                placeholder="1"
                className="w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
              />
              <Text scale="micro" tone="muted" className="mt-1">
                QuickBooks Account Ref ID (numeric) for the income account that receives invoice revenue.
              </Text>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" size="sm" isDisabled={updateSettings.isPending} onPress={handleSaveSettings}>
                {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Activity size={16} className="text-text-muted" />
          <Heading level={2} scale="body">Recent Sync Activity</Heading>
        </div>
        <div className="px-6 py-5">
          {!syncLog || syncLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <RefreshCw size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
              <p className="text-label text-text-muted">No sync activity yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {syncLog.map((row) => (
                <li key={row.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Chip
                      variant="soft"
                      color={row.status === 'success' ? 'success' : 'danger'}
                      size="sm"
                    >
                      {row.status}
                    </Chip>
                    <div className="min-w-0">
                      <p className="text-label font-medium text-text-primary truncate">{row.action}</p>
                      {row.error && (
                        <p className="text-caption text-status-overdue truncate">{row.error}</p>
                      )}
                    </div>
                  </div>
                  <Text scale="caption" as="span" tone="muted" className="shrink-0">{formatDate(row.created_at)}</Text>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
