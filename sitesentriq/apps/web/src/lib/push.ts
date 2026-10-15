import { supabase } from '@/lib/supabase'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ??
  // Placeholder — replace via env var before going to production.
  ''

export interface PushPayload {
  title: string
  body?: string
  url?: string
  /** Arbitrary metadata that will be forwarded by the SW message handler. */
  data?: Record<string, unknown>
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function pushPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushPermission
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buf = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) buf[i] = rawData.charCodeAt(i)
  return buf
}

/**
 * Request browser notification permission. Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported'
  const result = await Notification.requestPermission()
  return result as PushPermission
}

/**
 * Subscribe the active service worker to web push and persist the subscription
 * in `notification_subscriptions`. Idempotent — re-subscribing for the same
 * endpoint will upsert rather than insert duplicates.
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  if (DEV_MODE) {
    console.info('[DEV_MODE] subscribeToPush(noop) for', userId)
    return null
  }

  const perm = await requestNotificationPermission()
  if (perm !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[push] VAPID_PUBLIC_KEY not configured — cannot create subscription')
      return null
    }
    const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    // Copy into a fresh ArrayBuffer to satisfy BufferSource typing
    // (Uint8Array<ArrayBufferLike> may be backed by SharedArrayBuffer).
    const buf = new ArrayBuffer(keyBytes.byteLength)
    new Uint8Array(buf).set(keyBytes)
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: buf,
    })
  }

  // Persist to DB. Table has a unique(endpoint) constraint.
  const json = sub.toJSON()
  const { error } = await supabase
    .from('notification_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: json.endpoint!,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) console.warn('[push] persist subscription failed', error)
  return sub
}

/**
 * Unsubscribe the active SW from push and remove the row from
 * `notification_subscriptions`.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  if (DEV_MODE) {
    console.info('[DEV_MODE] unsubscribeFromPush(noop)')
    return
  }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  const { error } = await supabase
    .from('notification_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
  if (error) console.warn('[push] delete subscription failed', error)
}

/**
 * Client-side stub that asks the `send-push` edge function to deliver a payload
 * to every active subscription for a given user. The edge function is responsible
 * for fanning out via `web-push`. This client only forwards the request.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  if (DEV_MODE) {
    console.info('[DEV_MODE] sendPush ->', userId, payload)
    return
  }
  const { error } = await supabase.functions.invoke('send-push', {
    body: { user_id: userId, payload },
  })
  if (error) {
    console.warn('[push] sendPush failed', error)
    throw error
  }
}
