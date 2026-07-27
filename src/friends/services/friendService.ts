// friendService.ts — all Firestore operations for the friend and invite system.
//
// Collections used:
//   invites/{inviteId}               — invite documents
//   users/{uid}/friends/{friendUid}  — bidirectional friend list (each user owns their half)
//   nametags/{tag}                   — uniqueness sentinel (written by userService)

import {
  collection, doc, query, where, limit,
  getDocs, getDoc, setDoc, writeBatch, arrayUnion,
  Timestamp, onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { db } from '@/services/firebase'
import type { UserProfile } from '@/auth/services/userService'
import type { Invite, Friend, SearchUser } from '@/friends/types'
import type { SpaceMember } from '@/spaces/types'

// How long an invite stays active before it expires.
const INVITE_EXPIRY_DAYS = 30

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Searches users by nametag prefix (e.g. typing "ali" finds "@alice", "@aliblue").
 * Firestore range queries on a single field don't require a composite index.
 * Results are limited to 10. The current user is excluded.
 */
export async function searchByNametag(
  searchQuery: string,
  excludeUid: string,
): Promise<SearchUser[]> {
  if (searchQuery.length < 1) return []

  const lower = searchQuery.toLowerCase()

  // Firestore prefix search: docs where nametag starts with `lower`.
  // '\uf8ff' is a very high Unicode code point — it acts as an upper bound
  // so that anything starting with `lower` falls within the range.
  const q = query(
    collection(db, 'users'),
    where('nametag', '>=', lower),
    where('nametag', '<=', lower + '\uf8ff'),
    limit(10),
  )

  const snap = await getDocs(q)

  return snap.docs
    .map(d => d.data() as UserProfile)
    .filter(u => u.uid !== excludeUid && !!u.nametag)
    .map(u => ({ uid: u.uid, displayName: u.displayName, nametag: u.nametag! }))
}

// ---------------------------------------------------------------------------
// Sending a targeted friend request
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fetch a single invite (for the InvitePage)
// ---------------------------------------------------------------------------

/**
 * Reads a single invite document by its ID.
 * Returns null if the document doesn't exist.
 * The InvitePage calls this on mount to validate the link before showing the UI.
 */
export async function getInvite(inviteId: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', inviteId))
  if (!snap.exists()) return null
  return snap.data() as Invite
}

// ---------------------------------------------------------------------------
// Creating a shareable (multi-use) invite link
// ---------------------------------------------------------------------------

/**
 * Creates a multi-use invite link for friend or space member invites.
 * Unlike sendFriendRequest(), this invite has no toUid — anyone with the
 * link can accept it. Returns the new inviteId to build the share URL.
 */
export async function createShareableInvite(
  fromUser: UserProfile,
  // ⚠️ 'travel_member' is a frozen stored value — see Invite.type in friends/types.ts
  type: 'friend' | 'travel_member' = 'friend',
  // Parameter names mirror the frozen Invite.travelId / travelName Firestore keys.
  travelId?: string,
  travelName?: string,
): Promise<string> {
  // doc() on a collection reference auto-generates a random opaque ID
  const inviteRef = doc(collection(db, 'invites'))

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  )

  // We await here (unlike sendFriendRequest) because the caller needs the
  // inviteId to build the URL — it can't proceed until the doc is created.
  await setDoc(inviteRef, {
    inviteId: inviteRef.id,
    type,
    fromUid: fromUser.uid,
    fromDisplayName: fromUser.displayName,
    fromNametag: fromUser.nametag ?? '',
    ...(travelId ? { travelId, travelName: travelName ?? '' } : {}),
    multiUse: true,
    status: 'active',
    usedBy: [],
    createdAt: Timestamp.now(),
    expiresAt,
  })

  return inviteRef.id
}

/**
 * Creates an invite document targeting a specific user (toUid).
 * The invite appears in their "incoming requests" list.
 * multiUse is false — only the target can accept this invite.
 */
export async function sendFriendRequest(
  fromUser: UserProfile,
  toUid: string,
): Promise<void> {
  // doc() with just a collection ref auto-generates a random Firestore ID.
  // This ID will become the opaque token in the invite link for share flows later.
  const inviteRef = doc(collection(db, 'invites'))

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  )

  // Fire-and-forget: we don't await because the invite appears immediately in
  // the recipient's snapshot listener, and we don't block the UI on it.
  const batch = writeBatch(db)
  batch.set(inviteRef, {
    inviteId: inviteRef.id,
    type: 'friend',
    fromUid: fromUser.uid,
    fromDisplayName: fromUser.displayName,
    fromNametag: fromUser.nametag ?? '',
    multiUse: false,
    toUid,
    status: 'active',
    usedBy: [],
    createdAt: Timestamp.now(),
    expiresAt,
  } satisfies Omit<Invite, 'travelId' | 'travelName'>)
  batch.commit()  // fire-and-forget (no await)
}

// ---------------------------------------------------------------------------
// Accepting a friend request
// ---------------------------------------------------------------------------

