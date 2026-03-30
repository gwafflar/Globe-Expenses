// useTravels.ts — custom hook to subscribe to the current user's travels.
// Returns active and archived travels separately so the UI can render them
// in distinct sections.

import { useEffect, useState } from 'react'
import {
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
import { normaliseMember } from '@/travels/types'

interface UseTravelsResult {
  activeTravels: Travel[]
  archivedTravels: Travel[]
  isLoading: boolean
  error: string | null
}

export function useTravels(userId: string | undefined): UseTravelsResult {
  const [activeTravels, setActiveTravels] = useState<Travel[]>([])
  const [archivedTravels, setArchivedTravels] = useState<Travel[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setActiveTravels([])
      setArchivedTravels([])
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
        const active: Travel[] = []
        const archived: Travel[] = []

        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data()
          const archivedByUids: string[] = data.archivedByUids ?? []

          const travel: Travel = {
            travelId: docSnapshot.id,
            name: data.name as string,
            emoji: data.emoji as string | undefined,
            description: data.description as string | undefined,
            // Apply normaliseMember to handle legacy MemberRef documents transparently
            members: (data.members ?? []).map((raw: Record<string, unknown>) => normaliseMember(raw)),
            memberUids: data.memberUids ?? [],
            createdBy: data.createdBy as string,
            createdAt: data.createdAt,
            currencies: data.currencies ?? [],
            mainCurrency: data.mainCurrency as string | undefined,
            defaultRates: data.defaultRates as Record<string, number> | undefined,
            settings: data.settings,
            // Per-travel lists — default to [] for older documents that pre-date this field
            categories: data.categories ?? [],
            paymentMethods: data.paymentMethods ?? [],
            countries: data.countries ?? [],
            cities: data.cities ?? [],
            archivedByUids,
          }

          // Split into active vs archived based on whether the current user
          // has archived this travel
          if (archivedByUids.includes(userId)) {
            archived.push(travel)
          } else {
            active.push(travel)
          }
        }

        setActiveTravels(active)
        setArchivedTravels(archived)
        setIsLoading(false)
        setError(null)
      },
      (err: FirestoreError) => {
        // eslint-disable-next-line no-console
        console.error('useTravels onSnapshot error:', err)
        setActiveTravels([])
        setArchivedTravels([])
        setIsLoading(false)
        setError(err.message || 'Unable to load travels.')
      },
    )

    return () => {
      unsubscribe()
    }
  }, [userId])

  return { activeTravels, archivedTravels, isLoading, error }
}
