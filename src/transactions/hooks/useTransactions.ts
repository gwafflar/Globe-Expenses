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
import { getT } from '@/i18n'
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
      // getT() reads the current language when the error happens (not a hook:
      // we are inside an effect).
      setError(getT().transactions.load.missingSpace)
      return
    }

    const transactionsRef = collection(db, 'travels', spaceId, 'transactions')

    // Order by date descending, then createdAt descending for same-day entries.
    // This requires a composite Firestore index on (date DESC, createdAt DESC).
    //const q = query(transactionsRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'))
    const q = query(transactionsRef, orderBy('createdAt', 'desc'))

    setLoading(true)

    // Bounded retry for a transient race: createSpace() is fire-and-forget
    // (spaceService.ts), so a freshly created space can navigate here before
    // its `travels/{id}` document has synced to the server. The transactions
    // subcollection rule does a get() on that parent to check memberUids —
    // against a not-yet-existent parent, that get() denies the read. This is
    // a transient race, not a real permission failure, so 'permission-denied'
    // gets a short retry window before surfacing as an error. Every other
    // error code (a genuine removal from the space, etc.) surfaces at once.
    // First delay is 250ms (not 500ms): the parent SpaceDetailPage read is
    // now onSnapshot/cache-first (Prompt 04.3), so this first retry is
    // usually the only one that ever fires — worth shaving off.
    //
    // `cancelled` guards every state-setting path so a retry that resolves
    // (success, error, or backoff firing) after unmount is a no-op — this
    // hook can remount quickly during navigation.
    //
    // `unsubscribe` and `backoffTimer` are declared with `let` in this outer
    // closure (not captured per-attempt) precisely because each retry calls
    // subscribe() again, which creates a NEW onSnapshot subscription and
    // reassigns them. The cleanup function below reads these variables at
    // call time, so it always detaches whichever subscription/timer is
    // currently live — not the one that existed when the effect first ran.
    const RETRY_DELAYS_MS = [250, 1000, 2000]
    let attempt = 0
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    let backoffTimer: ReturnType<typeof setTimeout> | null = null

    function subscribe() {
      unsubscribe = onSnapshot(
        q,
        // includeMetadataChanges: true means the callback also fires when
        // metadata changes — specifically when hasPendingWrites flips from
        // true to false after a successful server sync. Without this option,
        // the "pending" badge would never disappear until the next data change.
        { includeMetadataChanges: true },
        (snapshot: QuerySnapshot<DocumentData>) => {
          if (cancelled) return
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
          if (cancelled) return

          if (firestoreError.code === 'permission-denied' && attempt < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[attempt]
            attempt += 1
            // Debug-level: this is an expected, resolving condition during the
            // race window, not a failure — only log as an error once the
            // retry budget is exhausted (below), so the console doesn't
            // report a resolved condition as a failure.
            console.debug(
              `[useTransactions] permission-denied (likely a new-space race) — retrying in ${delay}ms (attempt ${attempt}/${RETRY_DELAYS_MS.length})`,
            )
            // No need to call the old `unsubscribe` here: Firestore already
            // tears down a listener internally once it has invoked the error
            // callback, so the errored subscription is already dead.
            backoffTimer = setTimeout(() => {
              if (cancelled) return
              // Still loading — the retry is invisible to the UI.
              subscribe()
            }, delay)
            return
          }

          console.error('[useTransactions] Firestore error:', firestoreError)
          console.error('[useTransactions] Error code:', firestoreError.code)
          console.error('[useTransactions] Error message:', firestoreError.message)
          setTransactions([])
          setLoading(false)
          setError(getT().transactions.load.failed({ code: firestoreError.code, message: firestoreError.message }))
        },
      )
    }

    subscribe()

    return () => {
      cancelled = true
      if (backoffTimer) clearTimeout(backoffTimer)
      unsubscribe?.()
    }
  }, [spaceId])

  return { transactions, loading, error }
}