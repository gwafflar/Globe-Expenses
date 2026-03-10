// src/travels/services/travelService.ts
// Firestore operations for travels.

import {
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { db } from '@/services/firebase'
import type { LabeledItem, TravelMember, TravelSettings } from '@/travels/types'
import { getFlagForCountry } from '@/shared/data/pickerData'

// ---------------------------------------------------------------------------
// serialiseMember — strips undefined field values before writing to Firestore.
//
// Firestore rejects `undefined` values. They can appear when spreading a
// normalised legacy document that didn't have all TravelMember fields.
// Use this in every updateDoc() call that writes the members array.
// ---------------------------------------------------------------------------

function serialiseMember(m: TravelMember): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    travelMemberId: m.travelMemberId,
    displayName: m.displayName,
    userId: m.userId,       // null is valid in Firestore — do not strip
    allowRename: m.allowRename,
  }
  // Only include joinedAt if it's defined (new docs always have it, some legacy may not)
  if (m.joinedAt !== undefined) obj.joinedAt = m.joinedAt
  return obj
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

interface CreateTravelInput {
  uid: string
  displayName: string
  name: string
  emoji?: string
  description?: string
  startDate?: string
  endDate?: string
}

export async function createTravel(input: CreateTravelInput): Promise<void> {
  const { uid, displayName, name, emoji, description, startDate, endDate } = input

  const startTimestamp =
    startDate && startDate.trim() !== ''
      ? Timestamp.fromDate(new Date(startDate))
      : undefined
  const endTimestamp =
    endDate && endDate.trim() !== ''
      ? Timestamp.fromDate(new Date(endDate))
      : undefined

  const travelsRef = collection(db, 'travels')

  // Creator gets a stable travelMemberId (nanoid). Their Firebase Auth UID is stored in
  // both userId (slot link) and memberUids (access control flat array).
  const creatorMember: TravelMember = {
    travelMemberId: nanoid(),
    displayName,
    userId: uid,
    allowRename: true,
    joinedAt: Timestamp.now(),
  }

  const docData: Record<string, unknown> = {
    name,
    members: [serialiseMember(creatorMember)],
    memberUids: [uid],
    createdBy: uid,
    createdAt: serverTimestamp(),
    currencies: [],
    // Per-travel lists initialised empty
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
  }

  if (emoji?.trim()) docData.emoji = emoji.trim()
  if (description?.trim()) docData.description = description.trim()
  if (startTimestamp) docData.startDate = startTimestamp
  if (endTimestamp) docData.endDate = endTimestamp

  await addDoc(travelsRef, docData)
}

// ---------------------------------------------------------------------------
// Update name / emoji (auto-save, called on blur)
// ---------------------------------------------------------------------------

export async function updateTravelMeta(
  travelId: string,
  fields: { name?: string; emoji?: string },
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  const update: Record<string, unknown> = {}
  if (fields.name !== undefined) update.name = fields.name
  if (fields.emoji !== undefined) update.emoji = fields.emoji
  if (Object.keys(update).length > 0) await updateDoc(ref, update)
}

// ---------------------------------------------------------------------------
// Update settings (trackLocation toggle)
// ---------------------------------------------------------------------------

export async function updateTravelSettings(
  travelId: string,
  settings: TravelSettings,
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { settings })
}

// ---------------------------------------------------------------------------
// Generic list update helper
// Used by all four per-travel lists: categories, paymentMethods, countries, cities
// ---------------------------------------------------------------------------

type TravelListField = 'categories' | 'paymentMethods' | 'countries' | 'cities'

export async function updateTravelCurrencies(
  travelId: string,
  currencies: string[],
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { currencies })
}

export async function updateTravelList(
  travelId: string,
  field: TravelListField,
  items: LabeledItem[],
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { [field]: items })
}

// ---------------------------------------------------------------------------
// Sync country/city from a new transaction into the travel's lists.
// Called after createTransaction() — ensures Parameters tab and future
// TransactionForm dropdowns reflect newly used locations immediately.
//
// Returns { newCountry, newCity } — the LabeledItems that were added
// (null if already present). TravelDetailPage uses this to update local state.
// ---------------------------------------------------------------------------

