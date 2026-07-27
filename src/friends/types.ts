// friends/types.ts — data types for the friend and invite system.
import type { Timestamp } from 'firebase/firestore'

// An invite document stored at invites/{inviteId}.
// Covers both targeted friend requests (toUid set, multiUse false)
// and shareable links (toUid absent, multiUse true).
export interface Invite {
  inviteId: string
  // ⚠️ 'travel_member' is a stored Firestore string value, frozen as legacy
  // even though the container is now called Space. See docs/SPACE_REFACTOR_SPEC.md §2.1.
  type: 'friend' | 'travel_member'
  fromUid: string
  fromDisplayName: string
  fromNametag?: string        // denormalized for display
  // ⚠️ Field keys `travelId` / `travelName` are frozen as legacy Firestore keys.
  travelId?: string           // set when type = 'travel_member' — the space being invited to
  travelName?: string         // denormalized
  multiUse: boolean
  toUid?: string              // only set for targeted (non-link) invites
  status: 'active' | 'accepted' | 'declined' | 'revoked'
  usedBy: string[]            // UIDs that have accepted (grows over time for multi-use)
  createdAt: Timestamp
  expiresAt: Timestamp
}

// An entry in the users/{uid}/friends/{friendUid} subcollection.
// Each user maintains their own half of the friendship.
export interface Friend {
  uid: string
  displayName: string
  nametag?: string
  addedAt: Timestamp
}

// Minimal user info returned by nametag search — derived from reading UserProfile docs.
export interface SearchUser {
  uid: string
  displayName: string
  nametag: string
}
