/* Salon Notebook — service worker (N0 PWA shell).
 *
 * App-shell cache so the UI loads instantly and survives brief WiFi drops on
 * the shop floor. API calls are ALWAYS network-first (never serve stale
 * bookings). Navigation (HTML) is ALSO network-first so a new build shows up
 * immediately; only hashed static assets are cache-first (they're immutable).
 */
// Bump this on every release so old shells AND stale hashed bundles are purged.
const CACHE = 'nsn-shell-v18';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API or voice endpoints — booking data must be live.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) {
    return; // default: go to network
  }

  // Navigation / HTML documents: network-first so new releases load right away;
  // fall back to the cached shell only when offline.
  const isNav = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    event.respondWith(
      fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put('/index.html', copy));
        return resp;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed static assets: cache-first, fall back to network and warm the cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
