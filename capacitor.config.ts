import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor konfiguráció — Hobbeast / Expericentre natív mobilalkalmazás.
 *
 * A natív Android/iOS app ugyanazt a Vite build kimenetet (`dist/`) csomagolja,
 * amit a web használ, így a design, a funkciók és a Supabase backend
 * (bqdvqmpwccsxumzijspj, a build során beégetve) megegyeznek a webbel.
 *
 * Fejlesztői live-reload: futtasd a Vite dev szervert (npm run dev, :8080),
 * majd állítsd be a CAP_SERVER_URL környezeti változót a géped LAN IP-jére
 * (pl. http://192.168.0.10:8080) és `npx cap run android` — a natív héj a
 * dev szerverről tölt, nem a bundle-ből. Éles buildhez hagyd üresen.
 */
const devServerUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.expericentre.hobbeast',
  appName: 'Hobbeast',
  webDir: 'dist',
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: true,
        },
      }
    : {}),
  android: {
    // A böngészőmotor a rendszer WebView-ja; a Capacitor a dist/-et szolgálja ki
    // a https://localhost origóról (biztonságos kontextus, service worker működik).
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      // A natív splash a hideg indulást fedi; a NativeBootstrap rejti el, amint
      // a React csatlakozott (ezért launchAutoHide: false).
      launchAutoHide: false,
      backgroundColor: '#183124',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    LocalNotifications: {
      iconColor: '#DFFF62',
    },
  },
};

export default config;
