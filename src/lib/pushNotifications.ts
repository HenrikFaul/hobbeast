import { supabase } from '@/integrations/supabase/client';

export type PushCapability = 'unsupported' | 'denied' | 'available' | 'subscribed';

function decodeBase64Url(value: string) {
  const padded = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - value.length % 4) % 4)}`;
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export async function getPushCapability(): Promise<PushCapability> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration('/');
  return await registration?.pushManager.getSubscription() ? 'subscribed' : 'available';
}

export async function enablePushNotifications() {
  const publicKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim();
  if (!publicKey) throw new Error('PUSH_PUBLIC_KEY_NOT_CONFIGURED');
  if (await getPushCapability() === 'unsupported') throw new Error('PUSH_UNSUPPORTED');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('PUSH_PERMISSION_DENIED');
  const registration = await navigator.serviceWorker.register('/hobbeast-sw.js', { scope: '/' });
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(publicKey),
  });
  const serialized = subscription.toJSON();
  const { data, error } = await supabase.functions.invoke('notification-preferences', {
    body: {
      action: 'register_push',
      subscription: serialized,
      user_agent_family: navigator.userAgent.slice(0, 120),
    },
  });
  if (error || data?.ok !== true) {
    await subscription.unsubscribe().catch(() => false);
    throw new Error('PUSH_REGISTRATION_FAILED');
  }
  return { activeCount: Number(data.active_count) || 1 };
}

export async function disablePushNotifications() {
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
  const subscription = await registration?.pushManager.getSubscription();
  const { data, error } = await supabase.functions.invoke('notification-preferences', {
    body: { action: 'revoke_push' },
  });
  if (error || data?.ok !== true) throw new Error('PUSH_REVOCATION_FAILED');
  await subscription?.unsubscribe().catch(() => false);
}
