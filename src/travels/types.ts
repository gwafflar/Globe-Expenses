// TypeScript types for the `travels` collection in Firestore.
// These mirror the data model defined in the architecture/spec documents.

import type { Timestamp } from 'firebase/firestore'

export interface MemberRef {
  uid: string
  displayName: string
  joinedAt: Timestamp
}

export interface Travel {
  travelId: string
  name: string
  emoji?: string
  description?: string
  startDate?: Timestamp
  endDate?: Timestamp
  members: MemberRef[]
  memberUids: string[]
  createdBy: string
  createdAt: Timestamp
  currencies: string[]
}

