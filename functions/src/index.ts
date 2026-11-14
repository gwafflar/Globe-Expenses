/**
 * Cloud Functions entry point.
 *
 * Every function exported from this file is deployed. The runtime loads the
 * compiled `lib/index.js` (see "main" in package.json), so run `pnpm build`
 * before starting the emulator or deploying (firebase.json's predeploy does it).
 *
 * Design: docs/NOTIFICATIONS_SPEC.md.
 *
 * Shape of every trigger below (a "trigger" is a function Firebase runs for us
 * each time a matching document is written):
 *
 *   1. map the raw documents          (mapping.ts)
 *   2. work out events + recipients   (events/*.ts — pure, unit-tested)
 *   3. write feed entries, send pushes (activity/publish.ts, push/send.ts)
 *
 * The wrappers here only do the reading and the wiring.
 */
import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'
import {
  onDocumentCreated,
  onDocumentDeletedWithAuthContext,
  onDocumentUpdated,
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
} from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import { db, profileName, publishEvents } from './activity/publish'
import { resolveActorUid } from './actor'
import { buildImportEvents } from './events/imports'
import { buildInviteAcceptedEvents, buildInviteCreatedEvents, newAccepters } from './events/invites'
import { buildSpaceDeletedEvents, buildSpaceUpdateEvents, diffMemberUids, memberNameOf } from './events/spaces'
import { buildTransactionEvents, type TxChange } from './events/transactions'
import { mapInviteForEvents, mapSpaceForEvents, mapTxForEvents } from './mapping'
import type { ActorRef, SpaceForEvents } from './model'

// Admin SDK: uses the function's service account, so it BYPASSES Firestore
// security rules. Called once per container (module scope), not per event.
initializeApp()

// Applies to every function in this codebase.
//  - region: Firestore triggers must run in the database's region (europe-west4);
//    a mismatch makes the deploy fail.
//  - maxInstances: cost guardrail — a runaway trigger loop cannot scale past 10
//    containers. minInstances stays at its default 0 (no idle cost; the first
//    event after a quiet period pays a 1–3 s cold start, fine for notifications).
setGlobalOptions({ region: 'europe-west4', maxInstances: 10 })

/** The actor as shown in a space: their member name there, else their profile name (§3.2). */
async function actorInSpace(space: SpaceForEvents, uid: string): Promise<ActorRef> {
  return { uid, name: memberNameOf(space, uid) ?? (await profileName(uid)) }
}

// ---------------------------------------------------------------------------
// Transactions — T1 … T7
// ---------------------------------------------------------------------------

/**
 * Fires on every create, update and delete of a transaction.
 * Path uses the legacy collection name `travels/` (frozen, see CLAUDE.md).
 */
export const onTransactionWritten = onDocumentWrittenWithAuthContext(
  'travels/{spaceId}/transactions/{txId}',
  async (event) => {
    const { spaceId, txId } = event.params
    const beforeSnap = event.data?.before
    const afterSnap = event.data?.after
    const before = beforeSnap?.exists ? mapTxForEvents(txId, beforeSnap.data() ?? {}) : null
    const after = afterSnap?.exists ? mapTxForEvents(txId, afterSnap.data() ?? {}) : null

    // No end user behind the write (e.g. the Admin-SDK cascade of
    // onTravelDeleted below): nothing to report. Checked first — it is free.
    const actorUid = resolveActorUid(event.authType, event.authId, (after ?? before)?.lastModifiedBy)
    if (!actorUid) return

    // The space is needed to map travelMemberId → user. If it no longer exists
    // the transaction is being swept up after a space deletion, which already
    // produced its single `space_deleted` event (§5 rule 5): stay silent.
    const spaceSnap = await db().doc(`travels/${spaceId}`).get()
    if (!spaceSnap.exists) return
    const space = mapSpaceForEvents(spaceId, spaceSnap.data() ?? {})

    let change: TxChange
    if (before && after) change = { type: 'update', before, after }
    else if (after) change = { type: 'create', after }
    else if (before) change = { type: 'delete', before }
    else return

    const drafts = buildTransactionEvents(change, space, await actorInSpace(space, actorUid))
    await publishEvents(event.id, event.time, drafts)
  },
)

// ---------------------------------------------------------------------------
// Space & members — S1, S2, F3a
// ---------------------------------------------------------------------------

/**
 * Fires on every update of a space document. Almost all of them are settings
 * changes (S4, no event) and return at the first check.
 */