/**
 * Accepts an incoming friend request.
 * Atomic batch write:
 *   1. Marks the invite as 'accepted' and records the accepter in usedBy
 *   2. Adds the accepter to the sender's friend subcollection
 *   3. Adds the sender to the accepter's friend subcollection
 *
 * Security rules allow step 2 because the accepter (auth.uid) is writing
 * an entry about themselves (friendId == auth.uid, data.uid == auth.uid).
 */
export async function acceptFriendRequest(
  invite: Invite,
  currentUser: UserProfile,
): Promise<void> {
  const now = Timestamp.now()
  const batch = writeBatch(db)

  // 1. Update the invite document.
  //    For multi-use links, status stays 'active' (the link keeps working).
  //    For single-use targeted requests, status → 'accepted' (consumed).
  const inviteRef = doc(db, 'invites', invite.inviteId)
  batch.update(inviteRef, {
    ...(invite.multiUse ? {} : { status: 'accepted' }),
    usedBy: arrayUnion(currentUser.uid),
  })

  // 2. Add current user to the sender's friend list
  //    (security rule allows this: we're writing our own UID into their list)
  const senderFriendRef = doc(db, 'users', invite.fromUid, 'friends', currentUser.uid)
  batch.set(senderFriendRef, {
    uid: currentUser.uid,
    displayName: currentUser.displayName,
    nametag: currentUser.nametag ?? '',
    addedAt: now,
  } satisfies Friend)

  // 3. Add the sender to the current user's friend list
  const myFriendRef = doc(db, 'users', currentUser.uid, 'friends', invite.fromUid)
  batch.set(myFriendRef, {
    uid: invite.fromUid,
    displayName: invite.fromDisplayName,
    nametag: invite.fromNametag ?? '',
    addedAt: now,
  } satisfies Friend)

  await batch.commit()
}

// ---------------------------------------------------------------------------
// Declining a friend request
// ---------------------------------------------------------------------------

/**
 * Declines an incoming invite. Status → 'declined'. No friend entries created.
 * Fire-and-forget — we don't await since the snapshot listener will update the UI.
 */
export async function declineFriendRequest(inviteId: string): Promise<void> {
  const inviteRef = doc(db, 'invites', inviteId)
  const batch = writeBatch(db)
  batch.update(inviteRef, { status: 'declined' })
  batch.commit()  // fire-and-forget
}

// ---------------------------------------------------------------------------
// Space invite: send a targeted invite to an existing friend
// ---------------------------------------------------------------------------

/**
 * Sends a targeted space membership invite to a specific user (must already be a friend).
 * Creates an invite of type 'travel_member' with multiUse=false and toUid set.
 * The recipient sees it in their incoming requests badge on the profile button.
 */
export async function sendSpaceInvite(
  fromUser: UserProfile,
  toUid: string,
  // Parameter names mirror the frozen Invite.travelId / travelName Firestore keys.
  travelId: string,
  travelName: string,
): Promise<void> {
  const inviteRef = doc(collection(db, 'invites'))
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  )
  const batch = writeBatch(db)
  batch.set(inviteRef, {
    inviteId: inviteRef.id,
    type: 'travel_member',
    fromUid: fromUser.uid,
    fromDisplayName: fromUser.displayName,
    fromNametag: fromUser.nametag ?? '',
    travelId,
    travelName,
    multiUse: false,
    toUid,
    status: 'active',
    usedBy: [],
    createdAt: Timestamp.now(),
    expiresAt,
  } satisfies Invite)
  batch.commit()  // fire-and-forget
}

// ---------------------------------------------------------------------------
// Space invite: accept (non-member joins the space)
// ---------------------------------------------------------------------------

/**
 * Result returned by acceptSpaceInvite — used by InvitePage to redirect
 * and, after joining, fetch unclaimed slots for the identity resolution screen.
 */
export interface SpaceInviteResult {
  /** The spaceId so InvitePage can redirect and read the space after joining. */
  spaceId: string
  /**
   * True when the accepter was already in `memberUids` before this call — no new
   * SpaceMember slot was created. InvitePage uses this to skip the identity-pick
   * screen (there is nothing new to claim).
   */
  alreadyMember: boolean
}

/**
 * Accepts a travel_member invite.
 *
 * First attempts a pre-read of the space document to detect "already a member"
 * (e.g. a targeted invite sent to someone who already joined this space some
 * other way, or the link being reused). The Firestore rule only allows this
 * read once auth.uid is already in memberUids, so a genuine new member gets a
 * permission-denied error here — expected, not a bug — and we fall through to
 * the normal join path. arrayUnion on memberUids is also idempotent on its own,
 * so double-accepting the same invite was always safe; this pre-read closes the
 * separate case of ending up with two SpaceMember slots for the same person.
 *
 * Core batch (atomic — must succeed together):
 *   1. Marks the invite as used (usedBy or status)
 *   2. If not already a member: adds the accepter as a new SpaceMember slot and
 *      appends their UID to memberUids. The Firestore rule verifies the invite
 *      via get() using pendingInviteId. If already a member, this step is skipped
 *      — only the invite is marked used.
 *
 * After the batch, the caller (InvitePage) reads the space to fetch unclaimed slots —
 * that read is now permitted because the user is in memberUids.
 *
 * Friendship writes are intentionally kept outside the batch (fire-and-forget).
 * They are idempotent (set() overwrites safely if already friends) and must not
 * block the space join — if they fail, the user is still in the space.
 *
 * The `pendingInviteId` field written to the space doc is used solely for
 * security rule verification — it has no other semantic meaning and can be
 * ignored by the UI.
 */
