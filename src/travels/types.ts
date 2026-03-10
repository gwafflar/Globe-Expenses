// TypeScript types for the `travels` collection in Firestore.

import type { Timestamp } from 'firebase/firestore'

export interface MemberRef {
  uid: string
  displayName: string
  joinedAt: Timestamp
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
  members: MemberRef[]
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