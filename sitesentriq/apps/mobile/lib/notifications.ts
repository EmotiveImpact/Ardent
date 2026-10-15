import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Get an Expo push token for the current device, prompting for
 * permission if needed. Returns null when the user denies the prompt
 * — call sites should treat that as "user opted out" and not retry.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#14b89a',
    })
  }

  // getExpoPushTokenAsync REQUIRES an EAS projectId — called with no args it
  // resolves it from Constants and THROWS ERR_NOTIFICATIONS_NO_EXPERIENCE_ID
  // when none is configured (Expo Go / non-EAS builds). Resolve it explicitly
  // and degrade gracefully (return null = "unavailable") rather than throwing.
  // NOTE: enabling push delivery still requires `eas init` to populate
  // expo.extra.eas.projectId in app.json — see docs/internal/BLOCKERS.md.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig?.projectId as string | undefined)
  if (!projectId) {
    console.warn(
      '[notifications] no EAS projectId configured — skipping push token registration',
    )
    return null
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId })
  return token.data
}

/**
 * Sprint 2A — register the device's Expo push token with the backend
 * so the FM server can fan-out notifications to it.
 *
 * Idempotent. Safe to call on every app start once the user is
 * authenticated. Behaviour:
 *
 *   1. Get the device's current Expo token. Bail if the user denied
 *      permission (returns { ok: false, reason: 'permission' }).
 *   2. Upsert into `expo_push_tokens` keyed by token (UNIQUE column),
 *      so the same device re-registering just bumps last_used_at.
 *   3. RLS lets the user write rows where user_id = auth.uid().
 *
 * We never throw — call sites get a result discriminator and can log
 * accordingly. Push registration is a "best-effort" path; failure to
 * register must never break the app boot.
 */
export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'permission' | 'no-user' | 'db' | 'token' }

export async function registerExpoPushTokenWithBackend(args: {
  userId: string
  organisationId: string
}): Promise<RegisterResult> {
  if (!args.userId || !args.organisationId) {
    return { ok: false, reason: 'no-user' }
  }
  let token: string | null
  try {
    token = await registerForPushNotificationsAsync()
  } catch (err) {
    console.warn('[notifications] expo token fetch failed', err)
    return { ok: false, reason: 'token' }
  }
  if (!token) return { ok: false, reason: 'permission' }

  const row = {
    user_id: args.userId,
    organisation_id: args.organisationId,
    token,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? null,
    device_name: Constants.deviceName ?? null,
    last_used_at: new Date().toISOString(),
  }

  // upsert by token — UNIQUE constraint means the same device
  // re-registering just refreshes the row rather than duplicating.
  const { error } = await supabase
    .from('expo_push_tokens')
    .upsert(row, { onConflict: 'token' })

  if (error) {
    console.warn('[notifications] persist token failed', error.message)
    return { ok: false, reason: 'db' }
  }
  return { ok: true, token }
}

/**
 * Deep-link routing for a tapped push notification.
 *
 * The server (send-expo-push edge function) is expected to set the
 * notification `data` payload to one of:
 *   { jobId: '<uuid>' }   → routes to the job detail screen
 *   { url: '/some/path' } → routes to an arbitrary in-app path
 *
 * We never throw — a malformed payload just no-ops so a bad push can
 * never crash the app on tap.
 */
function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  try {
    const data = response.notification.request.content.data as
      | Record<string, unknown>
      | undefined
    if (!data) return

    // Senders populate data.url with WEB paths (/dashboard/jobs/<uuid>, etc.)
    // which have no mobile route — pushing them verbatim landed on "Unmatched
    // Route". Translate a job-shaped link to /job/<id>; for anything else fall
    // back to the in-app notifications inbox.
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    const url = typeof data.url === 'string' ? data.url : ''
    const explicitJobId =
      (typeof data.jobId === 'string' && data.jobId) ||
      (typeof data.job_id === 'string' && data.job_id) ||
      ''
    const urlJobId =
      url.startsWith('/job/') || url.startsWith('/dashboard/jobs/') ? url.match(UUID_RE)?.[0] ?? '' : ''
    const jobId = explicitJobId || urlJobId
    if (jobId) {
      router.push(`/job/${jobId}` as never)
      return
    }
    router.push('/notifications' as never)
  } catch (err) {
    console.warn('[notifications] failed to route notification tap', err)
  }
}

/**
 * Wire up the notification-tap deep-link listener. Call once at app
 * start (root layout). Returns a cleanup function to remove the
 * listener on unmount.
 *
 * Also handles the "cold start" case: if the app was launched by
 * tapping a notification while it was killed, getLastNotification
 * ResponseAsync replays that tap so we still route to the job.
 */
export function setupNotificationResponseListener(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse,
  )

  // Cold-start: app launched from a tapped notification.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handleNotificationResponse(response)
    })
    .catch((err) => {
      console.warn('[notifications] cold-start notification check failed', err)
    })

  return () => subscription.remove()
}
