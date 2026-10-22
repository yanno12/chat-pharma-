const OFFLINE_CACHE = 'pharmastock-offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);

      await cache.add(
        new Request(OFFLINE_PAGE, { cache: 'reload' })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(name =>
            name.startsWith('pharmastock-offline-') &&
            name !== OFFLINE_CACHE
          )
          .map(name => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept API calls, stock changes, or external requests.
  if (
    request.method !== 'GET' ||
    request.mode !== 'navigate' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Always request the actual page from the network.
        return await fetch(request);
      } catch {
        const cache = await caches.open(OFFLINE_CACHE);
        const offline = await cache.match(OFFLINE_PAGE);

        return offline || new Response(
          'PharmaStock: connect to the internet and try again.',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
            },
          }
        );
      }
    })()
  );
});
