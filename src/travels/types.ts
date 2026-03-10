// TypeScript types for the `travels` collection in Firestore.

import type { Timestamp } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// TravelMember — stable per-travel identity, decoupled from Firebase Auth.
//
// travelMemberId : client-generated nanoid, stable forever — used as the
//                  stable key in Split[], never changes even if renamed/claimed.
// userId         : null for unclaimed (name-only) members; set to a Firebase
//                  Auth UID once a member links their account to this slot.
// allowRename    : when true, any travel member may rename this person.
//                  Claimed members can always rename themselves regardless of flag.
// ---------------------------------------------------------------------------
export interface TravelMember {
  travelMemberId: string
  displayName: string
  userId: string | null      // null = unclaimed ghost member
  allowRename: boolean       // default true
  joinedAt: Timestamp
}

// ---------------------------------------------------------------------------
// normaliseMember — converts legacy MemberRef shapes (stored before this
// refactor) into TravelMember.  Used in useTravels and TravelDetailPage.
// ---------------------------------------------------------------------------
export function normaliseMember(raw: Record<string, unknown>): TravelMember {
  return {
    // Pre-refactor docs had `uid` instead of `travelMemberId`
    travelMemberId: (raw.travelMemberId as string | undefined) ?? (raw.uid as string) ?? '',
    displayName: (raw.displayName as string | undefined) ?? '',
    // Pre-refactor docs had no `userId` field — the uid WAS the userId
    userId: raw.userId !== undefined
      ? (raw.userId as string | null)
      : (raw.uid as string | undefined) ?? null,
    allowRename: (raw.allowRename as boolean | undefined) ?? true,
    joinedAt: raw.joinedAt as Timestamp,
  }
}

export interface TravelSettings {
  // When false, country and city fields are hidden in the transaction form.
  trackLocation: boolean
}

// A list item with an optional emoji prefix (e.g. { label: 'Food', emoji: '🍽️' })
export interface LabeledItem {
  id: string      // client-generated uuid — stable key for Firestore array updates
  label: string
  emoji?: string
}

export interface Travel {
  travelId: string
  name: string
  emoji?: string
  description?: string
  startDate?: Timestamp
  endDate?: Timestamp
  // Normalised TravelMember list (legacy docs are normalised on read via normaliseMember())
  members: TravelMember[]
  // Flat array of claimed userIds (userId !== null) — used exclusively by Firestore security rules
  memberUids: string[]
  createdBy: string
  createdAt: Timestamp
  currencies: string[]
  settings?: TravelSettings

  // Per-travel lists (v1 extension).
  // Absent on older travel documents — read as [] (backward compatible).
  categories: LabeledItem[]
  paymentMethods: LabeledItem[]
  // Countries and cities used in this travel.
  // Seeded from existing transactions; user can add extras here.
  countries: LabeledItem[]
  cities: LabeledItem[]
}