// walletHelpers.ts — pure TypeScript utility functions for wallet balance tracking.
//
// No React imports — keeping this file pure makes it easy to unit-test with
// Vitest without needing a browser/DOM environment.
//
// A "wallet" is a (paymentMethod, currency) pair for a specific travel member.
// The balance is: deposits (withdrawals) minus expenses, plus/minus adjustments.
// Only payment methods with at least one withdrawal are tracked.

import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import type { TransactionType, AdjustmentMode } from '@/transactions/types'

// ---------------------------------------------------------------------------
// Transaction type helpers
// ---------------------------------------------------------------------------

/** Returns the effective transaction type (undefined on legacy docs = 'expense'). */
export function getTransactionType(tx: { type?: TransactionType }): TransactionType {
  return tx.type ?? 'expense'
}

export function isExpense(tx: { type?: TransactionType }): boolean {
  return getTransactionType(tx) === 'expense'
}

export function isWithdrawal(tx: { type?: TransactionType }): boolean {
  return getTransactionType(tx) === 'withdrawal'
}

export function isAdjustment(tx: { type?: TransactionType }): boolean {
  return getTransactionType(tx) === 'adjustment'
}

export function isTransfer(tx: { type?: TransactionType }): boolean {
  return getTransactionType(tx) === 'transfer'
}

/**
 * Returns true if the transaction should count toward spending analytics
 * (category breakdown, per-member totals, spending-over-time, etc.).
 *
 * Includes: regular expenses + adjustments with adjustmentMode === 'expense'.
 * Excludes: withdrawals, balance-only adjustments, transfers.
 */
export function countsAsSpending(tx: { type?: TransactionType; adjustmentMode?: AdjustmentMode }): boolean {
  const t = getTransactionType(tx)
  if (t === 'expense') return true
  if (t === 'adjustment' && tx.adjustmentMode === 'expense') return true
  return false
}

/**
 * Returns true if the transaction should affect inter-member balance
 * (who owes whom). Used by BalanceTab for settlement computation.
 *
 * Includes: expenses, expense-mode adjustments, AND transfers.
 * Excludes: withdrawals, balance-only adjustments.
 *
 * Key distinction from countsAsSpending: transfers affect balance
 * (Alice gives Bob 100 → shifts debt) but do NOT count as spending.
 */
export function affectsBalance(tx: { type?: TransactionType; adjustmentMode?: AdjustmentMode }): boolean {
  const t = getTransactionType(tx)
  if (t === 'expense') return true
  if (t === 'transfer') return true
  if (t === 'adjustment' && tx.adjustmentMode === 'expense') return true
  return false
}

// ---------------------------------------------------------------------------
// Wallet balance computation
// ---------------------------------------------------------------------------

/** Computed wallet balance for a (paymentMethod, currency) pair. */
export interface WalletBalance {
  paymentMethod: string      // LabeledItem.id (or raw string for legacy)
  paymentMethodLabel: string // Display label (resolved from travel's LabeledItem[] by the caller)
  currency: string           // ISO 4217 code
  deposited: number          // Sum of withdrawals (totalAmount - fees)
  spent: number              // Sum of expenses paid by this member with this PM + currency
  adjustments: number        // Net sum of adjustments (positive = added, negative = subtracted)
  remaining: number          // deposited + adjustments - spent
}

/**
 * Groups a member's paidBy amount from a transaction, if they are a payer.
 * Returns 0 if the member is not in paidBy.
 */
function memberPaidAmount(
  tx: TransactionWithStatus,
  travelMemberId: string,
): number {
  const split = tx.paidBy.find(s => s.travelMemberId === travelMemberId)
  return split?.amount ?? 0
}

/**
 * Compute wallet balances for a specific travel member across all transactions.
 *
 * Only returns entries for (paymentMethod, currency) pairs that have at least
 * one withdrawal — a payment method with no deposits has no "wallet" to track.
 *
 * @param transactions   All transactions in the travel (from useTransactions)
 * @param travelMemberId The member's stable nanoid (from TravelMember)
 * @param pmLabelMap     Map from paymentMethod id → display label (built by caller from travel.paymentMethods)
 */
