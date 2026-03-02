// useTravels.ts — custom hook to subscribe to the current user's travels.
// Encapsulates all Firestore logic so that the page component stays focused
// on layout and rendering.

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
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Travel } from '@/travels/types'

interface UseTravelsResult {
  travels: Travel[]
  isLoading: boolean
}

export function useTravels(userId: string | undefined): UseTravelsResult {
  const [travels, setTravels] = useState<Travel[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // If we don't yet have a user ID (e.g. auth still initializing),
    // we skip setting up the listener.
    if (!userId) {
      setTravels([])
      setIsLoading(false)
      return
    }

    // Build a query on the `travels` collection:
    // - only documents where memberUids contains this user
    // - ordered by createdAt descending (newest travels first)
    const travelsRef = collection(db, 'travels')
    const q = query(
      travelsRef,
      where('memberUids', 'array-contains', userId),
      orderBy('createdAt', 'desc'),
    )

    // onSnapshot sets up a real-time listener to this query.
    // It calls our callback immediately with the current results,
    // and again whenever matching documents change (added/updated/deleted).
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
          }
        })

        setTravels(nextTravels)
        setIsLoading(false)
      },
      () => {
        // In case of an error, we simply clear the list and stop loading.
        setTravels([])
        setIsLoading(false)
      },
    )

    // The function returned from useEffect is a cleanup function.
    // React calls it when the component using this hook unmounts,
    // or when userId changes. Here we detach the Firestore listener
    // so it stops pushing updates and avoids memory leaks.
    return () => {
      unsubscribe()
    }
  }, [userId])

  return { travels, isLoading }
}

