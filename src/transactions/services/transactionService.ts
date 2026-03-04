// transactionService.ts — Firestore write operations for transactions.

import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Transaction } from '@/transactions/types'

/**
 * Creates a new transaction document and returns its ID immediately.
 *
 * OFFLINE BEHAVIOUR — intentionally fire-and-forget:
 *
 *   1. doc() pre-generates a unique ID client-side (no network needed).
 *   2. setDoc() starts the write without awaiting it.
 *   3. Firestore's persistentLocalCache writes to IndexedDB instantly.
 *   4. The onSnapshot listener sees the document immediately, with
 *      snapshot.metadata.hasPendingWrites === true (not yet on server).
 *   5. When connectivity returns — even after app close/reopen — Firestore
 *      syncs the queued write automatically.
 *   6. hasPendingWrites flips to false and the UI updates.
 *
 * Why doc() + setDoc() instead of addDoc()?
 * addDoc() only gives us the ID via a Promise (after server confirmation).
 * doc() generates the ID synchronously on the client, so we can return it
 * immediately without awaiting anything.
 */
export function createTransaction(
  travelId: string,
  data: Omit<Transaction, 'txId' | 'createdAt' | 'lastModifiedAt'>,
): string {
  const txCollection = collection(db, 'travels', travelId, 'transactions')

  // doc() with no ID argument generates a unique random ID client-side.
  const newDocRef = doc(txCollection)

  // Fire and forget — Firestore queues locally, syncs when online.
  // .catch() only fires for unrecoverable errors (e.g. security rule violations).
  // Normal offline queuing never rejects.
  setDoc(newDocRef, {
    ...data,
    createdAt: serverTimestamp(),
    lastModifiedAt: serverTimestamp(),
  }).catch((err: unknown) => {
    console.error('[transactionService] setDoc failed:', err)
  })

  return newDocRef.id
}

// TODO: export function updateTransaction()