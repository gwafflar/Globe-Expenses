import { defineConfig } from 'vitest/config'

// Firestore security-rules tests. They talk to the Firestore EMULATOR, so they
// are kept out of `pnpm test` and run via `pnpm test:rules`, which starts the
// emulator, runs this config, then stops it (`firebase emulators:exec`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    // Every test file shares one emulator database; run files one at a time so
    // one file's clearFirestore() can't wipe another's seeded data mid-test.
    fileParallelism: false,
    testTimeout: 20000,
  },
})
