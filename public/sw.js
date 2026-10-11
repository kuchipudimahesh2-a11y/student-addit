const CACHE_NAME = 'adda-shell-v3';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/adda-192.png', '/icons/adda-512.png'];

function isUsableAsset(response) {
  return response.ok && !response.headers.get('content-type')?.toLowerCase().includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
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
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('adda-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() ?? '' }; }
    const title = typeof payload.title === 'string' && payload.title ? payload.title : 'A note from adda';
    const options = {
      body: typeof payload.body === 'string' ? payload.body : 'There is something new in your adda community.',
      icon: '/icons/adda-192.png',
      badge: '/icons/adda-192.png',
      tag: typeof payload.tag === 'string' ? payload.tag : 'adda-announcement',
      data: { url: '/' },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if ('navigate' in client) await client.navigate('/');
      if ('focus' in client) { await client.focus(); return; }
    }
    await self.clients.openWindow('/');
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
      try {
        const response = await fetch(request);
        if (isUsableAsset(response)) {
          try { await cache.put(request, response.clone()); } catch { /* The network response is still usable. */ }
          return response;
        }
        if (cached && isUsableAsset(cached)) return cached;
        return new Response('Adda could not load this app asset. Reload the page to try again.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      } catch {
        if (cached && isUsableAsset(cached)) return cached;
        return Response.error();
      }
    })());
  }
});
