// dashboardHelpers.ts — pure TypeScript utility functions for DashboardTab.
//
// No React imports — keeping this file pure makes it easy to unit-test with
// Vitest without needing to set up a browser/DOM environment.
//
// Important: transaction dates are stored as "DD-MM-YYYY" strings (not ISO).
// All helpers in this file parse and produce dates in that same format.

import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import type { Split } from '@/transactions/types'
import type { Travel, TravelMember } from '@/travels/types'

// ---------------------------------------------------------------------------
// PeriodFilter — discriminated union describing which time window is active
// ---------------------------------------------------------------------------

export type PeriodFilter =
  | { type: 'all' }
  | { type: 'today' }
  | { type: 'days'; n: number }
  | { type: 'custom'; from: Date; to: Date }

// ---------------------------------------------------------------------------
// Internal date helpers (not exported — implementation detail)
// ---------------------------------------------------------------------------

/**
 * Parse a "DD-MM-YYYY" transaction date string into a local Date at midnight.
 * We cannot use new Date("DD-MM-YYYY") because that format is non-standard
 * and some engines return Invalid Date.
 */
export function parseTxDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day) // month is 0-indexed in JS Date
}

/** Return today as a "DD-MM-YYYY" string, matching the transaction date format. */
function todayAsTxDate(): string {
  const d = new Date()
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  return `${day}-${month}-${year}`
}

/** Return today at midnight (00:00:00.000 local time). */
function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Calendar-day difference: how many whole days from `a` to `b`.
 * Uses Math.round to avoid floating-point drift from DST transitions.
 */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// normalizeTransactionSplits — backward-compat for pre-refactor Firestore data
// ---------------------------------------------------------------------------

/**
 * Pre-Session-009 transactions stored splits as { uid: string, amount: number }.
 * Post-refactor splits use { travelMemberId: string, amount: number }.
 *
 * useTransactions casts Firestore data as Split[] without field transformation,
 * so old splits arrive with split.travelMemberId === undefined (the field just
 * doesn't exist on the raw JS object from Firestore).
 *
 * normaliseMember() already handles the MEMBER LIST correctly (maps uid → travelMemberId).
 * This function does the same for the SPLIT arrays inside transactions, using the
 * already-normalised members list as a lookup table:
 *   old split.uid  →  member where member.userId === split.uid  →  member.travelMemberId
 *
 * Returns the same array reference if no normalization was needed (avoids
 * unnecessary allocations when all splits already have travelMemberId set).
 */
export function normalizeTransactionSplits(
  transactions: TransactionWithStatus[],
  members: TravelMember[],
): TransactionWithStatus[] {
  // Build uid → travelMemberId lookup from the already-normalised members list.
  // member.userId is the Firebase Auth UID; member.travelMemberId is the stable nanoid.
  const uidToTmid = new Map<string, string>()
  for (const m of members) {
    if (m.userId) uidToTmid.set(m.userId, m.travelMemberId)
  }

  /** Remap a single split array; returns same reference if nothing changed. */
  function normSplits(splits: Split[]): Split[] {
    // Quick scan: if every split already has travelMemberId, skip allocation.
    if (splits.every((s) => !!s.travelMemberId)) return splits

    return splits.map((s) => {
      if (s.travelMemberId) return s
      // Access the legacy 'uid' field that TypeScript doesn't know about
      const legacyUid = (s as unknown as { uid?: string }).uid
      if (!legacyUid) return s
      const tmid = uidToTmid.get(legacyUid)
      // Fall back to the raw uid itself if no member mapping exists, so at
      // least same-uid comparisons still work for very old data formats.
      return { travelMemberId: tmid ?? legacyUid, amount: s.amount }
    })
  }

  // First pass: check whether any transaction actually needs remapping.
  // If nothing changed we return the original array reference unchanged,
  // which lets useMemo skip re-running downstream computations.
  const anyChanged = transactions.some((tx) =>
    !tx.paidBy.every((s) => !!s.travelMemberId) ||
    !tx.beneficiaries.every((s) => !!s.travelMemberId),
  )
  if (!anyChanged) return transactions

  return transactions.map((tx) => {
    const paidBy        = normSplits(tx.paidBy)
    const beneficiaries = normSplits(tx.beneficiaries)
    if (paidBy === tx.paidBy && beneficiaries === tx.beneficiaries) return tx
    return { ...tx, paidBy, beneficiaries }
  })
}

