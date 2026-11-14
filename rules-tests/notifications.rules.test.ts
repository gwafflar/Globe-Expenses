/**
 * Security-rules tests for the notification paths under users/{uid}
 * (docs/NOTIFICATIONS_SPEC.md §3.4, §3.5).
 *
 * Runs against the Firestore emulator: `pnpm test:rules`.
 *
 * How these tests work: `@firebase/rules-unit-testing` gives us Firestore
 * clients that act as a given signed-in user (or as nobody). Every read/write
 * goes through firestore.rules exactly as in production. `assertSucceeds` /
 * `assertFails` check whether the RULES allowed the operation.
 * `withSecurityRulesDisabled` seeds data the way the Admin SDK (Cloud
 * Functions) would — bypassing the rules.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // `demo-` prefix: the emulator treats it as a fake project that can never
    // touch real Google Cloud resources.
    projectId: 'demo-globe-expenses',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

// Clients acting as a signed-in user / as an unauthenticated visitor.
// The rules-unit-testing Firestore type is structurally the modular one.
const asUser = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const asGuest = () => env.unauthenticatedContext().firestore() as unknown as Firestore

/** Writes a document with rules disabled — what a Cloud Function would do. */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data)
  })
}

// ---------------------------------------------------------------------------
// users/{uid}/activity/{eventId}
// ---------------------------------------------------------------------------
describe('activity', () => {
  const path = 'users/alice/activity/evt1'

  beforeEach(async () => {
    await seed(path, {
      eventId: 'evt1',
      kind: 'tx_created',
      createdAt: Timestamp.now(),
      actor: { uid: 'bob', name: 'Bob' },
    })
  })

  it('owner can read a single entry and list their feed', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), path)))
    await assertSucceeds(getDocs(collection(asUser('alice'), 'users/alice/activity')))
  })

  it('another user and a guest cannot read it', async () => {
    await assertFails(getDoc(doc(asUser('bob'), path)))
    await assertFails(getDocs(collection(asUser('bob'), 'users/alice/activity')))
    await assertFails(getDoc(doc(asGuest(), path)))
  })

  it('owner can set openedAt (client timestamp or serverTimestamp)', async () => {
    await assertSucceeds(updateDoc(doc(asUser('alice'), path), { openedAt: Timestamp.now() }))
    await assertSucceeds(updateDoc(doc(asUser('alice'), path), { openedAt: serverTimestamp() }))
  })

  it('owner cannot change any other field, even alongside openedAt', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), path), { kind: 'tx_deleted' }))
    await assertFails(
      updateDoc(doc(asUser('alice'), path), { openedAt: Timestamp.now(), kind: 'tx_deleted' }),
    )
  })

  it('openedAt must be a timestamp', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), path), { openedAt: 'yesterday' }))
  })

  it('nobody can create or delete entries from the client (Cloud Functions only)', async () => {
    await assertFails(
      setDoc(doc(asUser('alice'), 'users/alice/activity/forged'), { kind: 'tx_created' }),
    )
    await assertFails(deleteDoc(doc(asUser('alice'), path)))
  })

  it('another user cannot mark it as read', async () => {
    await assertFails(updateDoc(doc(asUser('bob'), path), { openedAt: Timestamp.now() }))
  })
})

// ---------------------------------------------------------------------------
// users/{uid}/fcmTokens/{token}
// ---------------------------------------------------------------------------
describe('fcmTokens', () => {
  const path = 'users/alice/fcmTokens/tok-123'

  it('owner can register, re-register (update), read and delete a token', async () => {
    const db = asUser('alice')
    await assertSucceeds(setDoc(doc(db, path), { createdAt: Timestamp.now() }))
    await assertSucceeds(setDoc(doc(db, path), { createdAt: Timestamp.now() }))
    await assertSucceeds(getDoc(doc(db, path)))
    await assertSucceeds(deleteDoc(doc(db, path)))
  })

  it('another user cannot register a token for someone else, or read theirs', async () => {
    await assertFails(setDoc(doc(asUser('bob'), path), { createdAt: Timestamp.now() }))
    await seed(path, { createdAt: Timestamp.now() })
    await assertFails(getDoc(doc(asUser('bob'), path)))
    await assertFails(deleteDoc(doc(asUser('bob'), path)))
  })

  it('a guest cannot register a token', async () => {
    await assertFails(setDoc(doc(asGuest(), path), { createdAt: Timestamp.now() }))
  })
})

