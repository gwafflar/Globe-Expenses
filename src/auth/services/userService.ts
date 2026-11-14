// userService.ts — fetches the GlobeExpenses user profile from Firestore.
//
// Why does mainCurrency live in Firestore and not in the Firebase Auth object?
// Firebase Auth is intentionally minimal: it only stores identity-related fields
// (uid, email, displayName, photoURL). App-specific preferences like mainCurrency,
// categories, and paymentMethods are stored in the Firestore `users/{uid}` document,
// which we fully control and can extend freely.

import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { LanguagePreference } from '@/i18n'

// The shape of a user document as stored in Firestore at `users/{uid}`.
// This mirrors the User data model defined in ARCHITECTURE.md.
export interface UserProfile {
  uid: string
  type: 'human'            // always 'human' — agents never have User documents (see ARCHITECTURE.md)
  displayName: string
  email: string
  nametag?: string         // optional @handle for friend management (v2)
  mainCurrency: string     // ISO 4217 code, e.g. 'EUR'
  categories: string[]     // user-defined expense categories, global across all spaces
  paymentMethods: string[] // user-defined payment methods, global across all spaces
  // UI language chosen in Profile: 'en' | 'fr' | 'auto' (follow the browser).
  // ABSENT = never chosen → each device keeps its own preference (localStorage,
  // else the browser language). Read it through parsePreference(), never raw.
  language?: LanguagePreference
  createdAt: Timestamp     // Firestore server timestamp set at account creation
}

/**
 * Saves the UI language choice on the profile so it follows the user to every
 * device. Fire-and-forget (project convention): the local store is updated by
 * the caller first, the write syncs in the background and works offline.
 * 'auto' is stored as-is rather than deleted, so "I chose automatic" is
 * distinguishable from "never chose" on the user's other devices.
 */
export function updateUserLanguage(uid: string, language: LanguagePreference): void {
  updateDoc(doc(db, 'users', uid), { language }).catch((err: unknown) =>
    console.error('[userService] saving the language failed:', err),
  )
}

/**
 * Persists a partial update to the user's Firestore document.
 * Only the provided fields are written — others are left unchanged.
 * Does NOT handle nametag uniqueness — use claimNametag() for that.
 */
export async function updateUserProfile(
  uid: string,
  fields: Partial<Pick<UserProfile, 'displayName' | 'mainCurrency'>>,
): Promise<void> {
  const ref = doc(db, 'users', uid)
  await updateDoc(ref, fields as Record<string, unknown>)
}

/**
 * Checks whether a nametag handle is available (not claimed by another user).
 * Reads the sentinel document at nametags/{tag}.
 * Returns true if available, false if taken.
 */
export async function isNametagAvailable(tag: string): Promise<boolean> {
  // The sentinel collection stores one document per claimed handle.
  // If the document exists, the handle is taken.
  const ref = doc(db, 'nametags', tag)
  const snapshot = await getDoc(ref)
  return !snapshot.exists()
}

/**
 * Atomically updates a user's nametag:
 *   1. Releases the old sentinel document (nametags/{oldTag}) if it exists
 *   2. Claims the new sentinel document (nametags/{newTag}) → { uid }
 *   3. Updates users/{uid} → { nametag: newTag }
 *
 * Uses a Firestore batch write so all three operations succeed or fail together.
 * Throws a "permission-denied" FirestoreError if the new nametag was claimed
 * by another user between the availability check and the write (race condition).
 * The caller (ProfilePage) catches this and shows "already taken".
 */
export async function claimNametag(
  uid: string,
  oldTag: string | undefined,
  newTag: string,
): Promise<void> {
  const batch = writeBatch(db)

  // Release the old handle if the user already had one
  if (oldTag && oldTag !== newTag) {
    const oldRef = doc(db, 'nametags', oldTag)
    batch.delete(oldRef)
  }

  // Claim the new handle — security rules enforce that uid == auth.uid
  const newRef = doc(db, 'nametags', newTag)
  batch.set(newRef, { uid })

  // Update the user's profile document
  const userRef = doc(db, 'users', uid)
  batch.update(userRef, { nametag: newTag })

  // Commit all three writes atomically
  await batch.commit()
}

/**
 * Fetches the UserProfile document for a given uid.
 * This is a single read (getDoc) — it does not set up a real-time listener.
 * Use this when you need the profile once (e.g. to pre-fill a form).
 *
 * Throws if the document does not exist, since every authenticated user
 * should have a profile document (created by useAuthStore on first sign-in).
 */
export async function getUser(uid: string): Promise<UserProfile> {
  // doc() builds a reference to the document at path `users/{uid}`.
  // It does not perform any network call — it's just a typed pointer.
  const ref = doc(db, 'users', uid)

  // getDoc() performs a single read of the document.
  // In contrast to onSnapshot(), it resolves once and does not keep listening.
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    // This should not happen in normal operation — the auth store creates
    // the document on first sign-in. If it does happen, throwing here
    // makes the bug visible rather than returning a broken partial object.
    throw new Error(`UserProfile not found for uid="${uid}". The document may not have been created yet.`)
  }

  // snapshot.data() returns the raw Firestore document fields as a plain object.
  // We cast it to UserProfile — TypeScript trusts us here since Firestore has
  // no schema enforcement. The data shape is guaranteed by the write in useAuthStore.
  return snapshot.data() as UserProfile
}