import { describe, it, expect, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { isNativeRuntime } from '../isNativeRuntime';

/**
 * The whole point of `isNativeRuntime` is that it must never disagree with
 * `Capacitor.isNativePlatform()`. If it did, the native app would mount its
 * bootstrap on the web (harmless) or — far worse — fail to mount it on a
 * device, leaving the splash screen up forever with no error anywhere.
 *
 * So these tests do not check the implementation against a remembered spec:
 * they run BOTH against the real `@capacitor/core` under the globals a native
 * WebView injects, and assert the answers match.
 */
const BRIDGE_KEYS = ['androidBridge', 'webkit'] as const;

function clearBridges() {
  for (const key of BRIDGE_KEYS) {
    delete (globalThis as Record<string, unknown>)[key];
  }
}

afterEach(clearBridges);

describe('isNativeRuntime agrees with @capacitor/core', () => {
  it('web: no bridge globals', () => {
    clearBridges();
    expect(isNativeRuntime()).toBe(false);
    expect(Capacitor.isNativePlatform()).toBe(false);
  });

  it('android: window.androidBridge is present', () => {
    clearBridges();
    (globalThis as Record<string, unknown>).androidBridge = { postMessage() {} };
    expect(Capacitor.getPlatform()).toBe('android');
    expect(isNativeRuntime()).toBe(Capacitor.isNativePlatform());
    expect(isNativeRuntime()).toBe(true);
  });

  it('ios: window.webkit.messageHandlers.bridge is present', () => {
    clearBridges();
    (globalThis as Record<string, unknown>).webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    expect(Capacitor.getPlatform()).toBe('ios');
    expect(isNativeRuntime()).toBe(Capacitor.isNativePlatform());
    expect(isNativeRuntime()).toBe(true);
  });

  it('a webkit object without the bridge handler is still the web', () => {
    // Safari exposes window.webkit; only the injected `bridge` handler means
    // Capacitor. Treating any `webkit` as native would load the native
    // bootstrap for every desktop Safari visitor.
    clearBridges();
    (globalThis as Record<string, unknown>).webkit = { messageHandlers: {} };
    expect(Capacitor.getPlatform()).toBe('web');
    expect(isNativeRuntime()).toBe(Capacitor.isNativePlatform());
    expect(isNativeRuntime()).toBe(false);
  });
});

describe('isNativeRuntime is safe to call anywhere', () => {
  it('returns false without a window-like object (SSR, worker, test)', () => {
    expect(isNativeRuntime(undefined)).toBe(false);
    expect(isNativeRuntime(null)).toBe(false);
    expect(isNativeRuntime('not an object')).toBe(false);
  });

  it('honours CapacitorCustomPlatform', () => {
    // `@capacitor/core` captures this global at IMPORT time, so it cannot be
    // asserted against the live Capacitor object here — but the runtime does
    // treat it as an override, and a custom platform is by definition not the
    // browser we are optimising for.
    expect(isNativeRuntime({ CapacitorCustomPlatform: { name: 'electron' } })).toBe(true);
  });
});
