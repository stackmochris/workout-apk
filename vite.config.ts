import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the Pages workflow (e.g. /workout-apk/). Defaults to relative for Capacitor.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Workout Tracker',
        short_name: 'Workout',
        start_url: '.',
        display: 'standalone',
        background_color: '#f4f4f5',
        theme_color: '#0f3d2e',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { environment: 'node' },
} as any);
