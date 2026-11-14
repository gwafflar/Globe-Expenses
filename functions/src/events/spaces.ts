/**
 * Space & member events (catalogue S1–S4 and F3a, docs/NOTIFICATIONS_SPEC.md §4).
 * PURE — see events/transactions.ts for why.
 */
import type { ActivityDraft, ActorRef, SpaceForEvents } from '../model'
import { spaceRef } from './transactions'

/** Users who gained / lost access between two versions of a space document. */
export function diffMemberUids(before: SpaceForEvents, after: SpaceForEvents) {
  return {
    joined: after.memberUids.filter((uid) => !before.memberUids.includes(uid)),
    left: before.memberUids.filter((uid) => !after.memberUids.includes(uid)),
  }
}

/** The name a user goes by in a space: the display name of the slot they claimed. */
export function memberNameOf(space: SpaceForEvents, uid: string): string | undefined {
  return space.members.find((m) => m.userId === uid)?.displayName || undefined
}

/**
 * Events for an update of the space document.
 *
 * Only a change of `memberUids` matters:
 *  - S1 `member_joined`: someone gained access (accepted an invite). Feed only,
 *    except for the INVITER, who also gets a push (F3a).
 *  - S2 `member_left`: someone left. Feed only.
 *  - S4 (settings, lists, renames, claiming another slot): no event.
 *
 * Claiming a slot is deliberately not an event of its own: a join already
 * creates a claimed slot, and the "which member am I?" step that follows would
 * otherwise announce the same person twice.
 *
 * The subject (joiner / leaver) is also the writer — the app only lets users
 * join or leave for themselves — so no auth context is needed here.
 *
 * @param inviterUid     who created the invite the joiner used, if known
 * @param fallbackNames  profile names for subjects that own no slot
 */
export function buildSpaceUpdateEvents(
  before: SpaceForEvents,
  after: SpaceForEvents,
  inviterUid: string | null,
  fallbackNames: Record<string, string> = {},
): ActivityDraft[] {
  const { joined, left } = diffMemberUids(before, after)
  const drafts: ActivityDraft[] = []
  const sp = spaceRef(after)

  for (const uid of joined) {
    // The joiner's slot exists in `after` (created by the join itself).
    const actor: ActorRef = { uid, name: memberNameOf(after, uid) ?? fallbackNames[uid] ?? 'Someone' }
    for (const recipient of after.memberUids) {
      if (joined.includes(recipient)) continue // never the joiner(s) themselves
      drafts.push({
        recipientUid: recipient,
        body: { kind: 'member_joined', actor, space: sp },
        // F3a: "my space invite was accepted" pushes to the inviter only.
        push: recipient === inviterUid ? { throttleKey: after.id, muteSpaceId: after.id } : null,
      })
    }
  }

  for (const uid of left) {
    // Leaving unclaims the slot, so the name must come from `before`.
    const actor: ActorRef = { uid, name: memberNameOf(before, uid) ?? fallbackNames[uid] ?? 'Someone' }
    for (const recipient of after.memberUids) {
      drafts.push({
        recipientUid: recipient,
        body: { kind: 'member_left', actor, space: sp },
        push: null,
      })
    }
  }

  return drafts
}

/**
 * S3: ONE event per former member when a space is deleted (§5 rule 5) — never
 * one per transaction. `space` is the deleted document's last content.
 */
export function buildSpaceDeletedEvents(space: SpaceForEvents, actor: ActorRef): ActivityDraft[] {
  return space.memberUids
    .filter((uid) => uid !== actor.uid)
    .map((uid) => ({
      recipientUid: uid,
      body: { kind: 'space_deleted' as const, actor, space: spaceRef(space) },
      push: { throttleKey: space.id, muteSpaceId: space.id },
    }))
}
