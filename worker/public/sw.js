/**
 * Shopping List service worker.
 *
 * Goal: the app opens and shows your last-seen list inside a supermarket with
 * no signal. Writes are NOT handled here — index.html keeps its own outbox and
 * replays failed mutations when connectivity returns.
 *
 * Strategy:
 *   navigation + HTML  -> network-first (keeps the auto-update check working),
 *                         cache fallback when offline
 *   GET /api/*         -> network-first, successful responses cached so the
 *                         list is readable offline
 *   icons / manifest   -> cache-first
 *   everything else    -> network, cache fallback
 *
 * Bump VERSION whenever the shell changes so old caches are dropped.
 */
var VERSION = '3.0.0';
var SHELL_CACHE = 'shopping-list-shell-' + VERSION;
var DATA_CACHE = 'shopping-list-data-' + VERSION;

var SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      // addAll rejects the whole install if any single asset 404s, so add
      // them individually and tolerate misses.
      return Promise.all(SHELL_ASSETS.map(function(url) {
        return cache.add(url).catch(function() {});
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(name) {
        if (name !== SHELL_CACHE && name !== DATA_CACHE) return caches.delete(name);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

function networkFirst(request, cacheName) {
  return fetch(request).then(function(response) {
    if (response && response.status === 200) {
      var copy = response.clone();
      caches.open(cacheName).then(function(cache) { cache.put(request, copy); });
    }
    return response;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      throw new Error('offline and not cached');
    });
  });
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (response && response.status === 200) {
        var copy = response.clone();
        caches.open(cacheName).then(function(cache) { cache.put(request, copy); });
      }
      return response;
    });
  });
}

self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return; // mutations go straight to the network

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The version check deliberately busts cache with ?_v=; let it hit the network.
  if (url.searchParams.has('_v') || url.searchParams.has('_')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.indexOf('/api/') === 0) {
    // Health checks are pointless to cache.
    if (url.pathname === '/api/health') return;
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE));
});
