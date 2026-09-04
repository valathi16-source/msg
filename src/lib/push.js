const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

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

export async function registerPushNotifications(userId, serverUrl = API_BASE) {
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
    const targetUrl = serverUrl ? `${serverUrl}/api/push/vapid-key` : '/api/push/vapid-key';
    const res = await fetch(targetUrl, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Server non-JSON response:', text);
      throw new Error(`Server returned HTML error (${res.status}). Set NEXT_PUBLIC_API_URL on Vercel to your Render backend URL.`);
    }

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
    const subTargetUrl = serverUrl ? `${serverUrl}/api/push/subscribe` : '/api/push/subscribe';
    await fetch(subTargetUrl, {
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

export async function sendTestPushNotification(userId, serverUrl = API_BASE) {
  try {
    const targetUrl = serverUrl ? `${serverUrl}/api/push/test` : '/api/push/test';
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ userId }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Test push non-JSON response:', text);
      return {
        success: false,
        error: `Backend unreachable (${res.status}). Please set NEXT_PUBLIC_API_URL environment variable in Vercel settings to point to your Render backend URL.`,
      };
    }

    return await res.json();
  } catch (err) {
    console.error('Test push error:', err);
    return { success: false, error: err.message };
  }
}
