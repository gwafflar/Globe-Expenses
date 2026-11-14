/**
 * Social events from the `invites/` collection (catalogue F1, F2, F3b,
 * docs/NOTIFICATIONS_SPEC.md §4). PURE — see events/transactions.ts for why.
 *
 * F3a ("my space invite was accepted") is NOT handled here: it is the
 * `member_joined` event of events/spaces.ts, raised by the space document
 * gaining a member. An invite can be marked used without anyone joining
 * (accepter was already a member), so the space is the reliable source.
 */
import { SOCIAL_THROTTLE_KEY, type ActivityDraft, type InviteForEvents } from '../model'

/** Social events use the sender's PROFILE name: the recipient may not be in the space (§3.2). */
function senderName(invite: InviteForEvents): string {
  return invite.fromDisplayName || 'Someone'
}

/**
 * F1 / F2: a targeted invite was created.
 * Shareable links have no `toUid`, so nobody can be notified about them.
 *
 * @param spaceEmoji  emoji of the space, for F1 (the invite only stores its name)
 */
export function buildInviteCreatedEvents(invite: InviteForEvents, spaceEmoji?: string): ActivityDraft[] {
  if (!invite.toUid || invite.toUid === invite.fromUid || invite.status !== 'active') return []
  const actor = { uid: invite.fromUid, name: senderName(invite) }
  // Both use the shared `_social` limiter key (§6.1) and no mute check: the
  // recipient is not a member of the space yet, so they cannot have muted it.
  const push = { throttleKey: SOCIAL_THROTTLE_KEY }

  if (invite.type === 'travel_member') {
    if (!invite.travelId) return []
    return [
      {
        recipientUid: invite.toUid,
        body: {
          kind: 'space_invite',
          actor,
          space: { id: invite.travelId, name: invite.travelName ?? '', emoji: spaceEmoji },
          inviteId: invite.id,
        },
        push,
      },
    ]
  }

  return [
    {
      recipientUid: invite.toUid,
      body: { kind: 'friend_request', actor, inviteId: invite.id },
      push,
    },
  ]
}

/** Users newly added to `usedBy` between two versions of an invite. */
export function newAccepters(before: InviteForEvents, after: InviteForEvents): string[] {
  return after.usedBy.filter((uid) => !before.usedBy.includes(uid))
}

/**
 * F3b: a FRIEND invite (targeted request or shareable link) was accepted.
 * The sender gets a feed entry, no push.
 *
 * @param accepterNames  profile display names of the new accepters
 */
export function buildInviteAcceptedEvents(
  before: InviteForEvents,
  after: InviteForEvents,
  accepterNames: Record<string, string>,
): ActivityDraft[] {
  if (after.type !== 'friend') return []
  return newAccepters(before, after)
    .filter((uid) => uid !== after.fromUid)
    .map((uid) => ({
      recipientUid: after.fromUid,
      body: {
        kind: 'friend_request_accepted' as const,
        actor: { uid, name: accepterNames[uid] || 'Someone' },
        inviteId: after.id,
      },
      push: null,
    }))
}
