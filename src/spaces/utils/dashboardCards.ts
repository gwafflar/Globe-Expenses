// dashboardCards.ts — the generic 1D "breakdown by dimension" aggregation
// (Space refactor Phase 7a, §4 and §6).
//
// Pure module: no React, no Firestore.
//
// One component (BreakdownCard) is instantiated per DashboardCardDef and reads
// the rows this file produces. The hard-coded category and country cards become
// card DEFINITIONS rather than bespoke components — which is what makes the
// user able to create the same thing on any other dimension.

import type { DashboardCardDef, Space, SpaceConfig } from '@/spaces/types'
import {
  UNDEFINED_FILTER,
  dimensionValues,
  filterDimensions,
  type FilterDimension,
} from '@/transactions/utils/filterDimensions'
import type { ScopedTransaction } from '@/spaces/utils/dashboardScope'

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

/** Sentinel row key for the collapsed tail. Never a real dimension value —
 *  dimension values are option ids or stored strings, never this. */
export const OTHER_ROW = '__other__'

/** How many real rows a card shows before the tail collapses into "Other". */
export const TOP_N = 5

export interface BreakdownRow {
  /** Row identity: a dimension value id, UNDEFINED_FILTER, or OTHER_ROW. */
  key: string
  label: string
  amount: number
  /** Number of transactions behind the row — shown on the Other row so the
   *  user can see what got collapsed. */
  count: number
  /** The dimension values this row drills into. One entry for a normal row,
   *  many for Other. Empty for a row nothing can be filtered on. */
  values: string[]
  /** True for the collapsed tail row. */
  isOther: boolean
  /** True for the "No {dimension}" row, which is pinned last. */
  isMissing: boolean
}

export interface Breakdown {
  rows: BreakdownRow[]
  /** Σ over every row, including Other and the missing row. Equals the card's
   *  share of the scoped total for this dimension. */
  total: number
}

// ---------------------------------------------------------------------------
// computeBreakdown
// ---------------------------------------------------------------------------

/**
 * Group scoped transactions by one dimension and produce display rows.
 *
 * Rules (§4):
 *   - sum `attributedAmount`, never a raw transaction field
 *   - sort by amount DESCENDING, not alphabetically
 *   - top-N (5) real values, tail collapsed into "Other · N values"
 *   - a missing value becomes "No {dimension}", pinned LAST regardless of amount
 *   - `select` values are displayed via the descriptor's option labels; a
 *     deleted option falls back to the raw stored value rather than blanking
 *   - `boolean` dimensions yield Yes/No rows, where an ABSENT key counts as No
 *     (buildCustomPayload omits `false` entirely — see dimensionValues())
 *
 * A transaction contributing several values to one dimension would be counted
 * once per value. That cannot happen here: only single-valued dimensions are
 * offerable as cards (see breakdownDimensions()), so no double-counting.
 */
