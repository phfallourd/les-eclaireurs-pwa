// ═══════════════════════════════════════════════════════
//  Les Éclaireurs! — Service Worker
//  Stratégie : Cache First pour les assets, Network First pour les données
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'eclaireurs-v1';
const OFFLINE_URL = '/offline.html';

// Ressources à mettre en cache immédiatement à l'installation
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Google Fonts — mises en cache au premier chargement
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

// ── INSTALLATION ──────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache des assets principaux');
      // On cache ce qu'on peut, on ignore les erreurs réseau
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Impossible de cacher:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ───────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activation — nettoyage des anciens caches');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — Stratégie hybride ────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et les extensions de navigateur
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Stratégie pour les polices Google : Cache First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stratégie pour les assets locaux (HTML, CSS, JS, images) : Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pour tout le reste (API calls éventuels) : Network First
  event.respondWith(networkFirst(request));
});

// ── STRATÉGIES ───────────────────────────────────────────

// Cache First : cherche dans le cache, puis réseau si absent
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] Servi depuis le cache:', request.url);
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Réseau indisponible, page offline:', request.url);
    // Pour les navigations, servir la page offline
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    throw err;
  }
}

// Network First : réseau d'abord, cache en fallback
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    throw err;
  }
}

// ── PUSH NOTIFICATIONS (préparé pour plus tard) ──────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Les Éclaireurs!', {
      body: data.body || 'Nouvelle notification',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
