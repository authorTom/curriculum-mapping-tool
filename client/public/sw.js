// Minimal service worker: makes the app installable and gives a basic offline
// shell. API requests always go to the network; visited pages/assets are cached
// and served if the network is unavailable.
const CACHE = 'cmt-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only handle same-origin GETs; never cache the API.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  event.respondWith(
    fetch(request)
      .then((resp) => {
        // Only keep successful responses - caching a 404 or a 500 would serve
        // that error back for as long as the app stays offline.
        if (resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(async () => {
        // respondWith rejects the navigation if it resolves to undefined, so
        // there is always a real Response at the end of this chain.
        const cached = (await caches.match(request)) || (await caches.match('/'));
        return cached || new Response(
          '<h1>Offline</h1><p>This page has not been opened before, so it is not available offline.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
  );
});