// ---------------------------------------------------------------------------
// filterTransactions
// ---------------------------------------------------------------------------

/**
 * Return only the transactions that fall within the requested time period.
 *
 * - 'all'    → all transactions, unchanged
 * - 'today'  → transactions whose date string equals today's DD-MM-YYYY
 * - 'days:n' → transactions from the last n calendar days (inclusive of today)
 * - 'custom' → transactions whose date falls within [from, to] inclusive
 */
export function filterTransactions(
  transactions: TransactionWithStatus[],
  period: PeriodFilter,
): TransactionWithStatus[] {
  if (period.type === 'all') return transactions

  if (period.type === 'today') {
    const today = todayAsTxDate()
    return transactions.filter((tx) => tx.date === today)
  }

  if (period.type === 'days') {
    // Compute the cutoff: (today - (n-1) days) at midnight.
    // e.g. n=7 → include today + 6 previous days.
    const cutoff = todayMidnight()
    cutoff.setDate(cutoff.getDate() - (period.n - 1))
    return transactions.filter((tx) => parseTxDate(tx.date) >= cutoff)
  }

  if (period.type === 'custom') {
    // Normalise: from at midnight, to at end-of-day.
    const from = new Date(period.from)
    from.setHours(0, 0, 0, 0)
    const to = new Date(period.to)
    to.setHours(23, 59, 59, 999)
    return transactions.filter((tx) => {
      const d = parseTxDate(tx.date)
      return d >= from && d <= to
    })
  }

  return transactions
}

// ---------------------------------------------------------------------------
// getTripDurationDays
// ---------------------------------------------------------------------------

/**
 * Return the trip length in calendar days.
 *
 * Uses the span of transaction dates (min → max). Falls back to 30 days
 * if no transactions exist.
 *
 * Used to cap the "Recent days" slider max value.
 */
export function getTripDurationDays(
  _travel: Travel,
  transactions: TransactionWithStatus[],
): number {
  if (transactions.length > 0) {
    const dates = transactions.map((tx) => parseTxDate(tx.date).getTime())
    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date(Math.max(...dates))
    return diffDays(minDate, maxDate) + 1
  }

  return 30 // fallback when no dates available
}

// ---------------------------------------------------------------------------
// computeMemberStats
// ---------------------------------------------------------------------------

/**
 * Compute how much a member consumed and paid, in the travel's main currency.
 *
 * `travelMemberId` is the nanoid stored in Split.travelMemberId — NOT a
 * Firebase Auth UID. The caller is responsible for resolving the correct
 * travelMemberId from the TravelMember list before calling this function.
 *
 * consumed = Σ (split.amount * tx.exchangeRate) for beneficiary splits
 *            where split.travelMemberId === travelMemberId
 * paid     = Σ (split.amount * tx.exchangeRate) for paidBy splits
 *            where split.travelMemberId === travelMemberId
 *
 * Amounts are in the travel's main currency (exchangeRate already converts them).
 */
export function computeMemberStats(
  transactions: TransactionWithStatus[],
  travelMemberId: string,
): { consumed: number; paid: number } {
  let consumed = 0
  let paid = 0

  for (const tx of transactions) {
    for (const split of tx.beneficiaries) {
      if (split.travelMemberId === travelMemberId) {
        consumed += split.amount * tx.exchangeRate
      }
    }
    for (const split of tx.paidBy) {
      if (split.travelMemberId === travelMemberId) {
        paid += split.amount * tx.exchangeRate
      }
    }
  }

  return { consumed, paid }
}

// ---------------------------------------------------------------------------
// categoryColor + CATEGORY_PALETTE
// ---------------------------------------------------------------------------