export const onSpaceUpdated = onDocumentUpdated('travels/{spaceId}', async (event) => {
  if (!event.data) return
  const { spaceId } = event.params
  const before = mapSpaceForEvents(spaceId, event.data.before.data())
  const after = mapSpaceForEvents(spaceId, event.data.after.data())

  const { joined, left } = diffMemberUids(before, after)
  if (joined.length === 0 && left.length === 0) return

  // F3a: whose invite did the joiner use? The join write carries the invite
  // token in `pendingInviteId` (it is what authorises the join in the rules).
  let inviterUid: string | null = null
  if (joined.length > 0 && after.pendingInviteId) {
    const invite = await db().doc(`invites/${after.pendingInviteId}`).get()
    inviterUid = (invite.data()?.fromUid as string | undefined) ?? null
  }

  // Profile names for the rare subject that owns no slot in the space.
  const fallbackNames: Record<string, string> = {}
  for (const uid of joined) if (!memberNameOf(after, uid)) fallbackNames[uid] = await profileName(uid)
  for (const uid of left) if (!memberNameOf(before, uid)) fallbackNames[uid] = await profileName(uid)

  await publishEvents(event.id, event.time, buildSpaceUpdateEvents(before, after, inviterUid, fallbackNames))
})

/**
 * Space deleted — S3, plus the server-side cascade (§5 rule 5).
 *
 * Firestore does not delete subcollections with their parent. The client now
 * deletes ONLY the space document; this function removes everything under it
 * with the Admin SDK. Each cascaded transaction delete fires
 * onTransactionWritten, which finds no end-user actor and no parent space and
 * therefore emits nothing: one `space_deleted` event, not one per transaction.
 */
export const onTravelDeleted = onDocumentDeletedWithAuthContext(
  // A large space takes a while to sweep; the default timeout is 60 s.
  { document: 'travels/{spaceId}', timeoutSeconds: 300 },
  async (event) => {
    if (!event.data) return
    const { spaceId } = event.params
    const data = event.data.data() ?? {}
    const space = mapSpaceForEvents(spaceId, data)

    // Events first: they are quick, and should not wait for a long cascade.
    const actorUid = resolveActorUid(event.authType, event.authId, data.createdBy as string | undefined)
    if (actorUid) {
      await publishEvents(event.id, event.time, buildSpaceDeletedEvents(space, await actorInSpace(space, actorUid)))
    }

    // recursiveDelete on a document reference removes every subcollection under
    // it (transactions, importBatches), in batches, with no 500-write cap.
    await db().recursiveDelete(event.data.ref)
    logger.info('space deleted: subcollections removed', { spaceId })
  },
)

// ---------------------------------------------------------------------------
// Invites & friends — F1, F2, F3b
// ---------------------------------------------------------------------------

export const onInviteWritten = onDocumentWritten('invites/{inviteId}', async (event) => {
  const { inviteId } = event.params
  const beforeSnap = event.data?.before
  const afterSnap = event.data?.after
  if (!afterSnap?.exists) return // revoked (deleted): no event
  const after = mapInviteForEvents(inviteId, afterSnap.data() ?? {})

  if (!beforeSnap?.exists) {
    // Created: F1 (space invite) or F2 (friend request), for targeted invites only.
    if (!after.toUid) return
    let emoji: string | undefined
    if (after.type === 'travel_member' && after.travelId) {
      const space = await db().doc(`travels/${after.travelId}`).get()
      emoji = (space.data()?.emoji as string | undefined) || undefined
    }
    await publishEvents(event.id, event.time, buildInviteCreatedEvents(after, emoji))
    return
  }

  // Updated: F3b when a friend invite gained an accepter.
  const before = mapInviteForEvents(inviteId, beforeSnap.data() ?? {})
  if (after.type !== 'friend') return
  const names: Record<string, string> = {}
  for (const uid of newAccepters(before, after)) names[uid] = await profileName(uid)
  await publishEvents(event.id, event.time, buildInviteAcceptedEvents(before, after, names))
})

// ---------------------------------------------------------------------------
// Imports — §7
// ---------------------------------------------------------------------------

/**
 * The importer writes this document AFTER its last batch of rows committed, so
 * it fires exactly once per import. Recipients and counts come from a server
 * query, never from what the client wrote in the document.
 */
export const onImportBatchCreated = onDocumentCreated(
  'travels/{spaceId}/importBatches/{importBatchId}',
  async (event) => {
    if (!event.data) return
    const { spaceId, importBatchId } = event.params
    // The security rules only allow creating this document with
    // createdBy == the writer's own uid, so it is a trustworthy actor.
    const actorUid = event.data.data().createdBy as string | undefined
    if (!actorUid) return

    const spaceSnap = await db().doc(`travels/${spaceId}`).get()
    if (!spaceSnap.exists) return
    const space = mapSpaceForEvents(spaceId, spaceSnap.data() ?? {})

    const rows = await db()
      .collection(`travels/${spaceId}/transactions`)
      .where('importBatchId', '==', importBatchId)
      .get()
    const txs = rows.docs.map((d) => mapTxForEvents(d.id, d.data()))

    const drafts = buildImportEvents(importBatchId, txs, space, await actorInSpace(space, actorUid))
    await publishEvents(event.id, event.time, drafts)
  },
)
