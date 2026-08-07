import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The manifest is hand-written in public/ and already linked from
      // index.html, so the plugin only handles the service worker.
      injectRegister: null,
      manifest: false,
      // autoUpdate, not 'prompt'. With 'prompt' the new worker only calls
      // skipWaiting() when it receives a message from updateSW(), which is
      // raised from an onNeedRefresh handler — and there isn't one. The result
      // is a worker that installs, waits forever, and keeps serving the build
      // the user first loaded. No deploy would ever reach anyone.
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Any navigation falls back to the cached shell, so opening the app
        // with no network shows the app rather than the browser error page.
        navigateFallback: 'index.html',
        // …except real standalone pages. The fallback route matches every
        // navigation regardless of what's precached, so without this the
        // privacy policy URL would silently serve the app shell.
        navigateFallbackDenylist: [/privacy\.html$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Fonts are the only third-party request the shell makes.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lines-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase is deliberately NETWORK ONLY. Caching API responses
            // would mean serving stale task data that looks live; the app's
            // own snapshot cache handles offline reads, and it knows when it
            // is stale.
            urlPattern: /supabase\.co\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  base: './',
})