export async function syncTransactionLocation(
  travelId: string,
  country: string | undefined,
  city: string | undefined,
  existingCountries: LabeledItem[],
  existingCities: LabeledItem[],
): Promise<{ newCountry: LabeledItem | null; newCity: LabeledItem | null }> {
  const ref = doc(db, 'travels', travelId)
  const updates: Record<string, unknown> = {}

  let newCountry: LabeledItem | null = null
  let newCity: LabeledItem | null = null

  if (country) {
    const alreadyHas = existingCountries.some(
      (c) => c.label.toLowerCase() === country.toLowerCase(),
    )
    if (!alreadyHas) {
      const flag = getFlagForCountry(country)
      newCountry = { id: `country-${Date.now()}`, label: country, emoji: flag }
      // arrayUnion safely handles concurrent writes from multiple members
      updates.countries = arrayUnion(newCountry)
    }
  }

  if (city) {
    const alreadyHas = existingCities.some(
      (c) => c.label.toLowerCase() === city.toLowerCase(),
    )
    if (!alreadyHas) {
      newCity = { id: `city-${Date.now()}`, label: city }
      updates.cities = arrayUnion(newCity)
    }
  }

  if (Object.keys(updates).length > 0) {
    // Fire-and-forget — same pattern as createTransaction.
    // If offline, Firestore queues it and syncs on reconnect.
    updateDoc(ref, updates).catch((err) => {
      console.error('[syncTransactionLocation] updateDoc failed:', err)
    })
  }

  return { newCountry, newCity }
}

// ---------------------------------------------------------------------------
// TravelMember operations
//
// These functions write the full members array (via serialiseMember) so that
// Firestore never receives undefined field values from normalised legacy docs.
//
// IMPORTANT invariants:
//  - memberUids is NEVER modified by claim/unclaim — it is access control only.
//  - claimTravelMember implements transfer semantics: if the userId already owns
//    another slot, that slot is silently set to userId: null first.
// ---------------------------------------------------------------------------

/** Adds a name-only unclaimed member slot. memberUids unchanged. */
export async function addUnclaimedMember(
  travelId: string,
  displayName: string,
  currentMembers: TravelMember[],
): Promise<TravelMember> {
  const ref = doc(db, 'travels', travelId)
  const newMember: TravelMember = {
    travelMemberId: nanoid(),
    displayName,
    userId: null,           // unclaimed — no Auth account linked yet
    allowRename: true,
    joinedAt: Timestamp.now(),
  }
  const updated = [...currentMembers, newMember]
  await updateDoc(ref, { members: updated.map(serialiseMember) })
  return newMember
}

/** Renames a slot. Caller must verify permission before calling. */
export async function renameTravelMember(
  travelId: string,
  travelMemberId: string,
  newName: string,
  currentMembers: TravelMember[],
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  const updated = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, displayName: newName } : m,
  )
  await updateDoc(ref, { members: updated.map(serialiseMember) })
}

/**
 * Claims a slot for a Firebase Auth user.
 * Transfer semantics: if the userId already owns another slot, that slot is
 * silently set to userId: null before the target slot is claimed.
 * memberUids is NOT modified — access was already granted on join.
 */
export async function claimTravelMember(
  travelId: string,
  travelMemberId: string,
  userId: string,
  currentMembers: TravelMember[],
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  const updated = currentMembers.map((m) => {
    if (m.travelMemberId === travelMemberId) {
      // Claim this slot for the user
      return { ...m, userId }
    }
    if (m.userId === userId) {
      // The user previously owned this other slot — release it (transfer semantics)
      return { ...m, userId: null }
    }
    return m
  })
  await updateDoc(ref, { members: updated.map(serialiseMember) })
}

/**
 * Unclaims a slot — sets userId to null.
 * memberUids is NOT modified. The person whose account was unlinked retains access.
 */
export async function unclaimTravelMember(
  travelId: string,
  travelMemberId: string,
  currentMembers: TravelMember[],
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  const updated = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, userId: null } : m,
  )
  // memberUids intentionally NOT touched — access control is unchanged
  await updateDoc(ref, { members: updated.map(serialiseMember) })
}

/** Toggles the allowRename flag on a slot. */
export async function setMemberAllowRename(
  travelId: string,
  travelMemberId: string,
  allowRename: boolean,
  currentMembers: TravelMember[],
): Promise<void> {
  const ref = doc(db, 'travels', travelId)
  const updated = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, allowRename } : m,
  )
  await updateDoc(ref, { members: updated.map(serialiseMember) })
}
