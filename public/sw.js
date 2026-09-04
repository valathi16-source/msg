const CACHE_NAME = 'chatflow-pwa-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Cache addAll error:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    let data;
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'ChatFlow Notification', body: event.data.text() };
    }

    const title = data.title || 'ChatFlow Message';
    const options = {
      body: data.body || 'You have a new message.',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        chatId: data.chatId,
        senderId: data.senderId,
        url: '/',
      },
      vibrate: [200, 100, 200],
      tag: data.chatId || 'chatflow-msg-' + Date.now(),
      renotify: true,
      requireInteraction: false,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error handling push event in ServiceWorker:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
