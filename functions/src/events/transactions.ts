/**
 * Transaction events (catalogue T1–T7, docs/NOTIFICATIONS_SPEC.md §4–§5).
 *
 * PURE: no Firestore, no clock, no I/O. Given what changed, the space and who
 * did it, returns one draft per recipient. The trigger wrapper (index.ts) does
 * the reading and writing, which keeps every rule below unit-testable.
 */
import type {
  ActivityBody,
  ActivityDraft,
  ActorRef,
  Share,
  SpaceForEvents,
  SpaceRef,
  Split,
  TxForEvents,
  TxSnapshot,
} from '../model'

export type TxChange =
  | { type: 'create'; after: TxForEvents }
  | { type: 'update'; before: TxForEvents; after: TxForEvents }
  | { type: 'delete'; before: TxForEvents }

/** Amounts are entered at 2 dp (3 dp internally for equal splits): half a cent is noise. */
const AMOUNT_EPSILON = 0.005

const round2 = (n: number) => Math.round(n * 100) / 100

export function spaceRef(space: SpaceForEvents): SpaceRef {
  return { id: space.id, name: space.name, emoji: space.emoji }
}

function txSnapshot(tx: TxForEvents): TxSnapshot {
  return {
    id: tx.id,
    name: tx.name,
    type: tx.type,
    totalAmount: tx.totalAmount,
    currency: tx.currency,
    date: tx.date,
  }
}

/** Sum of amounts per member, so the order of a split array never matters. */
function totalsByMember(splits: Split[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const s of splits) totals.set(s.travelMemberId, (totals.get(s.travelMemberId) ?? 0) + s.amount)
  return totals
}

function sameSplits(a: Split[], b: Split[]): boolean {
  const ta = totalsByMember(a)
  const tb = totalsByMember(b)
  for (const id of new Set([...ta.keys(), ...tb.keys()])) {
    if (Math.abs((ta.get(id) ?? 0) - (tb.get(id) ?? 0)) > AMOUNT_EPSILON) return false
  }
  return true
}

/**
 * Members a transaction involves: anyone listed as payer or beneficiary with a
 * non-zero amount. On a zero-total transaction every amount is 0, so being
 * listed is enough.
 */
export function involvedMemberIds(tx: TxForEvents): Set<string> {
  const zeroTotal = Math.abs(tx.totalAmount) <= AMOUNT_EPSILON
  const ids = new Set<string>()
  for (const s of [...tx.paidBy, ...tx.beneficiaries]) {
    if (!s.travelMemberId) continue
    if (zeroTotal || Math.abs(s.amount) > AMOUNT_EPSILON) ids.add(s.travelMemberId)
  }
  return ids
}

/** What the given slots paid / owe on a transaction, in its currency. */
export function shareOf(tx: TxForEvents, memberIds: Set<string>): Share {
  const sum = (splits: Split[]) =>
    round2(splits.filter((s) => memberIds.has(s.travelMemberId)).reduce((acc, s) => acc + s.amount, 0))
  return { paid: sum(tx.paidBy), owed: sum(tx.beneficiaries) }
}

/**
 * Who gets an event: the Auth users behind the involved slots (§5 rules 1–2).
 *  - unclaimed slots (userId null) receive nothing;
 *  - the actor is never notified;
 *  - the user must still have access to the space (be in memberUids).
 * Returns uid → that user's slot ids (normally exactly one).
 */
export function resolveRecipients(
  space: SpaceForEvents,
  memberIds: Set<string>,
  actorUid: string,
): Map<string, Set<string>> {
  const recipients = new Map<string, Set<string>>()
  for (const m of space.members) {
    if (!m.userId || m.userId === actorUid) continue
    if (!memberIds.has(m.travelMemberId)) continue
    if (!space.memberUids.includes(m.userId)) continue
    const slots = recipients.get(m.userId) ?? new Set<string>()
    slots.add(m.travelMemberId)
    recipients.set(m.userId, slots)
  }
  return recipients
}

export interface TxDiff {
  /** Every changed field, material first. Empty = nothing a user would notice. */
  changedFields: string[]
  /** True when the change shifts what someone owes (§5 rule 3). */
  material: boolean
  /** Previous values of the material scalar fields that changed. */
  before: NonNullable<ActivityBody['before']>
}

/**
 * Field-level diff of an edit (§5 rule 3).
 * Material: totalAmount, currency, exchangeRate, type, payers, beneficiaries.
 * Cosmetic: everything in COSMETIC_FIELDS (mapping.ts).
 * Bookkeeping fields (lastModifiedAt/By, totalAmountMain, importBatchId) are ignored.
 */
