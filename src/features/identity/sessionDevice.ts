const DEVICE_STORAGE_KEY = 'hobbeast-device-id-v1';

function userAgentFamily(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/chrome\//i.test(userAgent)) return 'Chrome';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return 'Browser';
}

function platformFamily(userAgent: string): string {
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad/i.test(userAgent)) return 'iOS';
  if (/macintosh|mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'device';
}

export function getSessionDeviceDescriptor(storage: Pick<Storage, 'getItem' | 'setItem'>, userAgent: string) {
  let deviceId = storage.getItem(DEVICE_STORAGE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    storage.setItem(DEVICE_STORAGE_KEY, deviceId);
  }
  const browser = userAgentFamily(userAgent);
  const platform = platformFamily(userAgent);
  return {
    fingerprint: `device:${deviceId}`,
    deviceLabel: `${browser} · ${platform}`,
    userAgentFamily: browser,
  };
}
