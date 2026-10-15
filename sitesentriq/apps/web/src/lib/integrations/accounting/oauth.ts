// OAuth helpers for accounting integrations.
// These are CLIENT-side helpers: they only build redirect URLs.
// The token exchange + refresh runs server-side in Edge Functions.

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_SCOPES = 'openid profile email accounting.transactions accounting.contacts offline_access'

const QB_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const QB_SCOPES = 'com.intuit.quickbooks.accounting'

function getAppOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/**
 * Build the URL to start the Xero OAuth 2.0 authorisation flow.
 * The user is redirected here; Xero redirects back to {origin}/dashboard/integrations/xero
 * with a `code` query param. The Edge Function then exchanges the code.
 */
export function buildXeroAuthorizeUrl(opts: { state: string }): string | null {
  const clientId = import.meta.env.VITE_XERO_CLIENT_ID as string | undefined
  if (!clientId) return null
  const redirectUri = `${getAppOrigin()}/dashboard/integrations/xero`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: XERO_SCOPES,
    state: opts.state,
  })
  return `${XERO_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Build the URL to start the QuickBooks Online OAuth 2.0 authorisation flow.
 */
export function buildQuickBooksAuthorizeUrl(opts: { state: string }): string | null {
  const clientId = import.meta.env.VITE_QUICKBOOKS_CLIENT_ID as string | undefined
  if (!clientId) return null
  const redirectUri = `${getAppOrigin()}/dashboard/integrations/quickbooks`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: QB_SCOPES,
    state: opts.state,
  })
  return `${QB_AUTHORIZE_URL}?${params.toString()}`
}

export function generateOAuthState(): string {
  // Cryptographic random state — used to mitigate CSRF.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
