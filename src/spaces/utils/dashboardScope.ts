// dashboardScope.ts — the dashboard's one resolution step (Phase 7a, §1).
//
// Pure module: no React, no Firestore.
//
// Every dashboard card reads the SAME ScopedTransaction[] produced here:
//
//   transactions
//     → scope       (global date range; exclude money-moving transactions)
//     → attribute   (amount per transaction under the You/All mode)
//     → ScopedTransaction[]
//     → per card: group by dimension → sort → top-N → cells
//
// Cards never receive raw transactions. A card that needs the underlying
// document (drill-down, edit links) takes it from ScopedTransaction.transaction.
// Centralising this is the whole point: before Phase 7a each card applied its
// own period and member scoping, so two cards could silently disagree.

import type { Transaction } from '@/transactions/types'
import type { SpaceConfig } from '@/spaces/types'
import { countsAsSpending } from '@/transactions/utils/walletHelpers'
import { isDateInRange, type DateRange, type RangePresetId } from '@/shared/utils/dateRange'

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** The "everyone" selection: attribute each transaction's full total.
 *  A distinct sentinel rather than a magic string at each call site.
 *  Cannot collide with a real travelMemberId — those are 21-char nanoids. */
export const ALL_MEMBERS = 'all'

/**
 * Whose money the dashboard is showing: either ALL_MEMBERS, or the
 * `travelMemberId` of one space member (the stable nanoid key in Split[], NOT
 * a Firebase Auth UID).
 *
 * ⚠️ Never the string 'you'. The picker resolves "You" to the current user's
 * member id BEFORE calling into this module, so nothing here has to know who
 * is logged in — which is what keeps the pipeline pure and lets a card be
 * scoped to any member with no extra code path.
 */
export type ScopeMode = typeof ALL_MEMBERS | string

export interface ScopedTransaction<T extends Transaction = Transaction> {
  transaction: T
  /** Amount in the space's main currency, already attributed under the current
   *  member selection. Cards sum this and know nothing about members, splits,
   *  or dates. */
  attributedAmount: number
}

export interface ScopeOptions {
  range: DateRange
  mode: ScopeMode
  /** The space's main currency. Not used by the arithmetic — attributed
   *  amounts are already expressed in it via totalAmountMain / exchangeRate —
   *  but carried on the options so per-currency attribution (v2) can be added
   *  without changing every call site. */
  mainCurrency: string
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/**
 * The amount one transaction contributes under the active member selection.
 *
 * - ALL_MEMBERS → `totalAmountMain`, the stored main-currency total. This is
 *   exactly what every card summed before Phase 7a with no member selected.
 * - a member id → that member's share taken from the BENEFICIARY splits,
 *   converted with the transaction's own stored exchangeRate. Same arithmetic
 *   as computeMemberStats()'s `consumed` and as computeBalances()'s negative
 *   leg, so a breakdown card's total agrees with the Balance tab for the same
 *   member and period.
 *
 * Unclaimed members work unchanged: a member slot holds splits whether or not
 * a Firebase account is linked to it, and only the split key is consulted.
 *
 * A member appearing twice in `beneficiaries` (not produced by the app, but
 * possible in imported data) is summed rather than deduplicated — matching the
 * pre-existing behaviour of computeMemberStats().
 */
export function attributedAmount(tx: Transaction, mode: ScopeMode): number {
  if (mode === ALL_MEMBERS) return tx.totalAmountMain
  let sum = 0
  for (const split of tx.beneficiaries) {
    if (split.travelMemberId === mode) sum += split.amount * tx.exchangeRate
  }
  return sum
}

// ---------------------------------------------------------------------------
// scopeTransactions
// ---------------------------------------------------------------------------

/**
 * Apply the global date range and the You/All attribution, once, for every card.
 *
 * Which transactions survive is decided by countsAsSpending() — the SAME rule
 * the pre-Phase-7a dashboard used, deliberately reused rather than restated:
 *
 *   included : expenses, and adjustments with adjustmentMode === 'expense'
 *   excluded : withdrawals, transfers, and balance-only adjustments
 *
 * Withdrawals and transfers move money rather than spend it; a balance-only
 * adjustment is a wallet correction with no spending meaning. This holds for
 * EVERY member selection — the selection only changes how much of an included
 * transaction is attributed, never which transactions are included.
 *
 * Callers should memoise on [transactions, range, mode].
 */
export function scopeTransactions<T extends Transaction>(
  transactions: T[],
  opts: ScopeOptions,
): ScopedTransaction<T>[] {
  const { range, mode } = opts
  const out: ScopedTransaction<T>[] = []

  for (const tx of transactions) {
    if (!countsAsSpending(tx)) continue
    if (!isDateInRange(tx.date, range)) continue
    out.push({ transaction: tx, attributedAmount: attributedAmount(tx, mode) })
  }

  return out
}

/** Σ attributedAmount — the number every card header shows. */
export function scopedTotal(scoped: ScopedTransaction[]): number {
  let sum = 0
  for (const s of scoped) sum += s.attributedAmount
  return sum
}

// ---------------------------------------------------------------------------
// Default range (§2)
// ---------------------------------------------------------------------------

/**
 * The range a space opens on. A trip is a bounded event whose whole point is
 * the total, so it defaults to all time; a recurring budget is read one month
 * at a time.
 *
 * ⚠️ This is derived from `config`, NOT from `presetOrigin` — SPEC §8
 * invariant 4 forbids any behaviour branching on the preset badge. The signal
 * used is "does this space track countries or cash wallets", both of which are
 * trip-shaped concerns. The mapping reproduces the intended defaults exactly:
 *
 *   legacy (no config) → country: true            → all time
 *   travel preset      → country + wallets: true  → all time
 *   solo / group /
 *   custom presets     → country + wallets: false → this month
 */
export function defaultRangePreset(config: SpaceConfig): RangePresetId {
  return config.builtInFields.country || config.features.wallets ? 'all' : 'month'
}
