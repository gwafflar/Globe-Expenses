// useTravels.ts — custom hook to subscribe to the current user's travels.

import { useEffect, useState } from 'react'
import {
  Timestamp,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Travel } from '@/travels/types'

interface UseTravelsResult {
  travels: Travel[]
  isLoading: boolean
  error: string | null
}

export function useTravels(userId: string | undefined): UseTravelsResult {
  const [travels, setTravels] = useState<Travel[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setTravels([])
      setIsLoading(false)
      setError(null)
      return
    }

    const travelsRef = collection(db, 'travels')
    const q = query(
      travelsRef,
      where('memberUids', 'array-contains', userId),
      orderBy('createdAt', 'desc'),
    )

    setIsLoading(true)
    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const nextTravels: Travel[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data()
          return {
            travelId: docSnapshot.id,
            name: data.name as string,
            emoji: data.emoji as string | undefined,
            description: data.description as string | undefined,
            startDate: data.startDate as Timestamp | undefined,
            endDate: data.endDate as Timestamp | undefined,
            members: data.members ?? [],
            memberUids: data.memberUids ?? [],
            createdBy: data.createdBy as string,
            createdAt: data.createdAt as Timestamp,
            currencies: data.currencies ?? [],
            settings: data.settings,
            // Per-travel lists — default to [] for older documents that pre-date this field
            categories: data.categories ?? [],
            paymentMethods: data.paymentMethods ?? [],
            countries: data.countries ?? [],
            cities: data.cities ?? [],
          }
        })

        setTravels(nextTravels)
        setIsLoading(false)
        setError(null)
      },
      (err: FirestoreError) => {
        // eslint-disable-next-line no-console
        console.error('useTravels onSnapshot error:', err)
        setTravels([])
        setIsLoading(false)
        setError(err.message || 'Unable to load travels.')
      },
    )

    return () => {
      unsubscribe()
    }
  }, [userId])

  return { travels, isLoading, error }
}