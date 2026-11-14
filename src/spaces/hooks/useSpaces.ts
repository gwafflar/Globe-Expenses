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
import { mapSpaceDoc } from '@/spaces/services/spaceService'
import { getT } from '@/i18n'

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
          const space: Space = mapSpaceDoc(docSnapshot.id, docSnapshot.data())

          // Split into active vs archived based on whether the current user
          // has archived this space
          if (space.archivedByUids.includes(userId)) {
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
        // getT() (not the useT hook): this runs inside a Firestore callback,
        // so it reads the language current at the time of the error.
        setError(err.message || getT().spaces.list.loadErrorFallback)
      },
    )

    return () => {
      unsubscribe()
    }
  }, [userId])

  return { activeSpaces, archivedSpaces, isLoading, error }
}
