const CACHE_VERSION = 'championship-v198';
const BUILD_TIME = '2026-08-19T18:00:00Z';

// Forzar activación inmediata sin esperar
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});

// Network only — nunca usa caché, siempre va a la red
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .catch(() => fetch(e.request))
  );
});
