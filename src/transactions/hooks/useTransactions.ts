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
import type { Transaction } from '@/transactions/types'

interface UseTransactionsResult {
  transactions: Transaction[]
  loading: boolean
  error: string | null
}

export function useTransactions(travelId: string | undefined): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!travelId) {
      setTransactions([])
      setLoading(false)
      setError('Missing travel identifier.')
      return
    }

    // Build a query on `travels/{travelId}/transactions`:
    // - ordered by `date` descending
    // - then by `createdAt` descending for consistent ordering of same-day entries
    const transactionsRef = collection(db, 'travels', travelId, 'transactions')
    const q = query(transactionsRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'))

    // onSnapshot sets up a real-time listener to this query.
    // Firestore will:
    // - call our callback immediately with the current matching documents
    // - call it again whenever those documents change (added/updated/deleted)
    // This keeps the UI list automatically in sync without manual refresh.
    setLoading(true)

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const next: Transaction[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data()
          return {
            txId: docSnapshot.id,
            date: data.date as string,
            name: data.name as string,
            totalAmount: data.totalAmount as number,
            currency: data.currency as string,
            exchangeRate: data.exchangeRate as number,
            totalAmountMain: data.totalAmountMain as number,
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
          }
        })
        setTransactions(next)
        setLoading(false)
        setError(null)
      },
      (firestoreError: FirestoreError) => {
        // Surface the real Firestore error — both to the console (for debugging)
        // and to the UI.
        // Common causes:
        //   - permission-denied: security rules rejected the query
        //   - failed-precondition: a composite index is missing (Firestore
        //     will include a link to create it in the error message)
        console.error('[useTransactions] Firestore error:', firestoreError)
        console.error('[useTransactions] Error code:', firestoreError.code)
        console.error('[useTransactions] Error message:', firestoreError.message)

        setTransactions([])
        setLoading(false)
        setError(`Unable to load transactions. (${firestoreError.code}: ${firestoreError.message})`)
      },
    )

    // Cleanup function: React calls this when the component using the hook
    // unmounts or when `travelId` changes. We detach the Firestore listener
    // so it stops streaming updates and avoids memory leaks.
    return () => {
      unsubscribe()
    }
  }, [travelId])

  return { transactions, loading, error }
}