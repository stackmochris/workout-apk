/**
 * Timer alerts behind one small interface so a native layer (Capacitor LocalNotifications)
 * can replace the web version later without touching the timer components.
 *
 * Web version, best effort: while the app is open it shows an ongoing notification with the
 * end time, then a finished notification plus beep and vibration. Browsers throttle timers
 * once the screen is off, so the end alert can be late until the native build lands.
 */
import { beep, buzz } from './audio';

export interface TimerAlerts {
  running(endAt: number, label: string): void;
  finished(label: string, opts: { sound: boolean; vibrate: boolean }): void;
  cancel(): void;
}

let enabled = false;
export const setNotificationsEnabled = (on: boolean) => { enabled = on; };

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

const TAG = 'workout-timer';
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

async function show(title: string, options: NotificationOptions & { renotify?: boolean; vibrate?: number[] }) {
  if (!enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { tag: TAG, icon: 'icon.svg', ...options });
  } catch { /* not available */ }
}

async function close() {
  if (!notificationsSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    (await reg.getNotifications({ tag: TAG })).forEach((n) => n.close());
  } catch { /* not available */ }
}

export const webAlerts: TimerAlerts = {
  running(endAt, label) {
    void show(label, { body: `Ends at ${hhmm(endAt)}`, silent: true });
  },
  finished(label, { sound, vibrate }) {
    if (sound) beep('done');
    if (vibrate) buzz([200, 100, 200]);
    void show(`${label} done`, { body: 'Next set', renotify: true, vibrate: vibrate ? [200, 100, 200] : undefined });
  },
  cancel() {
    void close();
  },
};

export const alerts: TimerAlerts = webAlerts;
