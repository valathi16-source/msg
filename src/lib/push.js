function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushNotifications(userId, serverUrl = '') {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported in this environment.');
    return { success: false, reason: 'unsupported' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied.');
      return { success: false, reason: 'permission_denied' };
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Fetch VAPID Public Key from server
    const res = await fetch(`${serverUrl}/api/push/vapid-key`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    const { publicKey } = await res.json();

    if (!publicKey) {
      throw new Error('VAPID public key not available from server');
    }

    const convertedKey = urlBase64ToUint8Array(publicKey);

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
    }

    // Send subscription to server
    await fetch(`${serverUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        userId,
        subscription,
        userAgent: navigator.userAgent,
      }),
    });

    return { success: true, subscription };
  } catch (err) {
    console.error('Failed to subscribe to Web Push:', err);
    return { success: false, error: err.message };
  }
}

export async function sendTestPushNotification(userId, serverUrl = '') {
  try {
    const res = await fetch(`${serverUrl}/api/push/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch (err) {
    console.error('Test push error:', err);
    return { success: false, error: err.message };
  }
}
