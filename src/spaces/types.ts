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

// ---------------------------------------------------------------------------
// SpaceConfig — see docs/SPACE_REFACTOR_SPEC.md §4.
// ---------------------------------------------------------------------------

/** A user-defined field. `id` is a stable nanoid, NEVER derived from the label,
 *  so renaming a field or one of its options never orphans stored values. */
export interface CustomFieldDef {
  id: string
  label: string
  emoji?: string
  type: CustomFieldType
  /** For type === 'select' only. Reuses the existing LabeledItem shape,
   *  so the existing list-editing UI can be reused in Phase 3. */
  options?: LabeledItem[]
  /** Soft-disable: hides the field everywhere without deleting the definition
   *  or any stored transaction value. */
  enabled: boolean
}

export type CustomFieldType = 'select' | 'text' | 'boolean'

/** A user-created dashboard breakdown card (Space refactor Phase 7a, §4).
 *  Stored on the space document under config.dashboardCards, so the card set is
 *  SHARED across members — consistent with categories and currencies, and
 *  unlike the date range / You-All controls which are ephemeral per visit. */
export interface DashboardCardDef {
  /** nanoid. Stable across renames and reorders. */
  id: string
  /** A FilterDimension.key: a built-in key ('category', 'country', …) or a
   *  CustomFieldDef.id. Phase 7b will allow a SECOND entry for 2D pivots —
   *  the array shape exists now so that addition needs no migration. */
  dimensions: [string]
  /** User override. When absent, the title is derived from the dimension label. */
  title?: string
}

/** Value stored in Transaction.custom. The matching CustomFieldDef.type tells
 *  you which variant to expect, so read-time parsing is deterministic. */
export type CustomValue = string | boolean

export interface SpaceConfig {
  builtInFields: {
    country: boolean
    city: boolean
    category: boolean
    paymentMethod: boolean
    notes: boolean
  }
  features: {
    /** Withdrawal + adjustment transaction types, wallet dashboard card,
     *  reconciliation dialog. Requires builtInFields.paymentMethod — see
     *  normaliseSpaceConfig(). */
    wallets: boolean
    /** Sticky flag. Auto-upgrades to true on first foreign-currency use and
     *  never auto-downgrades. See SPEC §6.2. */
    multiCurrency: boolean
  }
  customFields: CustomFieldDef[]
  /** Dashboard breakdown cards, in display order. ABSENT means "never edited"
   *  and resolves to the legacy default set — see resolveDashboardCards().
   *  An empty array is meaningful and distinct: the user deleted every card. */
  dashboardCards?: DashboardCardDef[]
}

export type PresetId = 'travel' | 'solo' | 'group' | 'custom'

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

  /** Optional trip dates, ISO "YYYY-MM-DD" (native <input type="date"> format).
   *  ⚠️ This format DIFFERS from Transaction.date ("DD-MM-YYYY") — ISO sorts
   *  lexicographically the same as chronologically, which DD-MM-YYYY does not.
   *  Never compare these to a Transaction.date string directly; go through an
   *  explicit parse helper (e.g. parseTxDate() in dashboardHelpers.ts) first.
   *  Set only for the `travel` preset's optional "Set trip dates" extra.
   *  Display only — nothing currently computes off these (getTripDurationDays()
   *  derives duration from transaction dates instead). Absent on most spaces. */
  startDate?: string
  endDate?: string

  /** Absent on legacy documents. NEVER read directly — always go through
   *  getSpaceConfig(). */
  config?: SpaceConfig

  /** DISPLAY ONLY: which preset this space was created from, used for the list
   *  badge and the "reset to preset" section in Parameters.
   *  ⚠️ No behaviour may branch on this field. Behaviour reads config. */
  presetOrigin?: PresetId

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
