// notificationPrefs.ts — the user's own notification settings in Firestore.
//
// Two owner-only documents (docs/NOTIFICATIONS_SPEC.md §3.5, §6.1):
//   users/{uid}/private/notifications   { mutedSpaceIds: string[] }
//   users/{uid}/pushThrottle/{spaceId}  { count, lastEventAt }  — push limiter
//
// They live under the user, not on the space: muting is personal, and writing
// it on the shared space document would wake every member's listener.

import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'

const prefsRef = (uid: string) => doc(db, 'users', uid, 'private', 'notifications')

/**
 * Mutes / unmutes pushes from one space for this user. The activity feed still
 * records everything; the Cloud Function checks this list before pushing.
 *
 * Fire-and-forget. merge + arrayUnion/arrayRemove: creates the document if it
 * does not exist yet and never overwrites the other fields stored in it.
 */
export function setSpaceMuted(uid: string, spaceId: string, muted: boolean): void {
  setDoc(
    prefsRef(uid),
    { mutedSpaceIds: muted ? arrayUnion(spaceId) : arrayRemove(spaceId) },
    { merge: true },
  ).catch((err: unknown) => console.error('[notificationPrefs] mute update failed:', err))
}

/**
 * Real-time listener on the muted-space list.
 * @returns the unsubscribe function (call it when the component unmounts)
 */
export function subscribeToMutedSpaces(uid: string, onChange: (mutedSpaceIds: string[]) => void): () => void {
  return onSnapshot(
    prefsRef(uid),
    (snapshot) => onChange((snapshot.data()?.mutedSpaceIds as string[] | undefined) ?? []),
    () => onChange([]), // unreadable (offline first load…): behave as "nothing muted"
  )
}

/**
 * Reset-on-open (§6.1): the user is looking at this space, so the next change
 * should push normally again instead of being swallowed by an ongoing burst.
 *
 * ⚠️ Must stay a MERGE write of exactly `{ count: 0 }`: the security rules
 * refuse anything else, and a non-merge set would erase `lastEventAt`.
 */
export function resetPushThrottle(uid: string, spaceId: string): void {
  setDoc(doc(db, 'users', uid, 'pushThrottle', spaceId), { count: 0 }, { merge: true }).catch(() => {
    // Purely an optimisation — never worth surfacing.
  })
}
