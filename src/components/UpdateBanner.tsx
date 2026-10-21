import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_MS = 30 * 60 * 1000;

/** Shows a refresh banner when a new build is waiting. Only the service worker and its caches change; localStorage is untouched. */
export default function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(url, reg) {
      if (!reg) return;
      const check = () => {
        if (reg.installing || !navigator.onLine) return;
        fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
          .then((r) => { if (r.status === 200) reg.update(); })
          .catch(() => {});
      };
      setInterval(check, CHECK_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
  if (!needRefresh) return null;
  return (
    <button className="update-banner" onClick={() => updateServiceWorker(true)}>
      New version available. Tap to refresh
    </button>
  );
}

export const VERSION = `v${__APP_VERSION__} · ${__APP_SHA__}`;
