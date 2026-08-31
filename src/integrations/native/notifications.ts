import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Notification bootstrap for native platforms.
 * - Local notifications work with no external service (event reminders).
 * - Remote push (FCM/APNs) is registered when its config is present; until the
 *   FCM (google-services.json) / APNs entitlement is provisioned it fails
 *   gracefully and the rest of the app is unaffected.
 */
export async function initNativeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await ensureLocalPermission();
  await tryRegisterPush();
}

async function ensureLocalPermission(): Promise<boolean> {
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedule a local reminder for an event the user joined. Safe to call on web
 * (no-op) and when permission is denied (no-op).
 */
export async function scheduleEventReminder(opts: {
  id: number;
  title: string;
  body: string;
  at: Date;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!(await ensureLocalPermission())) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: opts.id,
          title: opts.title,
          body: opts.body,
          schedule: { at: opts.at },
        },
      ],
    });
  } catch {
    /* scheduling failure is non-fatal */
  }
}

async function tryRegisterPush(): Promise<void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
    await PushNotifications.addListener("registration", () => {
      // TODO(push): persist the token to Supabase once FCM/APNs are provisioned.
      // Kept side-effect-free to avoid a half-wired backend table.
      if (import.meta.env.DEV) console.info("[push] registration token acquired");
    });
    await PushNotifications.addListener("registrationError", () => {
      // Expected until FCM/APNs credentials exist; intentionally silent.
    });
  } catch {
    /* push plugin / platform config unavailable — non-fatal */
  }
}
