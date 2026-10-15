// Web Push service-worker handlers — appended to the workbox-generated
// SW via the `importScripts` workbox option in vite.config.ts.
//
// Receives push messages from the `send-push` edge function. The payload
// shape (set by the edge function) is:
//   { title, body, url, icon, data }
//
// On click, focuses an existing window matching the deep link or opens
// a new one.

self.addEventListener('push', function (event) {
  // No-data pushes are valid (some servers strip payloads) — render a
  // generic notification rather than ignoring.
  let payload = { title: 'New notification', body: '', url: '/', icon: '/icons/icon-192.svg', data: {} }
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json())
    } catch (_e) {
      // Fall back to plain text if the body wasn't JSON.
      try { payload.body = event.data.text() } catch (_) { /* ignore */ }
    }
  }

  const title = payload.title || 'Facilities OS'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url: payload.url || '/', ...(payload.data || {}) },
    tag: payload.data && payload.data.tag,
    renotify: !!(payload.data && payload.data.tag),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Focus an existing tab on the same origin if one exists.
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url)
          if (clientUrl.origin === self.location.origin && 'focus' in client) {
            // Navigate the focused tab to the target if it isn't already there.
            if (clientUrl.pathname + clientUrl.search !== targetUrl) {
              if ('navigate' in client) {
                return client.navigate(targetUrl).then(function (c) { return c && c.focus() })
              }
            }
            return client.focus()
          }
        } catch (_) { /* ignore malformed URLs */ }
      }
      // No matching tab — open a new one.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return null
    }),
  )
})
