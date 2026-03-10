// vitest.config.ts — test runner configuration, separate from vite.config.ts.
//
// Why separate? vite.config.ts loads heavy build plugins (PWA, Tailwind) that
// are irrelevant for tests and can interfere with the test environment.
// This file gives Vitest only what it needs: TypeScript support + path aliases.

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // 'node' environment: pure Node.js, no fake browser DOM.
    // Correct for unit tests of plain TypeScript logic.
    // Switch to 'jsdom' later when we add React component tests.
    environment: 'node',
  },
  resolve: {
    // Replicate the '@/' alias from vite.config.ts so imports like
    // '@/travels/types' resolve correctly inside test files.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