export function computeBreakdown(
  scoped: ScopedTransaction[],
  dim: FilterDimension,
  topN: number = TOP_N,
): Breakdown {
  // value id → accumulated amount + transaction count
  const buckets = new Map<string, { amount: number; count: number }>()
  let total = 0

  for (const { transaction, attributedAmount } of scoped) {
    const values = dimensionValues(transaction, dim)
    // An empty extraction means "no value for this dimension" (custom selects
    // return [] when the key is absent; built-ins already return the sentinel).
    const key = values.length > 0 ? values[0] : UNDEFINED_FILTER

    const bucket = buckets.get(key) ?? { amount: 0, count: 0 }
    bucket.amount += attributedAmount
    bucket.count += 1
    buckets.set(key, bucket)
    total += attributedAmount
  }

  // Split the missing bucket out before sorting — it is pinned, not ranked.
  const missing = buckets.get(UNDEFINED_FILTER)
  buckets.delete(UNDEFINED_FILTER)

  const ranked: BreakdownRow[] = Array.from(buckets.entries())
    .map(([key, b]) => ({
      key,
      label: optionLabel(dim, key),
      amount: b.amount,
      count: b.count,
      values: [key],
      isOther: false,
      isMissing: false,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))

  const rows: BreakdownRow[] = ranked.slice(0, topN)
  const tail = ranked.slice(topN)

  if (tail.length > 0) {
    rows.push({
      key: OTHER_ROW,
      label: `Other · ${tail.length} value${tail.length === 1 ? '' : 's'}`,
      amount: tail.reduce((s, r) => s + r.amount, 0),
      count: tail.reduce((s, r) => s + r.count, 0),
      // Tapping Other drills into ALL the collapsed values at once.
      values: tail.map((r) => r.key),
      isOther: true,
      isMissing: false,
    })
  }

  if (missing) {
    rows.push({
      key: UNDEFINED_FILTER,
      label: `No ${dim.label.toLowerCase()}`,
      amount: missing.amount,
      count: missing.count,
      // The filter panel's "Undefined" sentinel — drill-down filters on it too.
      values: [UNDEFINED_FILTER],
      isOther: false,
      isMissing: true,
    })
  }

  return { rows, total }
}

/** Display label for one raw dimension value.
 *  Custom selects and boolean tri-states carry an explicit option list, so the
 *  stored OPTION ID resolves to its label. Built-ins have an observation-derived
 *  option list that the dashboard does not populate, and their stored value IS
 *  the display string, so it passes through unchanged. A select option that was
 *  deleted since the transaction was tagged also falls through to the raw
 *  value — never a blank row. */
function optionLabel(dim: FilterDimension, value: string): string {
  return dim.options.find((o) => o.id === value)?.label ?? value
}

// ---------------------------------------------------------------------------
// Card definitions (§6)
// ---------------------------------------------------------------------------

/** Stable ids for the two cards a never-edited space starts with. They are
 *  ordinary ids: the first edit materialises the array with them intact, so a
 *  legacy space's cards keep their identity once the user reorders or renames. */
export const LEGACY_CATEGORY_CARD_ID = 'legacy-category'
export const LEGACY_COUNTRY_CARD_ID = 'legacy-country'

/** The card set a space that has never been edited shows. Each is still gated
 *  on its built-in field by visibleDashboardCards(), so a space with category
 *  disabled simply doesn't render that card. */
const LEGACY_DEFAULT_CARDS: DashboardCardDef[] = [
  { id: LEGACY_CATEGORY_CARD_ID, dimensions: ['category'] },
  { id: LEGACY_COUNTRY_CARD_ID, dimensions: ['country'] },
]

/** The stored card list, or the legacy default set when the space has never
 *  been edited. An EMPTY stored array is honoured as-is — the user deleted
 *  every card and must not have the defaults grow back. */
export function resolveDashboardCards(config: SpaceConfig): DashboardCardDef[] {
  return config.dashboardCards ?? LEGACY_DEFAULT_CARDS
}

/** The dimensions a card can be built on: enabled built-in selects and enabled
 *  custom select/boolean fields, in the Phase 6 display order. Custom `text`
 *  fields are already absent from filterDimensions() — free text has no
 *  meaningful group-by. Core dimensions (paidBy/beneficiaries) are absent too,
 *  which is what keeps every card single-valued and free of double-counting. */
export function breakdownDimensions(space: Space, config: SpaceConfig): FilterDimension[] {
  return filterDimensions(space, config)
}

/**
 * Pair each stored card with its dimension descriptor, dropping cards whose
 * dimension is not currently available.
 *
 * ⚠️ A card on a disabled field is HIDDEN, never deleted: unlike filters, cards
 * are persisted config, so re-enabling the field must bring the card back with
 * its title intact. Nothing here writes to config.dashboardCards.
 */
export function visibleDashboardCards(
  cards: DashboardCardDef[],
  dimensions: FilterDimension[],
): { card: DashboardCardDef; dimension: FilterDimension }[] {
  const byKey = new Map(dimensions.map((d) => [d.key, d]))
  const out: { card: DashboardCardDef; dimension: FilterDimension }[] = []
  for (const card of cards) {
    const dimension = byKey.get(card.dimensions[0])
    if (dimension) out.push({ card, dimension })
  }
  return out
}

/** A card's heading: the user's override, else the dimension's own label. */
export function cardTitle(card: DashboardCardDef, dim: FilterDimension): string {
  return card.title?.trim() || `By ${dim.label.toLowerCase()}`
}
