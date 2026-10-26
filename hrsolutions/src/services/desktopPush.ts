import { api } from '@/services/apiClient';

const STORAGE_KEY = 'pixbe-push-enabled';
const LOGIN_ASK_KEY = 'pixbe-push-login-ask';

/** Mark the next workspace load after a fresh sign-in so we can ask once per login. */
export function markDesktopPushLoginAsk(): void {
  try {
    sessionStorage.setItem(LOGIN_ASK_KEY, '1');
  } catch {
    /* session storage can be blocked */
  }
}

export function desktopPushLoginAskPending(): boolean {
  try {
    return sessionStorage.getItem(LOGIN_ASK_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDesktopPushLoginAsk(): void {
  try {
    sessionStorage.removeItem(LOGIN_ASK_KEY);
  } catch {
    /* ignore */
  }
}

export function desktopPushGranted(): boolean {
  return pushPreferenceEnabled() && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function pushPreferenceEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setPushPreference(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode can block storage; the subscription is still the source of truth */
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function publishSubscription(registration: ServiceWorkerRegistration, publicKey: string) {
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('The browser did not return a complete push subscription.');
  }
  await api.push.saveSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

/** Re-register an existing grant after sign-in. Does nothing until the user opts in. */
export async function syncDesktopPush(): Promise<void> {
  if (!pushPreferenceEnabled()) return;
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const key = await api.push.vapidPublicKey();
    if (!key.data?.enabled || !key.data.publicKey) return;
    const registration = await registerWorker();
    await publishSubscription(registration, key.data.publicKey);
  } catch (err) {
    console.error('Desktop push sync failed', err);
  }
}

export async function enableDesktopPush(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'Desktop alerts are not available in this browser.' };
  }
  const key = await api.push.vapidPublicKey();
  if (!key.success || !key.data?.enabled || !key.data.publicKey) {
    return { ok: false, reason: 'Desktop alerts are unavailable until the server is configured.' };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    setPushPreference(false);
    return { ok: false, reason: 'Notification permission was blocked.' };
  }
  try {
    const registration = await registerWorker();
    try {
      await publishSubscription(registration, key.data.publicKey);
    } catch {
      const existing = await registration.pushManager.getSubscription();
      await existing?.unsubscribe();
      await publishSubscription(registration, key.data.publicKey);
    }
    setPushPreference(true);
    return { ok: true };
  } catch (err) {
    console.error('Desktop push subscribe failed', err);
    setPushPreference(false);
    return { ok: false, reason: 'Desktop alerts could not be turned on.' };
  }
}

export async function disableDesktopPush(): Promise<void> {
  setPushPreference(false);
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await api.push.deleteSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.error('Desktop push unsubscribe failed', err);
  }
}
