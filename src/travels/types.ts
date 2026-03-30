// TypeScript types for the `travels` collection in Firestore.

import type { Timestamp } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// TravelMember — replaces the old MemberRef shape.
//
// travelMemberId is a client-generated nanoid that is the stable key used in
// Split[] objects throughout the app. It is NEVER a Firebase Auth UID.
// userId links the slot to a Firebase Auth account; null means the slot is
// "unclaimed" (a name-only placeholder added before or after the account holder joins).
// ---------------------------------------------------------------------------

export interface TravelMember {
  travelMemberId: string   // client-generated nanoid — stable key in Split[]
  displayName: string      // mutable per-travel nickname
  userId: string | null    // null = unclaimed; string = linked Firebase Auth UID
  allowRename: boolean     // if true, any travel member can rename this person
  joinedAt: Timestamp
}

// ---------------------------------------------------------------------------
// normaliseMember — converts legacy MemberRef documents on read.
//
// Old documents stored { uid, displayName, joinedAt }.
// New documents store the full TravelMember shape.
// This function handles both so existing data keeps working transparently.
// ---------------------------------------------------------------------------

export function normaliseMember(raw: Record<string, unknown>): TravelMember {
  return {
    travelMemberId: (raw.travelMemberId as string | undefined) ?? (raw.uid as string) ?? '',
    displayName: (raw.displayName as string | undefined) ?? '',
    // New docs have an explicit userId field. Legacy docs have only uid (which was always a real Auth UID).
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
  // members[] uses the new TravelMember shape. normaliseMember() handles legacy docs on read.
  members: TravelMember[]
  // memberUids is access-control only: the flat array of Firebase Auth UIDs for security rules.
  // It is written on travel creation and invite acceptance only — NEVER modified by claim/unclaim.
  memberUids: string[]
  createdBy: string
  createdAt: Timestamp
  currencies: string[]
  // The reference currency for exchange rate conversions in this travel.
  // All transactions compute exchangeRate and totalAmountMain relative to this currency.
  // Absent on legacy docs — resolved via getTravelMainCurrency().
  mainCurrency?: string  // ISO 4217
  settings?: TravelSettings

  // Per-travel lists (v1 extension).
  // Absent on older travel documents — read as [] (backward compatible).
  categories: LabeledItem[]
  paymentMethods: LabeledItem[]
  // Countries and cities used in this travel.
  // Seeded from existing transactions; user can add extras here.
  countries: LabeledItem[]
  cities: LabeledItem[]

  // Per-user archive: UIDs of members who have archived this travel.
  // Absent on older documents — read as [].
  archivedByUids: string[]
}

// ---------------------------------------------------------------------------
// getTravelMainCurrency — resolves the effective main currency for a travel.
//
// Handles legacy documents that lack the mainCurrency field by falling back
// to the first entry in currencies[], then to 'EUR' as a last resort.
// Every consumer should call this instead of reading travel.mainCurrency directly.
// ---------------------------------------------------------------------------

export function getTravelMainCurrency(travel: Travel): string {
  return travel.mainCurrency ?? travel.currencies[0] ?? 'EUR'
}
