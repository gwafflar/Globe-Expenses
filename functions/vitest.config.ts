import { defineConfig } from 'vitest/config'

// Unit tests for function logic (pure, no emulator). Plain Node environment —
// unlike the root app's tests, there is no DOM here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
