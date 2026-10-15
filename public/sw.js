const CACHE_NAME = 'adda-shell-v6';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/adda-192.png', '/icons/adda-512.png'];

function isUsableAsset(response) {
  return response.ok && !response.headers.get('content-type')?.toLowerCase().includes('text/html');
}

function isEphemeralHost() {
  return /^[a-f0-9]{8}\.student-addit\.pages\.dev$/i.test(self.location.hostname);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (isEphemeralHost()) {
      await self.skipWaiting();
      return;
    }
    const cache = await caches.open(CACHE_NAME);
    const page = await fetch('/', { cache: 'no-store' });
    await cache.put('/', page.clone());
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
    await Promise.allSettled([...APP_SHELL.slice(1), ...assets].map(async (path) => {
      const response = await fetch(path, { cache: 'no-store' });
      if (isUsableAsset(response)) await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (isEphemeralHost()) {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch {}
      await self.registration.unregister();
      return;
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('adda-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    if (isEphemeralHost()) {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch {}
      await self.registration.unregister();
      return; // Suppress notification on ephemeral preview origin
    }
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() ?? '' }; }

    // Dismiss ringing notification if call was cancelled or missed by caller
    if (payload.type === 'dismiss_call') {
      const callTag = payload.tag || (payload.callId ? 'incoming-call-' + payload.callId : '');
      if (callTag) {
        const notifications = await self.registration.getNotifications({ tag: callTag });
        notifications.forEach((n) => n.close());
      }
      return;
    }

    const isCall = payload.type === 'incoming_call';
    const title = typeof payload.title === 'string' && payload.title ? payload.title : (isCall ? 'Incoming Voice Call' : 'A note from adda');
    const options = {
      body: typeof payload.body === 'string' ? payload.body : (isCall ? 'Tap to answer on adda' : 'There is something new in your adda community.'),
      icon: '/icons/adda-192.png',
      badge: '/icons/adda-192.png',
      tag: typeof payload.tag === 'string' ? payload.tag : (isCall && payload.callId ? 'incoming-call-' + payload.callId : 'adda-announcement'),
      requireInteraction: isCall ? true : false,
      renotify: isCall ? true : false,
      vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [200, 100, 200],
      actions: isCall ? [
        { action: 'accept', title: '📞 Accept' },
        { action: 'decline', title: '✕ Decline' },
      ] : [],
      data: payload.data || (isCall ? { type: 'incoming_call', callId: payload.callId, url: '/?call=' + payload.callId } : { url: '/' }),
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();
  const data = notification.data || {};
  const isCall = data.type === 'incoming_call';
  const targetPath = data.url || '/';

  event.waitUntil((async () => {
    if (isCall && event.action === 'decline' && data.callId) {
      // User tapped Decline directly on the notification - notify server in background
      try {
        await fetch('/api/calls/' + encodeURIComponent(data.callId) + '/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'decline' }),
        });
      } catch { /* offline or call ended */ }
      return;
    }

    // Determine target URL, including autoAccept flag if Accept button was pressed
    let destUrl = targetPath;
    if (isCall && event.action === 'accept') {
      destUrl += (destUrl.includes('?') ? '&' : '?') + 'autoAccept=1';
    }
    const baseOrigin = isEphemeralHost() ? 'https://development.student-addit.pages.dev' : self.location.origin;
    const fullUrl = new URL(destUrl, baseOrigin).href;

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if ('navigate' in client) await client.navigate(fullUrl);
      if ('focus' in client) { await client.focus(); return; }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(fullUrl);
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          try { await cache.put('/', response.clone()); } catch { /* Keep serving the fresh page if offline storage is full. */ }
        }
        return response;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached && isUsableAsset(cached)) return cached;
      try {
        const response = await fetch(request);
        if (isUsableAsset(response)) {
          try { await cache.put(request, response.clone()); } catch { /* The network response is still usable. */ }
          return response;
        }
        return new Response('Adda could not load this app asset. Reload the page to try again.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      } catch {
        return Response.error();
      }
    })());
  }
});
