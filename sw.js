// The Championship 2026 — Service Worker
// -----------------------------------------------------------------------
// Su único trabajo es recibir notificaciones push y abrir la app al tocarlas.
//
// IMPORTANTE: no intercepta 'fetch' y no guarda nada en caché, a propósito.
// Así la app sigue cargando siempre la última versión desde la red, igual
// que antes, y no reaparece el problema de ver versiones viejas.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  // Limpiar cachés que hayan quedado de versiones anteriores
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => self.clients.claim())
  );
});

// Llega una notificación
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) {
    try { d = { body: event.data ? event.data.text() : '' }; } catch (e2) { d = {}; }
  }

  const title = d.title || '🎾 The Championship 2026';
  const opts = {
    body: d.body || 'Novedades del campeonato',
    icon: 'icon-192.png',
    badge: 'icon-72.png',
    tag: d.tag || 'championship',
    renotify: true,
    requireInteraction: false,
    data: { url: d.url || '/thechampionship2026/' },
  };

  // iOS exige mostrar siempre una notificación visible
  event.waitUntil(self.registration.showNotification(title, opts));
});

// Toque sobre la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/thechampionship2026/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      // Si la app ya está abierta, traerla al frente
      for (const c of lista) {
        if (c.url.indexOf('/thechampionship2026/') !== -1 && 'focus' in c) {
          if ('navigate' in c) { try { c.navigate(destino); } catch (e) {} }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});

// Safari puede rotar la suscripción: avisar a la app para que la vuelva a guardar
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      lista.forEach((c) => {
        try { c.postMessage({ tipo: 'resuscribir' }); } catch (e) {}
      });
    })
  );
});
