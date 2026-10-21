import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json';

const sha = (() => {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
})();

// BASE_PATH is set by the Pages workflow (e.g. /workout-apk/). Defaults to relative for Capacitor.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_SHA__: JSON.stringify(sha) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: { clientsClaim: true, cleanupOutdatedCaches: true },
      manifest: {
        name: 'Workout Tracker',
        short_name: 'Workout',
        start_url: '.',
        display: 'standalone',
        background_color: '#f4f4f5',
        theme_color: '#f4f4f5',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { environment: 'node' },
} as any);