/** Fixed 6-colour palette used for categories and member avatars. */
export const CATEGORY_PALETTE = [
  '#3B8BD4', // blue
  '#1D9E75', // teal
  '#EF9F27', // amber
  '#D4537E', // pink
  '#7F77DD', // purple
  '#888780', // gray
]

/**
 * Map a category name to a consistent palette colour using a simple hash.
 *
 * `simpleHash` sums the Unicode code points of each character and takes
 * the result mod a large prime. Same input → always the same index →
 * always the same colour, across renders and sessions.
 */
function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) % 1_000_003 // 1_000_003 is prime
  }
  return h
}

export function categoryColor(categoryName: string): string {
  return CATEGORY_PALETTE[simpleHash(categoryName) % CATEGORY_PALETTE.length]
}

// ---------------------------------------------------------------------------
// formatAmount
// ---------------------------------------------------------------------------

/** ISO 4217 currency code → display symbol. Falls back to the code itself. */
const SYMBOL_MAP: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  THB: '฿',
  JPY: '¥',
}

/**
 * Format an amount with currency symbol prefix, always 2 decimal places.
 * Example: formatAmount(42.5, 'EUR') → '€ 42.50'
 */
export function formatAmount(amount: number, currency: string): string {
  const symbol = SYMBOL_MAP[currency] ?? currency
  return `${symbol} ${amount.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// formatDayLabel
// ---------------------------------------------------------------------------

/**
 * Format a "DD-MM-YYYY" date string into a short human-readable label.
 *
 * - Today      → 'Today'
 * - Yesterday  → 'Yest.'
 * - Otherwise  → locale short month + day, e.g. 'Mar 12'
 */
export function formatDayLabel(dateStr: string): string {
  const d = parseTxDate(dateStr)
  const today     = todayMidnight()
  const yesterday = new Date(today.getTime() - 86_400_000)

  // Normalise d to midnight for comparison
  const dMidnight = new Date(d)
  dMidnight.setHours(0, 0, 0, 0)

  if (dMidnight.getTime() === today.getTime())     return 'Today'
  if (dMidnight.getTime() === yesterday.getTime()) return 'Yest.'

  // e.g. "Mar 12"
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// dateRangeLabel — derive a human-readable range string from a PeriodFilter
// ---------------------------------------------------------------------------

/**
 * Return a compact label describing the active period, e.g. "Mar 1–14".
 * Used in the hero card subtitle and card summaries.
 */
export function dateRangeLabel(
  period: PeriodFilter,
  transactions: TransactionWithStatus[],
  tripDurationDays: number,
): string {
  const shortDate = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (period.type === 'all') {
    if (transactions.length === 0) return `${tripDurationDays} days`
    const dates = transactions.map((tx) => parseTxDate(tx.date).getTime())
    const min = new Date(Math.min(...dates))
    const max = new Date(Math.max(...dates))
    if (diffDays(min, max) === 0) return shortDate(min)
    return `${shortDate(min)}–${shortDate(max)}`
  }

  if (period.type === 'today') return 'Today'

  if (period.type === 'days') {
    const to   = todayMidnight()
    const from = new Date(to.getTime() - (period.n - 1) * 86_400_000)
    return `${shortDate(from)}–${shortDate(to)}`
  }

  if (period.type === 'custom') {
    return `${shortDate(period.from)}–${shortDate(period.to)}`
  }

  return ''
}

// ---------------------------------------------------------------------------
// numberOfDaysInRange — number of days in the active filter window
// ---------------------------------------------------------------------------

/**
 * Return how many calendar days the active filter spans.
 * Used to compute average daily spend.
 */
export function numberOfDaysInRange(
  period: PeriodFilter,
  tripDurationDays: number,
): number {
  if (period.type === 'all')    return tripDurationDays
  if (period.type === 'today')  return 1
  if (period.type === 'days')   return period.n
  if (period.type === 'custom') return diffDays(period.from, period.to) + 1
  return 1
}
