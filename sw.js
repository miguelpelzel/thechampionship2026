// Desregistrar este service worker y limpiar todo cache
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({type:'window'}))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
});
self.addEventListener('fetch', e => {
  // No interceptar nada - dejar pasar al navegador directamente
});