export function diffTransaction(before: TxForEvents, after: TxForEvents): TxDiff {
  const changed: string[] = []
  const prev: TxDiff['before'] = {}

  if (Math.abs(before.totalAmount - after.totalAmount) > AMOUNT_EPSILON) {
    changed.push('totalAmount')
    prev.totalAmount = before.totalAmount
  }
  if (before.currency !== after.currency) {
    changed.push('currency')
    prev.currency = before.currency
  }
  // Relative tolerance: a rate is a stored float, not a 2-dp amount.
  if (Math.abs(before.exchangeRate - after.exchangeRate) > 1e-9 * Math.max(1, Math.abs(before.exchangeRate))) {
    changed.push('exchangeRate')
    prev.exchangeRate = before.exchangeRate
  }
  if (before.type !== after.type) {
    changed.push('type')
    prev.type = before.type
  }
  if (!sameSplits(before.paidBy, after.paidBy)) changed.push('paidBy')
  if (!sameSplits(before.beneficiaries, after.beneficiaries)) changed.push('beneficiaries')

  const material = changed.length > 0

  for (const key of Object.keys(after.cosmetic)) {
    // JSON comparison: values are strings, numbers, booleans or a flat map
    // (`custom`), and undefined vs absent must compare equal.
    if (JSON.stringify(before.cosmetic[key] ?? null) !== JSON.stringify(after.cosmetic[key] ?? null)) {
      changed.push(key)
    }
  }

  return { changedFields: changed, material, before: prev }
}

const NO_SHARE: Share = { paid: 0, owed: 0 }

/** Display name of the slot that sent a transfer (its first payer). */
function transferSender(tx: TxForEvents, space: SpaceForEvents): string | undefined {
  const senderId = tx.paidBy[0]?.travelMemberId
  return space.members.find((m) => m.travelMemberId === senderId)?.displayName || undefined
}

/**
 * One draft per recipient for a transaction create / edit / delete.
 *
 * `actor.uid` is the authenticated writer (never taken from the document).
 */
export function buildTransactionEvents(
  change: TxChange,
  space: SpaceForEvents,
  actor: ActorRef,
): ActivityDraft[] {
  const push = { throttleKey: space.id, muteSpaceId: space.id }
  const sp = spaceRef(space)

  if (change.type === 'create') {
    const tx = change.after
    // §7: imported rows get a feed entry each but no push — the import summary
    // (events/imports.ts) sends the single push.
    const imported = tx.importBatchId !== undefined
    const recipients = resolveRecipients(space, involvedMemberIds(tx), actor.uid)
    return [...recipients].map(([uid, slots]) => {
      const myShare = shareOf(tx, slots)
      // T6: a transfer the recipient is on the receiving end of.
      const received = tx.type === 'transfer' && myShare.owed > AMOUNT_EPSILON
      return {
        recipientUid: uid,
        body: {
          kind: received ? 'transfer_received' : 'tx_created',
          actor,
          space: sp,
          tx: txSnapshot(tx),
          myShare,
          importBatchId: tx.importBatchId,
          transferFrom: received ? transferSender(tx, space) : undefined,
        },
        push: imported ? null : push,
      }
    })
  }

  if (change.type === 'delete') {
    const tx = change.before
    const recipients = resolveRecipients(space, involvedMemberIds(tx), actor.uid)
    return [...recipients].map(([uid, slots]) => ({
      recipientUid: uid,
      body: {
        kind: 'tx_deleted',
        actor,
        space: sp,
        tx: txSnapshot(tx),
        myShare: NO_SHARE,
        myShareBefore: shareOf(tx, slots),
        importBatchId: tx.importBatchId,
      },
      push,
    }))
  }

  // --- update ---------------------------------------------------------------
  const { before, after } = change
  const diff = diffTransaction(before, after)
  // Nothing a user would notice (e.g. a re-import that rewrote identical values).
  if (diff.changedFields.length === 0) return []

  // A write that stamps a NEW importBatchId is part of an import run (re-import
  // updating rows in place): feed entry only, the summary pushes (§7). A later
  // manual edit leaves importBatchId untouched and notifies normally.
  const importWrite = after.importBatchId !== undefined && after.importBatchId !== before.importBatchId

  const involvedBefore = involvedMemberIds(before)
  const involvedAfter = involvedMemberIds(after)
  // §5 rule 4: before ∪ after, so someone dropped from the split is told.
  const recipients = resolveRecipients(space, new Set([...involvedBefore, ...involvedAfter]), actor.uid)

  return [...recipients].map(([uid, slots]) => {
    const wasIn = [...slots].some((id) => involvedBefore.has(id))
    const isIn = [...slots].some((id) => involvedAfter.has(id))
    const removed = wasIn && !isIn // T5
    const body: ActivityBody = {
      kind: removed ? 'tx_removed_from_split' : 'tx_edited',
      actor,
      space: sp,
      tx: txSnapshot(after),
      myShare: shareOf(after, slots),
      myShareBefore: shareOf(before, slots),
      changedFields: diff.changedFields,
      before: diff.before,
      material: diff.material,
      importBatchId: after.importBatchId,
    }
    // T2/T5 push, T3 (cosmetic) is feed only.
    return { recipientUid: uid, body, push: diff.material && !importWrite ? push : null }
  })
}
