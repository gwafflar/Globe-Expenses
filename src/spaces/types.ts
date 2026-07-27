// TypeScript types for the `travels` collection in Firestore.
// ⚠️ Collection path stays `travels/` — frozen as legacy. See docs/SPACE_REFACTOR_SPEC.md §2.1.

import type { Timestamp } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// SpaceMember — replaces the old MemberRef shape.
//
// travelMemberId is a client-generated nanoid that is the stable key used in
// Split[] objects throughout the app. It is NEVER a Firebase Auth UID.
// userId links the slot to a Firebase Auth account; null means the slot is
// "unclaimed" (a name-only placeholder added before or after the account holder joins).
// ---------------------------------------------------------------------------

export interface SpaceMember {
  /** Stable nanoid identifying a SpaceMember, also the key stored in Split[].
   *  ⚠️ Name kept as `travelMemberId`: it is a Firestore field key, frozen as legacy.
   *  See docs/SPACE_REFACTOR_SPEC.md §2.1. Never a Firebase Auth UID. */
  travelMemberId: string
  displayName: string      // mutable per-space nickname
  userId: string | null    // null = unclaimed; string = linked Firebase Auth UID
  allowRename: boolean     // if true, any space member can rename this person
  joinedAt: Timestamp
}

// ---------------------------------------------------------------------------
// normaliseMember — converts legacy MemberRef documents on read.
//
// Old documents stored { uid, displayName, joinedAt }.
// New documents store the full SpaceMember shape.
// This function handles both so existing data keeps working transparently.
// ---------------------------------------------------------------------------

export function normaliseMember(raw: Record<string, unknown>): SpaceMember {
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

export interface SpaceSettings {
  // When false, country and city fields are hidden in the transaction form.
  trackLocation: boolean
}

// A list item with an optional emoji prefix (e.g. { label: 'Food', emoji: '🍽️' })
export interface LabeledItem {
  id: string      // client-generated uuid — stable key for Firestore array updates
  label: string
  emoji?: string
}

export interface Space {
  // `travelId` is never written into the Firestore document body — it is
  // always derived from the doc id (see useSpaces.ts), so the TS property
  // can safely be renamed. See docs/SPACE_REFACTOR_SPEC.md §2.1 special case.
  spaceId: string
  name: string
  emoji?: string
  description?: string
  // members[] uses the new SpaceMember shape. normaliseMember() handles legacy docs on read.
  members: SpaceMember[]
  // memberUids is access-control only: the flat array of Firebase Auth UIDs for security rules.
  // It is written on space creation and invite acceptance only — NEVER modified by claim/unclaim.
  memberUids: string[]
  createdBy: string
  createdAt: Timestamp
  currencies: string[]
  // The reference currency for exchange rate conversions in this space.
  // All transactions compute exchangeRate and totalAmountMain relative to this currency.
  // Absent on legacy docs — resolved via getSpaceMainCurrency().
  mainCurrency?: string  // ISO 4217
  // Per-space exchange rates: { "USD": 0.92, "MYR": 0.20 } means 1 USD = 0.92 mainCurrency.
  // Seeded from hardcoded defaults at space creation. User-editable in ParametersTab.
  // Absent on legacy docs — consumers fall back to hardcoded EXCHANGE_RATES.
  defaultRates?: Record<string, number>
  settings?: SpaceSettings

  // Per-space lists (v1 extension).
  // Absent on older space documents — read as [] (backward compatible).
  categories: LabeledItem[]
  paymentMethods: LabeledItem[]
  // Countries and cities used in this space.
  // Seeded from existing transactions; user can add extras here.
  countries: LabeledItem[]
  cities: LabeledItem[]

  // Per-user archive: UIDs of members who have archived this space.
  // Absent on older documents — read as [].
  archivedByUids: string[]
}

// ---------------------------------------------------------------------------
// getSpaceMainCurrency — resolves the effective main currency for a space.
//
// Handles legacy documents that lack the mainCurrency field by falling back
// to the first entry in currencies[], then to 'EUR' as a last resort.
// Every consumer should call this instead of reading space.mainCurrency directly.
// ---------------------------------------------------------------------------

export function getSpaceMainCurrency(space: Space): string {
  return space.mainCurrency ?? space.currencies[0] ?? 'EUR'
}
