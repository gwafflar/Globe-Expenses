// src/spaces/services/spaceService.ts
// Firestore operations for spaces.
// ⚠️ Collection path stays `travels/` — frozen as legacy. See docs/SPACE_REFACTOR_SPEC.md §2.1.

import {
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { db } from '@/services/firebase'
import type { LabeledItem, SpaceMember, SpaceSettings } from '@/spaces/types'
import { getFlagForCountry } from '@/shared/data/pickerData'
import { buildDefaultRates } from '@/shared/utils/exchangeRates'

// ---------------------------------------------------------------------------
// serialiseMember — strips undefined field values before writing to Firestore.
//
// Firestore rejects `undefined` values. They can appear when spreading a
// normalised legacy document that didn't have all SpaceMember fields.
// Use this in every updateDoc() call that writes the members array.
// ---------------------------------------------------------------------------

function serialiseMember(m: SpaceMember): Record<string, unknown> {
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

interface CreateSpaceInput {
  uid: string
  displayName: string
  name: string
  emoji?: string
  description?: string
  mainCurrency: string  // ISO 4217 — the reference currency for all exchange rate conversions
}

export async function createSpace(input: CreateSpaceInput): Promise<string> {
  const { uid, displayName, name, emoji, description, mainCurrency } = input

  // Collection name stays `travels` — Firestore path frozen as legacy.
  const spacesRef = collection(db, 'travels')

  // Creator gets a stable travelMemberId (nanoid). Their Firebase Auth UID is stored in
  // both userId (slot link) and memberUids (access control flat array).
  const creatorMember: SpaceMember = {
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
    currencies: [mainCurrency],  // seed with main currency so it appears in dropdowns
    mainCurrency,
    // Seed exchange rates from hardcoded defaults, relative to mainCurrency.
    defaultRates: buildDefaultRates(mainCurrency),
    // Per-space lists initialised empty
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
  }

  if (emoji?.trim()) docData.emoji = emoji.trim()
  if (description?.trim()) docData.description = description.trim()

  const docRef = await addDoc(spacesRef, docData)
  return docRef.id
}

// ---------------------------------------------------------------------------
// Update name / emoji (auto-save, called on blur)
// ---------------------------------------------------------------------------

export async function updateSpaceMeta(
  spaceId: string,
  fields: { name?: string; emoji?: string },
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  const update: Record<string, unknown> = {}
  if (fields.name !== undefined) update.name = fields.name
  if (fields.emoji !== undefined) update.emoji = fields.emoji
  if (Object.keys(update).length > 0) await updateDoc(ref, update)
}

// ---------------------------------------------------------------------------
// Update settings (trackLocation toggle)
// ---------------------------------------------------------------------------

export async function updateSpaceSettings(
  spaceId: string,
  settings: SpaceSettings,
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  await updateDoc(ref, { settings })
}

// ---------------------------------------------------------------------------
// Generic list update helper
// Used by all four per-space lists: categories, paymentMethods, countries, cities
// ---------------------------------------------------------------------------

type SpaceListField = 'categories' | 'paymentMethods' | 'countries' | 'cities'

export async function updateSpaceCurrencies(
  spaceId: string,
  currencies: string[],
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  await updateDoc(ref, { currencies })
}

// ---------------------------------------------------------------------------
// Update a single default exchange rate for a currency.
// Uses dot-notation to update a single key without overwriting the whole map.
// ---------------------------------------------------------------------------

export async function updateSpaceDefaultRate(
  spaceId: string,
  currencyCode: string,
  rate: number,
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  await updateDoc(ref, { [`defaultRates.${currencyCode}`]: rate })
}

export async function updateSpaceList(
  spaceId: string,
  field: SpaceListField,
  items: LabeledItem[],
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  await updateDoc(ref, { [field]: items })
}

// ---------------------------------------------------------------------------
// Sync country/city from a new transaction into the space's lists.
// Called after createTransaction() — ensures Parameters tab and future
// TransactionForm dropdowns reflect newly used locations immediately.
//
// Returns { newCountry, newCity } — the LabeledItems that were added
// (null if already present). SpaceDetailPage uses this to update local state.
// ---------------------------------------------------------------------------

export async function syncTransactionLocation(
  spaceId: string,
  country: string | undefined,
  city: string | undefined,
  existingCountries: LabeledItem[],
  existingCities: LabeledItem[],
): Promise<{ newCountry: LabeledItem | null; newCity: LabeledItem | null }> {
  const ref = doc(db, 'travels', spaceId)
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
// SpaceMember operations
//
// These functions write the full members array (via serialiseMember) so that
// Firestore never receives undefined field values from normalised legacy docs.
//
// IMPORTANT invariants:
//  - memberUids is NEVER modified by claim/unclaim — it is access control only.
//  - claimSpaceMember implements transfer semantics: if the userId already owns
//    another slot, that slot is silently set to userId: null first.
// ---------------------------------------------------------------------------

/** Adds a name-only unclaimed member slot. memberUids unchanged. */
export async function addUnclaimedMember(
  spaceId: string,
  displayName: string,
  currentMembers: SpaceMember[],
): Promise<SpaceMember> {
  const ref = doc(db, 'travels', spaceId)
  const newMember: SpaceMember = {
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
export async function renameSpaceMember(
  spaceId: string,
  travelMemberId: string,
  newName: string,
  currentMembers: SpaceMember[],
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
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
export async function claimSpaceMember(
  spaceId: string,
  travelMemberId: string,
  userId: string,
  currentMembers: SpaceMember[],
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
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
export async function unclaimSpaceMember(
  spaceId: string,
  travelMemberId: string,
  currentMembers: SpaceMember[],
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  const updated = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, userId: null } : m,
  )
  // memberUids intentionally NOT touched — access control is unchanged
  await updateDoc(ref, { members: updated.map(serialiseMember) })
}

/** Toggles the allowRename flag on a slot. */
export async function setMemberAllowRename(
  spaceId: string,
  travelMemberId: string,
  allowRename: boolean,
  currentMembers: SpaceMember[],
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  const updated = currentMembers.map((m) =>
    m.travelMemberId === travelMemberId ? { ...m, allowRename } : m,
  )
  await updateDoc(ref, { members: updated.map(serialiseMember) })
}

// ---------------------------------------------------------------------------
// Leave / Delete space
//
// "Leave" removes the current user from memberUids (revokes access) and
// unclaims their member slot (sets userId to null). The slot itself is kept
// so that existing transaction splits referencing the travelMemberId stay valid.
//
// If the leaving user is the creator and other real users remain, createdBy
// is reassigned to a random remaining real user.
//
// "Delete" hard-deletes the space doc AND all child transactions. Used when
// the user is the only real user left (solo space or last person standing).
//
// Impact on memberUids: YES — arrayRemove(uid) revokes Firestore access.
// Impact on members:    slot is unclaimed (userId → null), NOT removed.
// ---------------------------------------------------------------------------

/**
 * Leaves a multi-user space. The user's UID is removed from memberUids
 * (revoking access) and their member slot is unclaimed (userId → null).
 * If the user is the creator, createdBy is reassigned to another real user.
 */
export async function leaveSpace(
  spaceId: string,
  uid: string,
  currentMembers: SpaceMember[],
  currentMemberUids: string[],
  currentCreatedBy: string,
): Promise<void> {
  const ref = doc(db, 'travels', spaceId)

  // Unclaim the leaving user's slot but keep the slot for split integrity
  const updatedMembers = currentMembers.map((m) =>
    m.userId === uid ? { ...m, userId: null } : m,
  )

  const update: Record<string, unknown> = {
    memberUids: arrayRemove(uid),
    members: updatedMembers.map(serialiseMember),
  }

  // Reassign creator if needed — pick a random remaining user from memberUids.
  // Uses memberUids (not members with non-null userId) because a user in
  // memberUids who hasn't claimed a slot is still a real user with access.
  if (currentCreatedBy === uid) {
    const remaining = currentMemberUids.filter((u) => u !== uid)
    if (remaining.length > 0) {
      update.createdBy = remaining[Math.floor(Math.random() * remaining.length)]
    }
  }

  await updateDoc(ref, update)
}

/**
 * Hard-deletes a space and all its child transactions.
 * Used for solo spaces or when the user is the last real user.
 */
export async function deleteSpace(spaceId: string): Promise<void> {
  // Delete all transactions in the subcollection first
  // (Firestore does not cascade-delete subcollections)
  const txRef = collection(db, 'travels', spaceId, 'transactions')
  const txSnapshot = await getDocs(txRef)

  // Batch delete transactions (max 500 per batch — fine for v1)
  if (!txSnapshot.empty) {
    const batch = writeBatch(db)
    txSnapshot.docs.forEach((txDoc) => batch.delete(txDoc.ref))
    await batch.commit()
  }

  // Delete the space document itself
  const spaceRef = doc(db, 'travels', spaceId)
  await deleteDoc(spaceRef)
}

// ---------------------------------------------------------------------------
// Archive / Unarchive
//
// Per-user archive: each user can independently archive/unarchive a space.
// The user's UID is added to / removed from archivedByUids[].
//
// No impact on memberUids or members — purely additive.
// ---------------------------------------------------------------------------

/** Archives a space for the current user. */
export async function archiveSpace(spaceId: string, uid: string): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  await updateDoc(ref, { archivedByUids: arrayUnion(uid) })
}

/** Unarchives a space for the current user. */
export async function unarchiveSpace(spaceId: string, uid: string): Promise<void> {
  const ref = doc(db, 'travels', spaceId)
  await updateDoc(ref, { archivedByUids: arrayRemove(uid) })
}

// ---------------------------------------------------------------------------
// mergeMembers
//
// Merges two member slots (keepId + deleteId) into one.
// All references to `deleteId` in every transaction's paidBy / beneficiaries
// are rewritten to `keepId`. If both members appear in the same Split array,
// their amounts are summed (no duplicate travelMemberIds after merge).
// The `deleteId` slot is then removed from space.members.
//
// Everything runs in a single Firestore batch.
// Firestore batch limit: 500 writes. Fine for v1 (spaces rarely have 490+ transactions).
// ---------------------------------------------------------------------------

export async function mergeMembers(
  spaceId: string,
  keepId: string,
  deleteId: string,
  currentMembers: SpaceMember[],
  currentCreatedBy: string,
): Promise<void> {
  const batch = writeBatch(db)

  // --- 1. Read all transactions -----------------------------------------
  const txCol = collection(db, 'travels', spaceId, 'transactions')
  const txSnapshot = await getDocs(txCol)

  // Helper: rewrite a Split[] replacing deleteId → keepId, merging amounts if both present
  function rewriteSplits(splits: { travelMemberId: string; amount: number }[]) {
    const hasKeep = splits.some((s) => s.travelMemberId === keepId)
    const hasDelete = splits.some((s) => s.travelMemberId === deleteId)
    if (!hasDelete) return null  // no change needed

    if (hasKeep) {
      // Both exist — sum amounts onto keepId, remove deleteId
      const result: { travelMemberId: string; amount: number }[] = []
      let keepAmount = 0
      for (const s of splits) {
        if (s.travelMemberId === keepId || s.travelMemberId === deleteId) {
          keepAmount += s.amount
        } else {
          result.push(s)
        }
      }
      result.push({ travelMemberId: keepId, amount: keepAmount })
      return result
    } else {
      // Only deleteId exists — rename to keepId
      return splits.map((s) =>
        s.travelMemberId === deleteId ? { ...s, travelMemberId: keepId } : s,
      )
    }
  }

  // --- 2. Batch-update each affected transaction ------------------------
  txSnapshot.docs.forEach((txDoc) => {
    const data = txDoc.data()
    const paidBy: { travelMemberId: string; amount: number }[] = data.paidBy ?? []
    const beneficiaries: { travelMemberId: string; amount: number }[] = data.beneficiaries ?? []

    const newPaidBy = rewriteSplits(paidBy)
    const newBeneficiaries = rewriteSplits(beneficiaries)

    if (newPaidBy || newBeneficiaries) {
      batch.update(txDoc.ref, {
        ...(newPaidBy ? { paidBy: newPaidBy } : {}),
        ...(newBeneficiaries ? { beneficiaries: newBeneficiaries } : {}),
      })
    }
  })

  // --- 3. Update space: remove deleteId slot, reassign createdBy if needed
  const spaceRef = doc(db, 'travels', spaceId)
  const updatedMembers = currentMembers.filter((m) => m.travelMemberId !== deleteId)
  const spaceUpdate: Record<string, unknown> = {
    members: updatedMembers.map(serialiseMember),
  }
  if (currentCreatedBy === deleteId) {
    spaceUpdate.createdBy = keepId
  }
  batch.update(spaceRef, spaceUpdate)

  await batch.commit()
}