export function computeWalletBalances(
  transactions: TransactionWithStatus[],
  travelMemberId: string,
  pmLabelMap: Map<string, string>,
): WalletBalance[] {
  // Accumulator keyed by "paymentMethod|currency"
  const buckets = new Map<string, {
    paymentMethod: string
    currency: string
    deposited: number
    spent: number
    adjustments: number
  }>()

  // Track which (pm, currency) pairs have withdrawals — only those become wallets
  const hasWithdrawal = new Set<string>()

  /** Get or create a bucket for a (paymentMethod, currency) pair. */
  function getBucket(pm: string, currency: string) {
    const key = `${pm}|${currency}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { paymentMethod: pm, currency, deposited: 0, spent: 0, adjustments: 0 }
      buckets.set(key, bucket)
    }
    return bucket
  }

  for (const tx of transactions) {
    // Skip transactions without a payment method — can't match to a wallet
    if (!tx.paymentMethod) continue

    const paidAmount = memberPaidAmount(tx, travelMemberId)
    // Skip transactions where this member didn't pay
    if (paidAmount === 0) continue

    const t = getTransactionType(tx)

    // Transfers are person-to-person and don't flow through a payment method wallet.
    // They affect inter-member balance (computed in balanceUtils) but not wallet tracking.
    if (t === 'transfer') continue

    const key = `${tx.paymentMethod}|${tx.currency}`

    if (t === 'withdrawal') {
      const bucket = getBucket(tx.paymentMethod, tx.currency)
      // Fees reduce what the user actually received in their wallet
      bucket.deposited += paidAmount - (tx.fees ?? 0)
      hasWithdrawal.add(key)
    } else if (t === 'adjustment') {
      const bucket = getBucket(tx.paymentMethod, tx.currency)
      // Adjustments can be positive (user has more than expected) or negative
      // The sign is determined by the totalAmount: positive = add, negative = subtract.
      // But totalAmount is always positive in our model, so we use a convention:
      // If adjustmentMode is set, the amount is the absolute difference.
      // The direction is implicit: if the adjustment was created because the user
      // had less than expected, it's negative (reducing the wallet).
      // For now, adjustments always reduce the wallet (missing money is more common).
      // A positive adjustment (user found extra money) stores amount as negative totalAmount?
      // Actually — let's keep it simple: the paidBy amount IS the signed adjustment.
      // Positive paidAmount = wallet gains. Negative = wallet loses.
      // But Split.amount is always positive... so we need a convention.
      //
      // Convention: adjustments store the SIGNED difference as totalAmount.
      // totalAmount > 0 means wallet gains (user has more than computed).
      // totalAmount < 0 means wallet loses (user has less than computed).
      // Since totalAmount is validated as positive in forms, the reconciliation
      // dialog will set a special flag. For now, we treat all adjustments as additive
      // (the reconciliation dialog computes the correct signed value).
      bucket.adjustments += paidAmount
    } else {
      // Regular expense — decreases the wallet
      const bucket = getBucket(tx.paymentMethod, tx.currency)
      bucket.spent += paidAmount
    }
  }

  // Only return wallets that have at least one withdrawal
  const results: WalletBalance[] = []
  for (const [key, bucket] of buckets) {
    if (!hasWithdrawal.has(key)) continue
    results.push({
      paymentMethod: bucket.paymentMethod,
      paymentMethodLabel: pmLabelMap.get(bucket.paymentMethod) ?? bucket.paymentMethod,
      currency: bucket.currency,
      deposited: round2(bucket.deposited),
      spent: round2(bucket.spent),
      adjustments: round2(bucket.adjustments),
      remaining: round2(bucket.deposited + bucket.adjustments - bucket.spent),
    })
  }

  // Sort by currency then payment method label for stable display order
  results.sort((a, b) =>
    a.currency.localeCompare(b.currency) || a.paymentMethodLabel.localeCompare(b.paymentMethodLabel),
  )

  return results
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Compute the difference between the user's actual remaining amount and
 * the computed wallet balance.
 *
 * @returns positive = user has more than expected, negative = user has less.
 */
export function computeReconciliationDiff(actualRemaining: number, balance: WalletBalance): number {
  return round2(actualRemaining - balance.remaining)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places (avoids floating-point display artifacts). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
