/**
 * Raw Firestore document → the shapes the event logic reads (model.ts).
 *
 * ⚠️ Deliberate exception to the "one mapping per collection" rule in CLAUDE.md.
 * The client's `mapSpaceDoc()` / `normaliseMember()` live in `src/`, which this
 * package cannot import (it is deployed on its own). Rather than add a build
 * step to share code, this file keeps a SECOND, minimal mapping that covers only
 * what notifications read. `mapping.test.ts` pins the legacy-member cases so it
 * cannot drift from `normaliseMember()` unnoticed. If the stored member or split
 * shape changes, update both.
 */
import type {
  EventMember,
  InviteForEvents,
  SpaceForEvents,
  Split,
  TransactionType,
  TxForEvents,
} from './model'

type Raw = Record<string, unknown>

/** Mirrors `normaliseMember()` in src/spaces/types.ts for the three fields we need. */
export function mapMember(raw: Raw): EventMember {
  return {
    // Legacy docs stored { uid, displayName, joinedAt }: the uid doubled as the slot key.
    travelMemberId: (raw.travelMemberId as string | undefined) ?? (raw.uid as string | undefined) ?? '',
    displayName: (raw.displayName as string | undefined) ?? '',
    // New docs carry an explicit userId (possibly null). Legacy docs only have uid,
    // which was always a real Auth uid.
    userId:
      raw.userId !== undefined
        ? (raw.userId as string | null)
        : ((raw.uid as string | undefined) ?? null),
  }
}

export function mapSpaceForEvents(id: string, data: Raw): SpaceForEvents {
  return {
    id,
    name: (data.name as string | undefined) ?? '',
    emoji: (data.emoji as string | undefined) || undefined,
    members: ((data.members as Raw[] | undefined) ?? []).map(mapMember),
    memberUids: (data.memberUids as string[] | undefined) ?? [],
    pendingInviteId: data.pendingInviteId as string | undefined,
  }
}

/** Legacy splits stored { uid, amount }; for those documents uid === travelMemberId. */
function mapSplits(raw: unknown): Split[] {
  if (!Array.isArray(raw)) return []
  return (raw as Raw[]).map((s) => ({
    travelMemberId: (s.travelMemberId as string | undefined) ?? (s.uid as string | undefined) ?? '',
    amount: typeof s.amount === 'number' ? s.amount : 0,
  }))
}

/**
 * Fields whose change is "cosmetic" (§5 rule 3): reported in the feed, never pushed.
 * `date`, `fees`, `adjustmentMode` and `amountFormula` are not named by the spec;
 * none of them changes what anyone owes, so they are cosmetic too.
 */
export const COSMETIC_FIELDS = [
  'name',
  'date',
  'category',
  'paymentMethod',
  'country',
  'city',
  'notes',
  'custom',
  'fees',
  'adjustmentMode',
  'amountFormula',
] as const

export function mapTxForEvents(id: string, data: Raw): TxForEvents {
  const cosmetic: Raw = {}
  for (const key of COSMETIC_FIELDS) cosmetic[key] = data[key]
  return {
    id,
    name: (data.name as string | undefined) ?? '',
    // Absent on legacy documents = expense (same rule as getTransactionType()).
    type: (data.type as TransactionType | undefined) ?? 'expense',
    totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : 0,
    currency: (data.currency as string | undefined) ?? '',
    exchangeRate: typeof data.exchangeRate === 'number' ? data.exchangeRate : 1,
    date: (data.date as string | undefined) ?? '',
    paidBy: mapSplits(data.paidBy),
    beneficiaries: mapSplits(data.beneficiaries),
    importBatchId: data.importBatchId as string | undefined,
    lastModifiedBy: data.lastModifiedBy as string | undefined,
    cosmetic,
  }
}

export function mapInviteForEvents(id: string, data: Raw): InviteForEvents {
  return {
    id,
    type: data.type === 'travel_member' ? 'travel_member' : 'friend',
    fromUid: (data.fromUid as string | undefined) ?? '',
    fromDisplayName: (data.fromDisplayName as string | undefined) ?? '',
    toUid: data.toUid as string | undefined,
    travelId: data.travelId as string | undefined,
    travelName: data.travelName as string | undefined,
    status: (data.status as string | undefined) ?? '',
    usedBy: (data.usedBy as string[] | undefined) ?? [],
  }
}
