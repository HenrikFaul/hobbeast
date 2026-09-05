/**
 * Is this bundle running inside a Capacitor native WebView?
 *
 * This deliberately does NOT import `Capacitor` from `@capacitor/core`. That
 * import is what pulls the whole Capacitor runtime into the shared app shell —
 * measured at 11 604 raw / 4 934 gzip bytes of code a browser can never
 * execute. Gating the native bootstrap on a zero-dependency check lets the
 * bootstrap (and the runtime it drags in) become a lazy chunk that a web
 * visitor never downloads.
 *
 * The check is not a weaker proxy for `Capacitor.isNativePlatform()` — it is
 * the SAME test. `@capacitor/core`'s `getPlatformId(win)` reads exactly these
 * globals, which the native WebView injects before any application JavaScript
 * runs:
 *
 *   win.androidBridge                    -> 'android'
 *   win.webkit.messageHandlers.bridge    -> 'ios'
 *   otherwise                            -> 'web'
 *
 * plus `win.CapacitorCustomPlatform`, which overrides the above. That
 * equivalence is asserted against the real `@capacitor/core` in
 * `__tests__/isNativeRuntime.test.ts`, so if Capacitor ever changes how it
 * detects the platform, that test fails rather than the native app silently
 * losing its splash screen, back button and deep links.
 */
interface CapacitorBridgeGlobals {
  androidBridge?: unknown;
  webkit?: { messageHandlers?: { bridge?: unknown } };
  CapacitorCustomPlatform?: unknown;
}

export function isNativeRuntime(win: unknown = typeof globalThis !== 'undefined' ? globalThis : undefined): boolean {
  if (!win || typeof win !== 'object') return false;
  const w = win as CapacitorBridgeGlobals;
  if (w.CapacitorCustomPlatform) return true;
  if (w.androidBridge) return true;
  return Boolean(w.webkit?.messageHandlers?.bridge);
}
