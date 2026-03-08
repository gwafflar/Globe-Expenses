// usePendingInvites.ts — real-time listener for incoming friend requests.
//
// Used in two places:
//   1. ProfilePage — to display the full invite list (accept / decline)
//   2. TravelsPage / TravelDetailPage — to drive the badge count on the avatar button
//
// Returns { invites, count } derived from a single onSnapshot listener.
// The listener is cleaned up when the consuming component unmounts.

import { useEffect, useState } from 'react'
import { subscribeToIncomingRequests } from '@/friends/services/friendService'
import type { Invite } from '@/friends/types'

export function usePendingInvites(uid: string | undefined) {
  // `invites` holds the full list; `count` is derived for badge display
  const [invites, setInvites] = useState<Invite[]>([])

  useEffect(() => {
    // Don't subscribe if we don't have a UID yet (auth not ready)
    if (!uid) return

    // subscribeToIncomingRequests returns an unsubscribe function.
    // We return it directly from useEffect so React calls it on unmount.
    const unsubscribe = subscribeToIncomingRequests(uid, setInvites)
    return unsubscribe
  }, [uid]) // re-subscribe only if the uid changes (e.g. sign-in / sign-out)

  return { invites, count: invites.length }
}
