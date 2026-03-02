// travelService.ts — Firestore operations related to travels.
// This file hides direct Firebase calls behind small, well-typed functions.

import {
  Timestamp,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'

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

  // Convert optional date strings (from <input type="date" />) to Firestore Timestamps.
  const startTimestamp =
    startDate && startDate.trim() !== ''
      ? Timestamp.fromDate(new Date(startDate))
      : undefined
  const endTimestamp =
    endDate && endDate.trim() !== ''
      ? Timestamp.fromDate(new Date(endDate))
      : undefined

  const travelsRef = collection(db, 'travels')

  // Base document fields common to all travels.
  const docData: Record<string, unknown> = {
    name,
    members: [
      {
        uid,
        displayName,
        // Firestore does not allow serverTimestamp() inside arrays, so we use
        // a client-side timestamp here. This is acceptable for "joinedAt"
        // while keeping createdAt on the travel itself as a server timestamp.
        joinedAt: Timestamp.now(),
      },
    ],
    // memberUids is a flat array of member IDs. Security rules and queries use
    // this for membership checks (array-contains), while `members` keeps
    // richer data like displayName and joinedAt.
    memberUids: [uid],
    createdBy: uid,
    createdAt: serverTimestamp(),
    currencies: [],
  }

  // Only include optional fields when they are non-empty so we don't clutter
  // the document with empty strings.
  if (emoji && emoji.trim() !== '') {
    docData.emoji = emoji.trim()
  }

  if (description && description.trim() !== '') {
    docData.description = description.trim()
  }

  if (startTimestamp) {
    docData.startDate = startTimestamp
  }

  if (endTimestamp) {
    docData.endDate = endTimestamp
  }

  await addDoc(travelsRef, docData)
}

