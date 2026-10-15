/**
 * Feature flags — read at module init from Vite env vars.
 *
 * Flags gate UI for capabilities whose backend isn't shipped yet. Default
 * behaviour is "off" for things that would silently fail in production
 * (push notifications) and "on" for things that are safe to expose (presence).
 */
export const featureFlags = {
  /**
   * Push notifications. ON now that the `send-push` edge function ships
   * and the UI checks for `VITE_VAPID_PUBLIC_KEY` at subscribe time —
   * if the key isn't set the subscribe call no-ops with a clear toast,
   * and the edge function returns `{ unconfigured: true }`. Operators
   * can force-disable with VITE_FEATURE_PUSH=false (e.g. for tenants
   * who don't want browser notifications at all).
   */
  pushNotifications: import.meta.env.VITE_FEATURE_PUSH !== 'false',

  /**
   * Topbar presence count pill ("X online"). Defaults ON. Operators can kill
   * via VITE_FEATURE_PRESENCE=false if it's noisy in their tenant.
   */
  presencePill: import.meta.env.VITE_FEATURE_PRESENCE !== 'false',

  /**
   * Forward-looking £ figure on the revenue insight. OFF by default — the
   * underlying linear regression is a trend signal, not a forecast.
   * Enable with VITE_FEATURE_INSIGHTS_FORECAST=true.
   */
  insightsForecast: import.meta.env.VITE_FEATURE_INSIGHTS_FORECAST === 'true',
} as const
