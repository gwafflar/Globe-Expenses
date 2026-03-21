// transactionService.ts — Firestore write operations for transactions.

import { collection, doc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Transaction, Split } from '@/transactions/types'

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
    // Strip undefined optional fields — setDoc() throws synchronously on undefined values.
    // (updateTransaction uses deleteField() instead, but that sentinel is only valid in updateDoc.)
    ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    createdAt: serverTimestamp(),
    lastModifiedAt: serverTimestamp(),
  }).catch((err: unknown) => {
    console.error('[transactionService] setDoc failed:', err)
  })

  return newDocRef.id
}

// ---------------------------------------------------------------------------
// Update an existing transaction
// ---------------------------------------------------------------------------

// Data shape accepted by updateTransaction — same optional fields as create,
// but without txId/createdAt/createdBy (those never change after creation).
// Optional fields that are missing/undefined are deleted from Firestore
// (so clearing a category in the form truly removes it from the document).
export type UpdateTransactionData = {
  date: string
  name: string
  totalAmount: number
  currency: string
  exchangeRate: number
  totalAmountMain: number
  category?: string
  paymentMethod?: string
  country?: string
  city?: string
  paidBy: Split[]
  beneficiaries: Split[]
  lastModifiedBy: string
  notes?: string
}

/**
 * Updates an existing transaction in Firestore.
 * Fire-and-forget: same offline-first pattern as createTransaction.
 * Optional fields set to undefined are explicitly deleted via deleteField()
 * so that clearing a category/city in the form actually removes the old value.
 */
export function updateTransaction(
  travelId: string,
  txId: string,
  data: UpdateTransactionData,
): void {
  const txRef = doc(db, 'travels', travelId, 'transactions', txId)

  // updateDoc only modifies the specified fields — createdAt/createdBy are untouched.
  updateDoc(txRef, {
    date: data.date,
    name: data.name,
    totalAmount: data.totalAmount,
    currency: data.currency,
    exchangeRate: data.exchangeRate,
    totalAmountMain: data.totalAmountMain,
    // Optional fields: deleteField() removes the key from Firestore if undefined
    category: data.category ?? deleteField(),
    paymentMethod: data.paymentMethod ?? deleteField(),
    country: data.country ?? deleteField(),
    city: data.city ?? deleteField(),
    paidBy: data.paidBy,
    beneficiaries: data.beneficiaries,
    lastModifiedBy: data.lastModifiedBy,
    notes: data.notes ?? deleteField(),
    lastModifiedAt: serverTimestamp(),
  }).catch((err: unknown) => {
    console.error('[transactionService] updateDoc failed:', err)
  })
}

// ---------------------------------------------------------------------------
// Delete an existing transaction
// ---------------------------------------------------------------------------

/**
 * Deletes a transaction document from Firestore.
 * Fire-and-forget: same offline-first pattern as create/update.
 * The onSnapshot listener will remove the document from the UI immediately
 * (local cache delete), then sync the deletion when back online.
 */
export function deleteTransaction(travelId: string, txId: string): void {
  const txRef = doc(db, 'travels', travelId, 'transactions', txId)

  deleteDoc(txRef).catch((err: unknown) => {
    console.error('[transactionService] deleteDoc failed:', err)
  })
}