export async function acceptSpaceInvite(
  invite: Invite,
  currentUser: UserProfile,
): Promise<SpaceInviteResult> {
  if (!invite.travelId) throw new Error('Invite missing travelId')

  const spaceRef = doc(db, 'travels', invite.travelId)

  // Detect "already a member" up front.
  // The Firestore rule only allows reading a space doc once auth.uid is in
  // memberUids, so this read succeeds ONLY if the user already joined before
  // (e.g. re-clicking a link, or a targeted invite sent after they'd already
  // joined some other way). A genuinely new member gets a permission-denied
  // error here — that's the expected, non-error path, so we swallow it and
  // fall through to the normal join batch below.
  let alreadyMember = false
  try {
    const existingSnap = await getDoc(spaceRef)
    const existingUids: string[] = existingSnap.data()?.memberUids ?? []
    alreadyMember = existingUids.includes(currentUser.uid)
  } catch {
    alreadyMember = false
  }

  // ── Core batch ─────────────────────────────────────────────────────────────
  const now = Timestamp.now()
  const batch = writeBatch(db)

  // 1. Update the invite
  const inviteRef = doc(db, 'invites', invite.inviteId)
  batch.update(inviteRef, {
    ...(invite.multiUse ? {} : { status: 'accepted' }),
    usedBy: arrayUnion(currentUser.uid),
  })

  if (!alreadyMember) {
    // 2. Add the accepter as a new SpaceMember slot.
    //    travelMemberId is a fresh nanoid — stable key for future Split[] references.
    //    arrayUnion on members: Firestore will merge this object into the array.
    //    pendingInviteId: read by the security rule to authorise the non-member write.
    const newMember: SpaceMember = {
      travelMemberId: nanoid(),
      displayName: currentUser.displayName,
      userId: currentUser.uid,
      allowRename: true,
      joinedAt: now,
    }

    batch.update(spaceRef, {
      members: arrayUnion({
        travelMemberId: newMember.travelMemberId,
        displayName: newMember.displayName,
        userId: newMember.userId,
        allowRename: newMember.allowRename,
        joinedAt: now,
      }),
      memberUids: arrayUnion(currentUser.uid),
      // pendingInviteId is read by the security rule to authorise the non-member write
      pendingInviteId: invite.inviteId,
    })
  }
  // else: user is already in memberUids/members — only the invite is marked used,
  // no duplicate SpaceMember slot is created.

  // Core join must be atomic — await the batch.
  await batch.commit()

  // 3. Create friendship outside the batch (fire-and-forget, idempotent).
  //    Kept separate so an existing-friendship edge case can never block the space join.
  const senderFriendRef = doc(db, 'users', invite.fromUid, 'friends', currentUser.uid)
  setDoc(senderFriendRef, {
    uid: currentUser.uid,
    displayName: currentUser.displayName,
    nametag: currentUser.nametag ?? '',
    addedAt: now,
  } satisfies Friend).catch((err) =>
    console.warn('[friendService] acceptSpaceInvite: senderFriend write failed', err),
  )

  const myFriendRef = doc(db, 'users', currentUser.uid, 'friends', invite.fromUid)
  setDoc(myFriendRef, {
    uid: invite.fromUid,
    displayName: invite.fromDisplayName,
    nametag: invite.fromNametag ?? '',
    addedAt: now,
  } satisfies Friend).catch((err) =>
    console.warn('[friendService] acceptSpaceInvite: myFriend write failed', err),
  )

  return { spaceId: invite.travelId, alreadyMember }
}

// ---------------------------------------------------------------------------
// Real-time listener for incoming requests
// ---------------------------------------------------------------------------

/**
 * Subscribes to all 'active' invites targeting the current user.
 * Returns an unsubscribe function (call it in a useEffect cleanup).
 * Requires a composite index: invites / toUid ASC + status ASC + createdAt DESC.
 */
export function subscribeToIncomingRequests(
  uid: string,
  onChange: (invites: Invite[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'invites'),
    where('toUid', '==', uid),
    where('status', '==', 'active'),
  )

  // onSnapshot fires immediately with current data, then on every change.
  return onSnapshot(q, snap => {
    const invites = snap.docs.map(d => d.data() as Invite)
    onChange(invites)
  })
}

// ---------------------------------------------------------------------------
// Fetch friend list (one-time)
// ---------------------------------------------------------------------------

/**
 * Fetches the current user's friend list from the friends subcollection.
 * One-time read — not a real-time listener. Call on component mount or after
 * an action that changes the friend list.
 */
export async function fetchFriends(uid: string): Promise<Friend[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'friends'))
  return snap.docs.map(d => d.data() as Friend)
}
