// useSpaces.ts — custom hook to subscribe to the current user's spaces.
// Returns active and archived spaces separately so the UI can render them
// in distinct sections.
// ⚠️ Collection path stays `travels/` — frozen as legacy. See docs/SPACE_REFACTOR_SPEC.md §2.1.

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
import type { Space } from '@/spaces/types'
import { normaliseMember } from '@/spaces/types'

interface UseSpacesResult {
  activeSpaces: Space[]
  archivedSpaces: Space[]
  isLoading: boolean
  error: string | null
}

export function useSpaces(userId: string | undefined): UseSpacesResult {
  const [activeSpaces, setActiveSpaces] = useState<Space[]>([])
  const [archivedSpaces, setArchivedSpaces] = useState<Space[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setActiveSpaces([])
      setArchivedSpaces([])
      setIsLoading(false)
      setError(null)
      return
    }

    const spacesRef = collection(db, 'travels')
    const q = query(
      spacesRef,
      where('memberUids', 'array-contains', userId),
      orderBy('createdAt', 'desc'),
    )

    setIsLoading(true)
    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const active: Space[] = []
        const archived: Space[] = []

        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data()
          const archivedByUids: string[] = data.archivedByUids ?? []

          const space: Space = {
            // Derived from the doc id — travelId is never written into the document body.
            spaceId: docSnapshot.id,
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
            // Per-space lists — default to [] for older documents that pre-date this field
            categories: data.categories ?? [],
            paymentMethods: data.paymentMethods ?? [],
            countries: data.countries ?? [],
            cities: data.cities ?? [],
            archivedByUids,
          }

          // Split into active vs archived based on whether the current user
          // has archived this space
          if (archivedByUids.includes(userId)) {
            archived.push(space)
          } else {
            active.push(space)
          }
        }

        setActiveSpaces(active)
        setArchivedSpaces(archived)
        setIsLoading(false)
        setError(null)
      },
      (err: FirestoreError) => {
        // eslint-disable-next-line no-console
        console.error('useSpaces onSnapshot error:', err)
        setActiveSpaces([])
        setArchivedSpaces([])
        setIsLoading(false)
        setError(err.message || 'Unable to load spaces.')
      },
    )

    return () => {
      unsubscribe()
    }
  }, [userId])

  return { activeSpaces, archivedSpaces, isLoading, error }
}
