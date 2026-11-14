// dateRange.ts — the relative date-range model shared by the dashboard controls
// and the transactions-list drill-down (Space refactor Phase 7a, §2).
//
// Pure module: no React, no Firestore.
//
// ⚠️ Transaction.date is "DD-MM-YYYY" and does NOT compare or sort
// lexicographically ("02-01-2026" < "31-12-2025" as a string). Every comparison
// in this file goes through parseTxDate() — never touch the raw strings.
//
// The range is stored as a RELATIVE preset plus the resolved absolute bounds.
// The preset is what the UI shows and what gets re-resolved on each visit; the
// bounds are a derived snapshot used for filtering. Nothing here is persisted:
// a stored range goes stale the moment the calendar moves on.

import { parseTxDate } from '@/spaces/components/tabs/dashboardHelpers'
import { getLocale, getT, type Messages } from '@/i18n'

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type RangePresetId = 'month' | 'last30' | 'all' | 'custom'

export interface DateRange {
  preset: RangePresetId
  /** Inclusive lower bound at 00:00:00.000 local. null = unbounded. */
  from: Date | null
  /** Inclusive upper bound at 23:59:59.999 local. null = unbounded. */
  to: Date | null
}

/** The preset pills, in the order they are rendered. Only the ids live at
 *  module level: a label array built here would be evaluated once at import
 *  and freeze the language. Labels come from rangePresetLabel() at render. */
export const RANGE_PRESETS: { id: Exclude<RangePresetId, 'custom'> }[] = [
  { id: 'month' },
  { id: 'last30' },
  { id: 'all' },
]

/** Display label of a preset pill, in the language of `t` (a component passes
 *  its useT() result; plain code defaults to the current language). */
export function rangePresetLabel(
  id: RangePresetId,
  t: Messages['dashboard'] = getT().dashboard,
): string {
  return t.range[id]
}

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

/** Start of the given day (00:00:00.000 local). Returns a new Date. */
export function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** End of the given day (23:59:59.999 local). Returns a new Date. */
export function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

/** Whole calendar days from `a` to `b`. Math.round absorbs DST hour shifts. */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Turn a relative preset into concrete bounds, evaluated against `now`.
 *
 * - 'month'   → the 1st of the current calendar month → today
 * - 'last30'  → today minus 29 days → today (30 calendar days including today)
 * - 'all'     → unbounded in both directions
 * - 'custom'  → the caller's explicit bounds (normalised to whole days)
 *
 * `now` is injectable so tests never depend on the wall clock.
 */
export function resolveRange(
  preset: RangePresetId,
  custom?: { from: Date; to: Date },
  now: Date = new Date(),
): DateRange {
  if (preset === 'all') {
    return { preset: 'all', from: null, to: null }
  }

  if (preset === 'custom') {
    // A 'custom' preset with no bounds is meaningless — fall back to all time
    // rather than silently filtering everything out.
    if (!custom) return { preset: 'all', from: null, to: null }
    // Tolerate reversed inputs (user picked "to" before "from").
    const a = startOfDay(custom.from)
    const b = endOfDay(custom.to)
    return a.getTime() <= b.getTime()
      ? { preset: 'custom', from: a, to: b }
      : { preset: 'custom', from: startOfDay(custom.to), to: endOfDay(custom.from) }
  }

  const today = startOfDay(now)

  if (preset === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    return { preset: 'month', from: first, to: endOfDay(today) }
  }

  // 'last30' — today plus the 29 days before it, so the window is 30 days long.
  const from = new Date(today)
  from.setDate(from.getDate() - 29)
  return { preset: 'last30', from, to: endOfDay(today) }
}

/** The unbounded range — handy as a default and in tests. */
export const ALL_TIME: DateRange = { preset: 'all', from: null, to: null }

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Whether a "DD-MM-YYYY" transaction date falls inside the range.
 * Both bounds are inclusive; a null bound is unbounded on that side.
 */
export function isDateInRange(dateStr: string, range: DateRange): boolean {
  if (range.from === null && range.to === null) return true
  const t = parseTxDate(dateStr).getTime()
  if (Number.isNaN(t)) return false
  if (range.from !== null && t < range.from.getTime()) return false
  if (range.to !== null && t > range.to.getTime()) return false
  return true
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** "Mar 12" / "12 mars" — in the app's locale, read at call time. */
function shortDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

/** Compact human label for the active range, e.g. "Mar 1–14" or "All time".
 *  Language and locale are read when called (getT/getLocale), never cached:
 *  callers run it during render, so a language change re-renders and re-calls. */
export function rangeLabel(range: DateRange): string {
  const t = getT().dashboard
  const locale = getLocale()
  if (range.preset === 'all') return t.range.all
  if (range.preset === 'month') return t.range.month
  if (range.preset === 'last30') return t.range.last30
  if (range.from && range.to) {
    // `to` is end-of-day — normalise before diffing (see rangeDayCount).
    return diffDays(range.from, startOfDay(range.to)) === 0
      ? shortDate(range.from, locale)
      : `${shortDate(range.from, locale)}–${shortDate(range.to, locale)}`
  }
  return t.range.custom
}

/**
 * How many calendar days the range spans — the divisor for "average per day".
 *
 * An unbounded range has no intrinsic length, so the caller supplies the span
 * of the data itself (the pre-Phase-7a behaviour: getTripDurationDays()).
 */
export function rangeDayCount(range: DateRange, fallbackDays: number): number {
  if (range.from === null || range.to === null) return Math.max(fallbackDays, 1)
  // `to` is an end-of-day bound; normalise it before diffing so the count is a
  // whole number of calendar days rather than 29.99 rounded to 30.
  return Math.max(diffDays(range.from, startOfDay(range.to)) + 1, 1)
}
