import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'autoUpdate' means the Service Worker updates silently in the background
      // when a new version of the app is deployed
      registerType: 'autoUpdate',

      // The web manifest — this is what the browser reads when the user
      // taps "Add to Home Screen"
      manifest: {
        name: 'GlobeExpenses',
        short_name: 'GlobeExpenses',  // shown under the icon on home screen
        description: 'Collaborative travel expense tracker',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',        // hides the browser UI when launched from home screen
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/images/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/images/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },

      // Workbox config — defines what the Service Worker caches
      workbox: {
        // Cache all JS, CSS, HTML, and image files (the app shell)
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // The main bundle exceeds Workbox's default 2 MiB limit; raise it to 3 MiB
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/__\//]
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Vitest configuration — lives inside vite.config.ts so it shares
  // the same alias setup (e.g. @/ paths work in tests automatically)
  test: {
    environment: 'jsdom',   // simulates browser APIs (needed for React component tests)
    globals: true,           // lets you use describe/it/expect without importing them
    setupFiles: ['./src/test/setup.ts'],  // jest-dom matchers (toBeDisabled, toBeInTheDocument, ...)
    // Vitest's 5s default is per-test wall clock, not CPU time. With several
    // component-test files running in parallel workers, the FIRST test in a
    // file pays for that file's whole module graph being transformed and
    // imported — which regularly exceeds 5s on a loaded machine even though
    // the same test finishes in ~100ms when its file runs alone. That produced
    // flaky "Test timed out" failures that had nothing to do with the code.
    testTimeout: 20000,
  },
})