// ---------------------------------------------------------------------------
// users/{uid}/pushThrottle/{key}
// ---------------------------------------------------------------------------
describe('pushThrottle', () => {
  const path = 'users/alice/pushThrottle/space1'

  it('owner can create a counter at 0', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), path), { count: 0 }, { merge: true }))
  })

  it('owner cannot create a counter with any other value or field', async () => {
    await assertFails(setDoc(doc(asUser('alice'), path), { count: 5 }))
    await assertFails(setDoc(doc(asUser('alice'), path), { count: 0, lastEventAt: Timestamp.now() }))
  })

  describe('existing counter (written by the Cloud Function)', () => {
    beforeEach(async () => {
      await seed(path, { count: 3, lastEventAt: Timestamp.now() })
    })

    it('owner can reset count to 0 with a merge write', async () => {
      await assertSucceeds(setDoc(doc(asUser('alice'), path), { count: 0 }, { merge: true }))
    })

    it('a non-merge set is refused, because it would erase lastEventAt', async () => {
      await assertFails(setDoc(doc(asUser('alice'), path), { count: 0 }))
    })

    it('owner cannot set count to anything but 0, or touch lastEventAt', async () => {
      await assertFails(updateDoc(doc(asUser('alice'), path), { count: 1 }))
      await assertFails(updateDoc(doc(asUser('alice'), path), { lastEventAt: Timestamp.now() }))
    })

    it('the client never reads or deletes the counter', async () => {
      await assertFails(getDoc(doc(asUser('alice'), path)))
      await assertFails(deleteDoc(doc(asUser('alice'), path)))
    })

    it('another user cannot reset it', async () => {
      await assertFails(setDoc(doc(asUser('bob'), path), { count: 0 }, { merge: true }))
    })
  })
})

// ---------------------------------------------------------------------------
// users/{uid}/private/notifications
// ---------------------------------------------------------------------------
describe('private/notifications', () => {
  const path = 'users/alice/private/notifications'

  it('owner can create, update and read it, with serverTimestamp watermarks', async () => {
    const db = asUser('alice')
    await assertSucceeds(setDoc(doc(db, path), { mutedSpaceIds: ['space1'] }))
    await assertSucceeds(
      updateDoc(doc(db, path), {
        activityLastSeenAt: serverTimestamp(),
        activityReadAllAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(getDoc(doc(db, path)))
  })

  it('unknown fields are refused', async () => {
    await assertFails(setDoc(doc(asUser('alice'), path), { mutedSpaceIds: [], somethingElse: 1 }))
  })

  it('owner cannot delete it', async () => {
    await seed(path, { mutedSpaceIds: [] })
    await assertFails(deleteDoc(doc(asUser('alice'), path)))
  })

  it('other documents under private/ are not writable', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'users/alice/private/other'), {}))
  })

  it('another user cannot read it, although they CAN read the public profile', async () => {
    // This asymmetry is the reason the private doc exists (spec §3.5).
    await seed('users/alice', { displayName: 'Alice' })
    await seed(path, { mutedSpaceIds: ['space1'] })
    await assertSucceeds(getDoc(doc(asUser('bob'), 'users/alice')))
    await assertFails(getDoc(doc(asUser('bob'), path)))
    await assertFails(setDoc(doc(asUser('bob'), path), { mutedSpaceIds: [] }))
  })
})

describe('private/notifications — space mute toggle', () => {
  const path = 'users/alice/private/notifications'

  it('muting with a merge + arrayUnion works on a missing AND an existing document', async () => {
    // This is exactly what setSpaceMuted() does (src/notifications/services/notificationPrefs.ts).
    const db = asUser('alice')
    await assertSucceeds(setDoc(doc(db, path), { mutedSpaceIds: arrayUnion('space1') }, { merge: true }))
    await assertSucceeds(setDoc(doc(db, path), { mutedSpaceIds: arrayUnion('space2') }, { merge: true }))
    await assertSucceeds(setDoc(doc(db, path), { mutedSpaceIds: arrayRemove('space1') }, { merge: true }))
  })
})

// ---------------------------------------------------------------------------
// travels/{spaceId}/importBatches/{importBatchId}  (spec §7)
// ---------------------------------------------------------------------------
describe('importBatches', () => {
  const path = 'travels/space1/importBatches/batch1'

  beforeEach(async () => {
    await seed('travels/space1', { name: 'Japan', memberUids: ['alice', 'bob'] })
  })

  it('a member can create the marker naming themselves', async () => {
    await assertSucceeds(
      setDoc(doc(asUser('alice'), path), { createdBy: 'alice', rowCount: 120, createdAt: serverTimestamp() }),
    )
  })

  it('a member cannot name someone else as the importer', async () => {
    // The Cloud Function trusts createdBy as the actor (never notified).
    await assertFails(
      setDoc(doc(asUser('alice'), path), { createdBy: 'bob', rowCount: 120, createdAt: serverTimestamp() }),
    )
  })

  it('unknown fields are refused', async () => {
    await assertFails(
      setDoc(doc(asUser('alice'), path), { createdBy: 'alice', rowCount: 1, createdAt: serverTimestamp(), extra: 1 }),
    )
  })

  it('a non-member cannot create one', async () => {
    await assertFails(
      setDoc(doc(asUser('mallory'), path), { createdBy: 'mallory', rowCount: 1, createdAt: serverTimestamp() }),
    )
    await assertFails(
      setDoc(doc(asGuest(), path), { createdBy: 'alice', rowCount: 1, createdAt: serverTimestamp() }),
    )
  })

  it('nobody can read, update or delete it', async () => {
    await seed(path, { createdBy: 'alice', rowCount: 1, createdAt: Timestamp.now() })
    await assertFails(getDoc(doc(asUser('alice'), path)))
    await assertFails(updateDoc(doc(asUser('alice'), path), { rowCount: 2 }))
    await assertFails(deleteDoc(doc(asUser('alice'), path)))
  })
})
