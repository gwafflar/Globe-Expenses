/**
 * Writes activity entries and sends the pushes that go with them
 * (docs/NOTIFICATIONS_SPEC.md §3).
 *
 *   drafts ──► users/{uid}/activity/{eventId}   always
 *          └─► deliverPush()                    only drafts with a push plan
 */
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import type { ActivityDraft, ActivityEvent } from '../model'
import { deliverPush } from '../push/send'

let cachedDb: Firestore | undefined

/**
 * The Admin Firestore client, configured once per container.
 * `ignoreUndefinedProperties` drops keys whose value is `undefined` (and only
 * those — `false`, `0` and `''` are kept), so optional event fields can be left
 * unset instead of being stripped by hand.
 */
export function db(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore()
    cachedDb.settings({ ignoreUndefinedProperties: true })
  }
  return cachedDb
}

/**
 * Document id for each draft.
 *
 * Idempotency (§3.2): Firestore triggers are delivered AT LEAST once. Using the
 * trigger's event id as the document id means a redelivered trigger overwrites
 * the same document instead of adding a duplicate feed entry. When one trigger
 * yields several entries for the same recipient, the extra ones get a suffix.
 */
export function assignEventIds(eventId: string, drafts: ActivityDraft[]): string[] {
  const seen = new Map<string, number>()
  return drafts.map((d) => {
    const n = seen.get(d.recipientUid) ?? 0
    seen.set(d.recipientUid, n + 1)
    return n === 0 ? eventId : `${eventId}_${n + 1}`
  })
}

/**
 * @param eventId    the Cloud Functions event id of the trigger
 * @param eventTime  when the triggering write happened (ISO string). Used as
 *                   `createdAt`: it is server time, identical across retries,
 *                   and orders the feed by when things actually happened.
 */
export async function publishEvents(eventId: string, eventTime: string, drafts: ActivityDraft[]): Promise<void> {
  if (drafts.length === 0) return
  const firestore = db()
  const createdAt = Timestamp.fromDate(new Date(eventTime))
  const ids = assignEventIds(eventId, drafts)

  // 1. Feed entries first, and independently of any push (§6.2): whatever
  //    happens to the push, the entry exists. Batches are capped at 500 writes.
  for (let i = 0; i < drafts.length; i += 500) {
    const batch = firestore.batch()
    drafts.slice(i, i + 500).forEach((draft, j) => {
      const id = ids[i + j]
      const event: ActivityEvent = { ...draft.body, eventId: id, createdAt }
      batch.set(firestore.doc(`users/${draft.recipientUid}/activity/${id}`), event)
    })
    await batch.commit()
  }

  // 2. Pushes, in parallel. deliverPush never throws.
  const messaging = getMessaging()
  await Promise.all(
    drafts
      .filter((d) => d.push !== null)
      .map((d) => deliverPush(firestore, messaging, d.recipientUid, d.body, d.push!)),
  )
}

/** A user's profile display name, for actors that have no member name to show. */
export async function profileName(uid: string): Promise<string> {
  const snap = await db().doc(`users/${uid}`).get()
  return (snap.data()?.displayName as string | undefined) || 'Someone'
}
