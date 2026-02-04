/**
 * LoteroTracker Service Worker
 * Permite funcionalidad offline y cacheo de recursos
 */

const CACHE_NAME = 'loterotracker-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    '/icon.svg',
    'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Space+Mono:wght@400;700&display=swap'
];

// Instalación - cachear recursos estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cacheando recursos estáticos');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activación - limpiar caches antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch - estrategia Network First para API, Cache First para estáticos
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Para las APIs de Google, siempre ir a la red
    if (url.hostname.includes('googleapis.com') || 
        url.hostname.includes('accounts.google.com')) {
        event.respondWith(fetch(request));
        return;
    }

    // Para recursos estáticos, cache first con fallback a red
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Actualizar cache en background
                    fetch(request)
                        .then((response) => {
                            if (response.ok) {
                                caches.open(CACHE_NAME)
                                    .then((cache) => cache.put(request, response));
                            }
                        })
                        .catch(() => {});
                    
                    return cachedResponse;
                }

                return fetch(request)
                    .then((response) => {
                        if (response.ok && request.method === 'GET') {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(request, responseClone));
                        }
                        return response;
                    });
            })
            .catch(() => {
                // Offline fallback para navegación
                if (request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            })
    );
});

// Background Sync - para sincronizar cuando vuelva la conexión
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-emails') {
        event.waitUntil(
            // Notificar a la app principal que sincronice
            self.clients.matchAll()
                .then((clients) => {
                    clients.forEach((client) => {
                        client.postMessage({ type: 'SYNC_REQUESTED' });
                    });
                })
        );
    }
});

// Push notifications (para futuras notificaciones de premios)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        
        event.waitUntil(
            self.registration.showNotification(data.title || '🎰 LoteroTracker', {
                body: data.body || '¡Tienes nuevos premios!',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [200, 100, 200],
                tag: 'loterotracker-notification',
                data: data
            })
        );
    }
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Si ya hay una ventana abierta, enfocarla
                for (const client of clientList) {
                    if (client.url.includes('loterotracker') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Si no, abrir una nueva
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});
