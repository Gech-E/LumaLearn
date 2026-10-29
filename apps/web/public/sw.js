/* Only the static offline reader is cached. Private responses never enter CacheStorage. */
const SHELL = 'pathway-public-shell-v2';
const ASSETS = [
  '/offline.html',
  '/offline/offline.css',
  '/offline/offline.js',
  '/offline/store.js',
  '/offline/messages.js',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('pathway-public-shell-') && key !== SHELL)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
        return fetch(event.request);
      }),
    );
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await (await caches.open(SHELL)).match('/offline.html');
        return (
          cached ||
          new Response('Reconnect to open Pathway.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        );
      }),
    );
  }
});
