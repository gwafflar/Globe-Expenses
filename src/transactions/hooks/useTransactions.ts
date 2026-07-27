// useTransactions.ts — real-time transaction listener for a space.
//
// Each transaction in the returned array carries a `isPending` flag derived
// from Firestore's snapshot.metadata.hasPendingWrites. When true, the
// document has been written to local cache but not yet synced to the server
// (e.g. the device is offline). The UI uses this to show a "not synced" badge.

import { useEffect, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QuerySnapshot,
  FirestoreError,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Transaction, TransactionType, AdjustmentMode } from '@/transactions/types'

// Extends Transaction with a UI-only flag — not stored in Firestore.
export interface TransactionWithStatus extends Transaction {
  isPending: boolean  // true = written locally, not yet synced to server
}

interface UseTransactionsResult {
  transactions: TransactionWithStatus[]
  loading: boolean
  error: string | null
}

export function useTransactions(spaceId: string | undefined): UseTransactionsResult {
  const [transactions, setTransactions] = useState<TransactionWithStatus[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!spaceId) {
      setTransactions([])
      setLoading(false)
      setError('Missing space identifier.')
      return
    }

    const transactionsRef = collection(db, 'travels', spaceId, 'transactions')

    // Order by date descending, then createdAt descending for same-day entries.
    // This requires a composite Firestore index on (date DESC, createdAt DESC).
    //const q = query(transactionsRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'))
    const q = query(transactionsRef, orderBy('createdAt', 'desc'))
    
    setLoading(true)

    const unsubscribe = onSnapshot(
      q,
      // includeMetadataChanges: true means the callback also fires when
      // metadata changes — specifically when hasPendingWrites flips from
      // true to false after a successful server sync. Without this option,
      // the "pending" badge would never disappear until the next data change.
      { includeMetadataChanges: true },
      (snapshot: QuerySnapshot<DocumentData>) => {
        const next: TransactionWithStatus[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data()
          return {
            txId: docSnapshot.id,
            date: data.date as string,
            name: data.name as string,
            totalAmount: data.totalAmount as number,
            currency: data.currency as string,
            exchangeRate: data.exchangeRate as number,
            totalAmountMain: data.totalAmountMain as number,
            country: data.country as string | undefined,
            city: data.city as string | undefined,
            category: data.category as string | undefined,
            paymentMethod: data.paymentMethod as string | undefined,
            paidBy: (data.paidBy ?? []) as Transaction['paidBy'],
            beneficiaries: (data.beneficiaries ?? []) as Transaction['beneficiaries'],
            createdBy: data.createdBy,
            createdAt: data.createdAt,
            lastModifiedAt: data.lastModifiedAt,
            lastModifiedBy: data.lastModifiedBy as string,
            draftId: data.draftId as string | undefined,
            notes: data.notes as string | undefined,
            amountFormula: data.amountFormula as string | undefined,
            type: data.type as TransactionType | undefined,
            fees: data.fees as number | undefined,
            adjustmentMode: data.adjustmentMode as AdjustmentMode | undefined,
            // Absent → leave undefined (do not default to {}, which would make
            // every legacy transaction look dirty to future diffing).
            custom: data.custom as Transaction['custom'],
            // hasPendingWrites is true when the write is queued locally but
            // not yet confirmed by the Firestore server.
            isPending: docSnapshot.metadata.hasPendingWrites,
          }
        })
        setTransactions(next)
        setLoading(false)
        setError(null)
      },
      (firestoreError: FirestoreError) => {
        console.error('[useTransactions] Firestore error:', firestoreError)
        console.error('[useTransactions] Error code:', firestoreError.code)
        console.error('[useTransactions] Error message:', firestoreError.message)
        setTransactions([])
        setLoading(false)
        setError(`Unable to load transactions. (${firestoreError.code}: ${firestoreError.message})`)
      },
    )

    return () => unsubscribe()
  }, [spaceId])

  return { transactions, loading, error }
}