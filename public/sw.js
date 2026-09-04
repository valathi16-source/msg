self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'New Message';
    const options = {
      body: data.body || 'You have received a new message.',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        chatId: data.chatId,
        senderId: data.senderId,
        url: '/',
      },
      vibrate: [100, 50, 100],
      tag: data.chatId || 'msg-notification',
      renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error handling push event:', err);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const chatUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(chatUrl);
      }
    })
  );
});
