/**
 * Who made the write that fired a trigger (docs/NOTIFICATIONS_SPEC.md §3.2).
 *
 * The `...WithAuthContext` trigger variants report the authenticated writer.
 * That is the only trustworthy source: `lastModifiedBy` is written by the
 * client (spoofable), and a deleted document says nothing about who deleted it.
 */

/** True when running inside the local Functions emulator. */
const inEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true'

/**
 * @param authType  `event.authType`
 * @param authId    `event.authId`
 * @param emulatorFallback  a uid to use ONLY in the emulator, which reports
 *                  `authType: 'unknown'` and a placeholder id even for an
 *                  authenticated write. Never used in production.
 * @returns the acting user's uid, or null when no end user is behind the write
 *          (Admin SDK → 'service_account', TTL deletes → 'system', …).
 */
export function resolveActorUid(
  authType: string | undefined,
  authId: string | undefined,
  emulatorFallback?: string,
): string | null {
  // Writes from the app arrive as 'api_key' (the client SDK authenticates with
  // the web API key) with authId = the Firebase Auth uid. Confirmed on a
  // deployed function for create, update and delete (6 Oct 2026).
  if (authType === 'api_key' && authId) return authId
  if (inEmulator() && emulatorFallback) return emulatorFallback
  return null
}
