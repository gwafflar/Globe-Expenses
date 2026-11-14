/**
 * Shared types for the notification functions (docs/NOTIFICATIONS_SPEC.md §3.1).
 *
 * `functions/` is a standalone package and cannot import from `../src`, so the
 * few shapes it needs are declared here. Only the fields that notifications
 * actually read are modelled — see mapping.ts for how raw Firestore documents
 * are turned into these.
 */
import type { Timestamp } from 'firebase-admin/firestore'

export type TransactionType = 'expense' | 'withdrawal' | 'adjustment' | 'transfer'

export type ActivityKind =
  | 'tx_created'
  | 'tx_edited'
  | 'tx_deleted'
  | 'tx_removed_from_split' // T5
  | 'transfer_received' // T6
  | 'member_joined' // S1, and F3a for the inviter
  | 'member_left' // S2
  | 'space_deleted' // S3
  | 'space_invite' // F1
  | 'friend_request' // F2
  | 'friend_request_accepted' // F3b
  | 'import_completed' // §7 summary

/** What one member paid / owes on one transaction, in the transaction currency. */
export interface Share {
  paid: number
  owed: number
}

export interface ActorRef {
  uid: string
  /** Snapshot of the name at event time (§3.2): member name in the space for
   *  transaction/space events, profile display name for social events. */
  name: string
}

export interface SpaceRef {
  id: string
  name: string
  emoji?: string
}

export interface TxSnapshot {
  id: string
  name: string
  type: TransactionType
  totalAmount: number
  currency: string
  date: string
}

/**
 * The part of an activity document that the event logic decides.
 * `eventId` and `createdAt` are added by the writer (activity/publish.ts), so
 * the pure logic stays free of Firestore types and is easy to unit-test.
 */
export interface ActivityBody {
  kind: ActivityKind
  actor: ActorRef
  space?: SpaceRef
  importBatchId?: string
  /** F1/F2/F3b — lets the feed link to /invite/:inviteId. */
  inviteId?: string

  // Transaction kinds only
  tx?: TxSnapshot
  myShare?: Share
  myShareBefore?: Share
  changedFields?: string[]
  before?: {
    totalAmount?: number
    currency?: string
    exchangeRate?: number
    type?: TransactionType
  }
  material?: boolean
  /** transfer_received only: the member who sent the money (may differ from the actor). */
  transferFrom?: string

  /** import_completed only. */
  import?: { rowCount: number; involvingMe: number }
}

/** The stored document: users/{uid}/activity/{eventId}. */
export interface ActivityEvent extends ActivityBody {
  eventId: string
  createdAt: Timestamp
  /** Set by the client when the entry is tapped (§3.3). Never written here. */
  openedAt?: Timestamp
}

/** How a push for an event goes through the limiter (§6) and mute check (§9.1). */
export interface PushPlan {
  /** Document id under users/{uid}/pushThrottle: a space id, or `_social`. */
  throttleKey: string
  /** When set, the push is dropped if the recipient muted this space. */
  muteSpaceId?: string
}

/** One activity entry for one recipient, plus whether it should also be pushed. */
export interface ActivityDraft {
  recipientUid: string
  body: ActivityBody
  /** null = feed only. */
  push: PushPlan | null
}

/** Limiter key for events that belong to no space the recipient is in (§6.1). */
export const SOCIAL_THROTTLE_KEY = '_social'

// --- Inputs, mapped from raw Firestore documents (mapping.ts) ----------------

export interface Split {
  travelMemberId: string
  amount: number
}

export interface EventMember {
  travelMemberId: string
  displayName: string
  /** null = unclaimed slot: receives nothing (§5 rule 2). */
  userId: string | null
}

export interface SpaceForEvents {
  id: string
  name: string
  emoji?: string
  members: EventMember[]
  /** Users with access. A recipient must be in here. */
  memberUids: string[]
  /** Invite token written by the last joiner (authorises the join in the rules). */
  pendingInviteId?: string
}

export interface TxForEvents {
  id: string
  name: string
  type: TransactionType
  totalAmount: number
  currency: string
  exchangeRate: number
  date: string
  paidBy: Split[]
  beneficiaries: Split[]
  importBatchId?: string
  /** UID of the last client writer. Emulator-only actor fallback (actor.ts). */
  lastModifiedBy?: string
  /** Cosmetic fields, kept raw: only compared for equality, never interpreted. */
  cosmetic: Record<string, unknown>
}

export interface InviteForEvents {
  id: string
  type: 'friend' | 'travel_member'
  fromUid: string
  fromDisplayName: string
  toUid?: string
  travelId?: string
  travelName?: string
  status: string
  usedBy: string[]
}
