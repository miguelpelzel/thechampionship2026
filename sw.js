const CACHE_VERSION = 'championship-v73';

// Forzar activación inmediata sin esperar
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Notificar a todos los clientes que recarguen
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});

// Network first — nunca sirve desde caché si hay red
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .catch(() => caches.match(e.request))
  );
});
