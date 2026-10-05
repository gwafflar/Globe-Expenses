/**
 * Cloud Functions entry point.
 *
 * Every function exported from this file is deployed. The runtime loads the
 * compiled `lib/index.js` (see "main" in package.json), so run `pnpm build`
 * before starting the emulator or deploying (firebase.json's predeploy does it).
 *
 * Design: docs/NOTIFICATIONS_SPEC.md.
 */
import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'

// Admin SDK: uses the function's service account, so it BYPASSES Firestore
// security rules. Called once per container (module scope), not per event.
initializeApp()

// Applies to every function in this codebase.
//  - region: Firestore triggers must run in the database's region (europe-west4);
//    a mismatch makes the deploy fail.
//  - maxInstances: cost guardrail — a runaway trigger loop cannot scale past 10
//    containers. minInstances stays at its default 0 (no idle cost; the first
//    event after a quiet period pays a 1–3 s cold start, fine for notifications).
setGlobalOptions({ region: 'europe-west4', maxInstances: 10 })

/**
 * TEMPORARY smoke test (step 1 of the notifications plan) — remove in step 3.
 *
 * Proves the build → deploy → trigger chain works, and answers the spec's open
 * question (§3.2): does the `...WithAuthContext` trigger variant give us the
 * actor's uid reliably, including on deletes (where the deleted document
 * carries no "who deleted me")?
 *
 * Expected for a write from the app: authType 'app_user', authId = writer's uid.
 */
export const smokeTransactionWritten = onDocumentWrittenWithAuthContext(
  // Path uses the legacy collection name `travels/` (frozen, see CLAUDE.md).
  'travels/{spaceId}/transactions/{txId}',
  (event) => {
    const before = event.data?.before.exists ?? false
    const after = event.data?.after.exists ?? false
    const change = !before ? 'create' : !after ? 'delete' : 'update'

    // Structured log: shows up as JSON fields in Cloud Logging / emulator UI.
    logger.info('smoke: transaction written', {
      change,
      eventId: event.id, // will become the activity document id (idempotency)
      spaceId: event.params.spaceId,
      txId: event.params.txId,
      authType: event.authType,
      authId: event.authId,
    })
  },
)
