import { describe, expect, it, vi } from 'vitest';
import { getSessionDeviceDescriptor } from '../sessionDevice';

describe('session device descriptor', () => {
  it('persists a random opaque device id without using a token or email', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    const first = getSessionDeviceDescriptor(storage, 'Mozilla/5.0 Windows Chrome/120');
    const second = getSessionDeviceDescriptor(storage, 'Mozilla/5.0 Windows Chrome/120');
    expect(first).toEqual(second);
    expect(first.fingerprint).toBe('device:11111111-1111-4111-8111-111111111111');
    expect(first.deviceLabel).toBe('Chrome · Windows');
  });

  it('maps mobile Safari to a coarse, non-identifying label', () => {
    const storage = { getItem: () => 'device-id', setItem: vi.fn() };
    expect(getSessionDeviceDescriptor(storage, 'Mozilla/5.0 iPhone Safari/17').deviceLabel)
      .toBe('Safari · iOS');
  });
});
