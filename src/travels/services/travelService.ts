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
// Firestore serialisation helper
//
// Firestore rejects any field whose value is `undefined` — even inside nested
// objects in an array.  This can happen when normaliseMember() reads a legacy
// document that is missing a field (e.g. joinedAt absent on hand-crafted test
// data).  serialiseMember() builds the object explicitly, omitting joinedAt
// when it is undefined rather than letting the spread propagate the undefined.
// ---------------------------------------------------------------------------
function serialiseMember(m: TravelMember): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    travelMemberId: m.travelMemberId,
    displayName: m.displayName,
    userId: m.userId,       // null is a valid Firestore value — do not strip
    allowRename: m.allowRename,
  }
  // joinedAt may be undefined if the original Firestore doc lacked the field
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

  const docData: Record<string, unknown> = {
    name,
    // Creator gets a stable travelMemberId generated client-side.
    // userId is set to the creator's Firebase Auth UID so rules stay consistent.
    members: [{
      travelMemberId: nanoid(),
      displayName,
      userId: uid,
      allowRename: true,
      joinedAt: Timestamp.now(),
    }],
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
// Travel member management
//
// All functions receive the current `members` array from the caller (already
// loaded in local state) and write the updated full array to Firestore.
// The caller is responsible for updating local state via onTravelChange.
// ---------------------------------------------------------------------------

/**
 * Adds a new unclaimed (name-only) member to the travel.
 * Returns the new TravelMember so the caller can update local state.
 */
export async function addUnclaimedMember(
  travelId: string,
  displayName: string,
  currentMembers: TravelMember[],
): Promise<TravelMember> {
  const newMember: TravelMember = {
    travelMemberId: nanoid(),
    displayName: displayName.trim(),
    userId: null,        // unclaimed — no Firebase Auth account linked yet
    allowRename: true,
    joinedAt: Timestamp.now(),
  }
  const updatedMembers = [...currentMembers, newMember]
  const ref = doc(db, 'travels', travelId)
  // memberUids is unchanged — unclaimed members have no Auth UID
  await updateDoc(ref, { members: updatedMembers.map(serialiseMember) })
  return newMember
}

/**
 * Renames a travel member.  Caller should verify allowRename / ownership before calling.
 */
export async function renameTravelMember(
  travelId: string,
  travelMemberId: string,
  newName: string,
  currentMembers: TravelMember[],
): Promise<void> {
  const updatedMembers = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, displayName: newName.trim() } : m,
  )
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { members: updatedMembers.map(serialiseMember) })
}

/**
 * Claims an unclaimed (or any) member slot: links it to a Firebase Auth UID.
 * Also adds the UID to memberUids so security rules recognise the user.
 */
export async function claimTravelMember(
  travelId: string,
  travelMemberId: string,
  userId: string,
  currentMembers: TravelMember[],
): Promise<void> {
  const updatedMembers = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, userId } : m,
  )
  // memberUids = all non-null userIds
  const updatedMemberUids = updatedMembers
    .filter((m) => m.userId !== null)
    .map((m) => m.userId!)
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { members: updatedMembers.map(serialiseMember), memberUids: updatedMemberUids })
}

/**
 * Unclaims a member slot: sets userId back to null and removes the UID from memberUids.
 * Any travel member can unclaim any slot (correction mechanism for wrong claims).
 */
export async function unclaimTravelMember(
  travelId: string,
  travelMemberId: string,
  currentMembers: TravelMember[],
): Promise<void> {
  const updatedMembers = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, userId: null } : m,
  )
  const updatedMemberUids = updatedMembers
    .filter((m) => m.userId !== null)
    .map((m) => m.userId!)
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { members: updatedMembers.map(serialiseMember), memberUids: updatedMemberUids })
}

/**
 * Toggles the allowRename flag on a travel member.
 */
export async function setMemberAllowRename(
  travelId: string,
  travelMemberId: string,
  allowRename: boolean,
  currentMembers: TravelMember[],
): Promise<void> {
  const updatedMembers = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, allowRename } : m,
  )
  const ref = doc(db, 'travels', travelId)
  await updateDoc(ref, { members: updatedMembers.map(serialiseMember) })
}