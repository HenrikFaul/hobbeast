import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { initNativeNotifications } from "./notifications";

const BRAND_BG = "#183124";
const APP_LINK_HOSTS = ["expericentre.com", "www.expericentre.com"];

/**
 * Mounted once inside <BrowserRouter>. On native (Capacitor) platforms it wires
 * up the platform shell: status bar, splash reveal, hardware back button, deep
 * links (App Links / Universal Links) and notification bootstrap. On the web it
 * is inert, so the shared bundle behaves exactly as before.
 */
export function NativeBootstrap() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const cleanups: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      // Light status-bar icons over the dark-green brand background (Android).
      try {
        await StatusBar.setStyle({ style: Style.Light });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: BRAND_BG });
        }
      } catch {
        /* status bar is non-critical */
      }

      // React has mounted — drop the native splash that covered the cold boot.
      try {
        await SplashScreen.hide();
      } catch {
        /* ignore */
      }

      // Deep links while running: https://expericentre.com/<path> routes in-app.
      const urlOpen = await CapApp.addListener("appUrlOpen", ({ url }) => {
        const path = toInAppPath(url);
        if (path) navigate(path);
      });
      cleanups.push(() => void urlOpen.remove());

      // Cold start triggered by a deep link.
      try {
        const launch = await CapApp.getLaunchUrl();
        const path = launch?.url ? toInAppPath(launch.url) : null;
        if (!cancelled && path && path !== window.location.pathname + window.location.search) {
          navigate(path);
        }
      } catch {
        /* ignore */
      }

      // Hardware back button: step back inside the SPA, otherwise leave the app.
      const back = await CapApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });
      cleanups.push(() => void back.remove());

      // Notifications: request local permission, register for push if available.
      void initNativeNotifications();
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [navigate]);

  return null;
}

/**
 * Map an incoming deep-link URL to an in-app router path.
 * Accepts the branded App Link hosts and the custom app scheme; rejects
 * anything else so a stray link cannot drive navigation.
 */
function toInAppPath(url: string): string | null {
  try {
    const u = new URL(url);
    const isHttp = u.protocol === "http:" || u.protocol === "https:";
    if (isHttp && !APP_LINK_HOSTS.includes(u.hostname)) return null;
    const path = `${u.pathname}${u.search}${u.hash}`;
    return path && path !== "/" ? path : "/";
  } catch {
    return null;
  }
}
