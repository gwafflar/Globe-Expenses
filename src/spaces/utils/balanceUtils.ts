// balanceUtils.ts — pure computation for balance & settlement.
//
// Identity key: travelMemberId (stable nanoid from SpaceMember).
// Split.travelMemberId is fully migrated (Session 009). No uid fallback needed.
// Legacy splits should be normalised via normalizeTransactionSplits() before
// calling these functions.

import type { Transaction } from '@/transactions/types'
import type { SpaceMember } from '@/spaces/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemberBalance {
  memberId: string      // travelMemberId
  displayName: string
  net: number           // positive = owed money, negative = owes money
}

export interface Settlement {
  fromId: string        // debtor travelMemberId
  fromName: string
  toId: string          // creditor travelMemberId
  toName: string
  amount: number        // always positive, rounded to 2dp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places. */
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/** Floating-point "effectively zero" check. */
function isZero(x: number): boolean {
  return Math.abs(x) < 0.01
}

// ---------------------------------------------------------------------------
// computeBalances
// ---------------------------------------------------------------------------

/**
 * Compute net balance for each space member across all transactions.
 *
 * net(member) = sum(paidBy amounts * exchangeRate) − sum(beneficiary amounts * exchangeRate)
 *
 * All amounts are converted to the space's main currency using the exchangeRate
 * already stored on each transaction.
 */
export function computeBalances(
  transactions: Transaction[],
  members: SpaceMember[],
): MemberBalance[] {
  // Accumulate net per travelMemberId
  const netMap = new Map<string, number>()

  // Initialise every member at 0 (so members with no transactions still appear)
  for (const m of members) {
    netMap.set(m.travelMemberId, 0)
  }

  for (const tx of transactions) {
    const rate = tx.exchangeRate

    // Add what each person paid (positive contribution)
    for (const split of tx.paidBy) {
      const prev = netMap.get(split.travelMemberId) ?? 0
      netMap.set(split.travelMemberId, prev + split.amount * rate)
    }

    // Subtract what each person consumed (negative contribution)
    for (const split of tx.beneficiaries) {
      const prev = netMap.get(split.travelMemberId) ?? 0
      netMap.set(split.travelMemberId, prev - split.amount * rate)
    }
  }

  // Build display name lookup
  const nameMap = new Map<string, string>()
  for (const m of members) {
    nameMap.set(m.travelMemberId, m.displayName)
  }

  // Convert to MemberBalance[], rounded to 2dp
  const balances: MemberBalance[] = []
  for (const [id, raw] of netMap) {
    balances.push({
      memberId: id,
      displayName: nameMap.get(id) ?? id,
      net: round2(raw),
    })
  }

  return balances
}

// ---------------------------------------------------------------------------
// computeBalancesRaw — same as computeBalances but ignores exchangeRate.
//
// Use this when all balance-affecting transactions share a single currency
// AND the settlement is displayed in that same currency. By skipping the
// conversion to mainCurrency and back, we avoid lossy round-trip distortion
// (e.g. MYR → EUR → MYR with slightly different rates).
// ---------------------------------------------------------------------------

export function computeBalancesRaw(
  transactions: Transaction[],
  members: SpaceMember[],
): MemberBalance[] {
  const netMap = new Map<string, number>()
  for (const m of members) {
    netMap.set(m.travelMemberId, 0)
  }

  for (const tx of transactions) {
    // Use raw split amounts — no exchange rate multiplication
    for (const split of tx.paidBy) {
      const prev = netMap.get(split.travelMemberId) ?? 0
      netMap.set(split.travelMemberId, prev + split.amount)
    }
    for (const split of tx.beneficiaries) {
      const prev = netMap.get(split.travelMemberId) ?? 0
      netMap.set(split.travelMemberId, prev - split.amount)
    }
  }

  const nameMap = new Map<string, string>()
  for (const m of members) {
    nameMap.set(m.travelMemberId, m.displayName)
  }

  const balances: MemberBalance[] = []
  for (const [id, raw] of netMap) {
    balances.push({
      memberId: id,
      displayName: nameMap.get(id) ?? id,
      net: round2(raw),
    })
  }
  return balances
}

/**
 * Detects whether all transactions use the same currency.
 * Returns the common currency code, or null if mixed.
 */
export function getSingleCurrency(transactions: Transaction[]): string | null {
  if (transactions.length === 0) return null
  const first = transactions[0].currency
  return transactions.every((tx) => tx.currency === first) ? first : null
}

// ---------------------------------------------------------------------------
// computeSettlements
// ---------------------------------------------------------------------------

/**
 * Greedy debt simplification — minimise number of transfers.
 *
 * 1. Separate members into creditors (net > 0) and debtors (net < 0).
 * 2. Sort creditors descending, debtors ascending (largest magnitude first).
 * 3. Match largest creditor with largest debtor, transfer min of both.
 * 4. Repeat until all nets are within 0.01 of zero.
 */
export function computeSettlements(balances: MemberBalance[]): Settlement[] {
  // Work with mutable copies so we can reduce them
  const creditors = balances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net) // descending

  const debtors = balances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.net - b.net) // ascending (most negative first)

  const settlements: Settlement[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]
    const transfer = round2(Math.min(creditor.net, Math.abs(debtor.net)))

    if (transfer < 0.01) {
      // Both effectively zero — skip
      ci++
      di++
      continue
    }

    settlements.push({
      fromId: debtor.memberId,
      fromName: debtor.displayName,
      toId: creditor.memberId,
      toName: creditor.displayName,
      amount: transfer,
    })

    creditor.net = round2(creditor.net - transfer)
    debtor.net = round2(debtor.net + transfer)

    if (isZero(creditor.net)) ci++
    if (isZero(debtor.net)) di++
  }

  return settlements
}
