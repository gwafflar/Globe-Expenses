// userService.ts — fetches the GlobeExpenses user profile from Firestore.
//
// Why does mainCurrency live in Firestore and not in the Firebase Auth object?
// Firebase Auth is intentionally minimal: it only stores identity-related fields
// (uid, email, displayName, photoURL). App-specific preferences like mainCurrency,
// categories, and paymentMethods are stored in the Firestore `users/{uid}` document,
// which we fully control and can extend freely.

import { doc, getDoc, updateDoc } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'

// The shape of a user document as stored in Firestore at `users/{uid}`.
// This mirrors the User data model defined in ARCHITECTURE.md.
export interface UserProfile {
  uid: string
  type: 'human'            // always 'human' — agents never have User documents (see ARCHITECTURE.md)
  displayName: string
  email: string
  nametag?: string         // optional @handle for friend management (v2)
  mainCurrency: string     // ISO 4217 code, e.g. 'EUR'
  categories: string[]     // user-defined expense categories, global across all travels
  paymentMethods: string[] // user-defined payment methods, global across all travels
  createdAt: Timestamp     // Firestore server timestamp set at account creation
}

/**
 * Persists a partial update to the user's Firestore document.
 * Only the provided fields are written — others are left unchanged.
 * Called from ProfilePage after the user edits their identity or preferences.
 */
export async function updateUserProfile(
  uid: string,
  fields: Partial<Pick<UserProfile, 'displayName' | 'nametag' | 'mainCurrency'>>,
): Promise<void> {
  const ref = doc(db, 'users', uid)
  await updateDoc(ref, fields as Record<string, unknown>)
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