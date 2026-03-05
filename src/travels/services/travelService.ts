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
import { db } from '@/services/firebase'
import type { LabeledItem, TravelSettings } from '@/travels/types'
import { getFlagForCountry } from '@/shared/data/pickerData'

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
    members: [{ uid, displayName, joinedAt: Timestamp.now() }],
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