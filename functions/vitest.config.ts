import { defineConfig } from 'vitest/config'

// Unit tests for function logic (pure, no emulator). Plain Node environment —
// unlike the root app's tests, there is no DOM here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // No tests until step 3 (activity writer); don't fail the run meanwhile.
    passWithNoTests: true,
  },
})
