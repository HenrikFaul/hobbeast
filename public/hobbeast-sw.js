const FALLBACK_PATH = '/profile';

function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return FALLBACK_PATH;
  try {
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : FALLBACK_PATH;
  } catch {
    return FALLBACK_PATH;
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title.slice(0, 240) : 'Hobbeast';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 4000) : 'Új értesítésed érkezett.';
  const path = safePath(payload.deepLink ?? payload.deep_link);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: typeof payload.notificationId === 'string' ? payload.notificationId : undefined,
    data: { path },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data?.path), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); existing.navigate(target); return; }
    await self.clients.openWindow(target);
  })());
});
