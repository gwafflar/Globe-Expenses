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
import { getT, type Messages } from '@/i18n'
import { MESSAGES } from '@/i18n/messages'
import { displayCountryName } from '@/shared/data/pickerData'

/** The dashboard's message namespace, in whichever language the caller wants.
 *  Components pass `useT().dashboard` (and list it in their useMemo deps, so a
 *  language change recomputes the rows); plain callers get the current
 *  language by default. */
type DashboardMessages = Messages['dashboard']

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
  t: DashboardMessages = getT().dashboard,
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
      label: t.breakdown.other(tail.length),
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
      label: t.breakdown.missing({ dimension: dim.label }),
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

/**
 * The label to SHOW for a breakdown/pivot row or section.
 *
 * Country values are stored as English names (and grouped on that stored
 * value), so only the displayed text is translated here, at render time. The
 * row's `label` itself stays the stored value: it is also the colour-hash key
 * (categoryColor) and the sort tie-breaker, which must not change with the
 * language. Other/"No …" rows are already in the UI language.
 */
export function displayValueLabel(
  dim: FilterDimension,
  entry: { label: string; isOther: boolean; isMissing: boolean },
  locale: string,
): string {
  if (entry.isOther || entry.isMissing) return entry.label
  return dim.key === 'country' ? displayCountryName(entry.label, locale) : entry.label
}

// ---------------------------------------------------------------------------
// computePivot — the 2D sibling (Phase 7b, §2)
// ---------------------------------------------------------------------------
//
// ⚠️ Deliberately a SIBLING of computeBreakdown, not a generalisation of it.
// The 1D function applies top-N once, to a flat row list; a pivot applies it at
// two levels over a cell matrix. Forcing one function to serve both would
// complicate the shipped, tested 1D path for no gain, so the two share only
// `optionLabel()` and the sentinels.

/** How many sections a pivot shows before the tail collapses into an "Other"
 *  section. Two high-cardinality dimensions must not render 40 sections. */
export const SECTION_TOP_N = 8

export interface PivotRow {
  /** A secondary dimension value id, UNDEFINED_FILTER, or OTHER_ROW. */
  key: string
  label: string
  total: number
  /** Transactions behind the row — shown on the Other row. */
  count: number
  /** For the collapsed tail only: the keys it stands for, needed by drill-down.
   *  Absent on a normal row, where `key` is the only value to filter on. */
  collapsedKeys?: string[]
  isOther: boolean
  isMissing: boolean
}

export interface PivotSection {
  /** A primary dimension value id, UNDEFINED_FILTER, or OTHER_ROW. */
  key: string
  label: string
  total: number
  count: number
  /** Secondary dimension, already sorted and top-N'd.
   *  EMPTY on the collapsed "Other" section: it is not expandable and drills
   *  straight through (§4), so it has no secondary breakdown to show. */
  rows: PivotRow[]
  /** For the collapsed tail section only — the primary keys it stands for. */
  collapsedKeys?: string[]
  isOther: boolean
  isMissing: boolean
}

export interface Pivot {
  sections: PivotSection[]
  /** Σ over every section, including Other and the missing section. */
  total: number
}

/** The dimension values a row or section drills into: its own key normally,
 *  the whole collapsed set for an "Other" entry. One helper for both levels so
 *  the two drill-down call sites cannot drift apart. */
export function drillValues(entry: { key: string; collapsedKeys?: string[] }): string[] {
  return entry.collapsedKeys ?? [entry.key]
}

/**
 * Group scoped transactions by TWO dimensions, `[primary, secondary]`.
 *
 * The rules mirror computeBreakdown() exactly, so the two cards feel like one
 * feature — applied at both levels:
 *
 *   - only combinations that EXIST produce a row. Empty cells are never
 *     emitted, which is what keeps a sparse pivot readable.
 *   - sections sorted by total descending; rows within a section likewise.
 *   - top-N per section (5 rows) with an "Other · N values" row.
 *   - top-N sections (8) with a trailing "Other · N values" SECTION.
 *   - a missing value becomes "No {dimension}", pinned LAST at both levels
 *     (after the Other entry, not before it).
 *
 * Section totals equal the sum of their own rows (Other row included), and the
 * section totals sum to `total` — the two invariants a user checks by eye.
 */
export function computePivot(
  scoped: ScopedTransaction[],
  primary: FilterDimension,
  secondary: FilterDimension,
  rowTopN: number = TOP_N,
  sectionTopN: number = SECTION_TOP_N,
  t: DashboardMessages = getT().dashboard,
): Pivot {
  // primary key → { amount, count, cells: secondary key → { amount, count } }
  interface Group {
    amount: number
    count: number
    cells: Map<string, { amount: number; count: number }>
  }
  const groups = new Map<string, Group>()
  let total = 0

  for (const { transaction, attributedAmount } of scoped) {
    const pKey = firstValue(transaction, primary)
    const sKey = firstValue(transaction, secondary)

    const group = groups.get(pKey) ?? { amount: 0, count: 0, cells: new Map() }
    group.amount += attributedAmount
    group.count += 1

    const cell = group.cells.get(sKey) ?? { amount: 0, count: 0 }
    cell.amount += attributedAmount
    cell.count += 1
    group.cells.set(sKey, cell)

    groups.set(pKey, group)
    total += attributedAmount
  }

  // The missing-primary group is pinned, not ranked — pull it out before sorting.
  const missingGroup = groups.get(UNDEFINED_FILTER)
  groups.delete(UNDEFINED_FILTER)

  const ranked = Array.from(groups.entries())
    .map(([key, g]) => ({ key, label: optionLabel(primary, key), group: g }))
    .sort((a, b) => b.group.amount - a.group.amount || a.label.localeCompare(b.label))

  const sections: PivotSection[] = ranked.slice(0, sectionTopN).map(({ key, label, group }) => ({
    key,
    label,
    total: group.amount,
    count: group.count,
    rows: buildPivotRows(group.cells, secondary, rowTopN, t),
    isOther: false,
    isMissing: false,
  }))

  const tail = ranked.slice(sectionTopN)
  if (tail.length > 0) {
    sections.push({
      key: OTHER_ROW,
      label: t.breakdown.other(tail.length),
      total: tail.reduce((s, r) => s + r.group.amount, 0),
      count: tail.reduce((s, r) => s + r.group.count, 0),
      // Not expandable: tapping it drills straight through to every collapsed
      // primary value at once, so there is no secondary breakdown to render.
      rows: [],
      collapsedKeys: tail.map((r) => r.key),
      isOther: true,
      isMissing: false,
    })
  }

  if (missingGroup) {
    sections.push({
      key: UNDEFINED_FILTER,
      label: t.breakdown.missing({ dimension: primary.label }),
      total: missingGroup.amount,
      count: missingGroup.count,
      // A data-completeness bucket still breaks down normally — knowing WHAT
      // is missing a country is the whole reason to open it.
      rows: buildPivotRows(missingGroup.cells, secondary, rowTopN, t),
      isOther: false,
      isMissing: true,
    })
  }

  return { sections, total }
}

/** One section's secondary rows: rank, top-N, Other, missing-last. Identical in
 *  shape to computeBreakdown()'s row rules, applied per section. */
function buildPivotRows(
  cells: Map<string, { amount: number; count: number }>,
  secondary: FilterDimension,
  topN: number,
  t: DashboardMessages,
): PivotRow[] {
  const missing = cells.get(UNDEFINED_FILTER)

  const ranked: PivotRow[] = Array.from(cells.entries())
    .filter(([key]) => key !== UNDEFINED_FILTER)
    .map(([key, c]) => ({
      key,
      label: optionLabel(secondary, key),
      total: c.amount,
      count: c.count,
      isOther: false,
      isMissing: false,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))

  const rows = ranked.slice(0, topN)
  const tail = ranked.slice(topN)

  if (tail.length > 0) {
    rows.push({
      key: OTHER_ROW,
      label: t.breakdown.other(tail.length),
      total: tail.reduce((s, r) => s + r.total, 0),
      count: tail.reduce((s, r) => s + r.count, 0),
      collapsedKeys: tail.map((r) => r.key),
      isOther: true,
      isMissing: false,
    })
  }

  if (missing) {
    rows.push({
      key: UNDEFINED_FILTER,
      label: t.breakdown.missing({ dimension: secondary.label }),
      total: missing.amount,
      count: missing.count,
      isOther: false,
      isMissing: true,
    })
  }

  return rows
}

/** The single dimension value a transaction contributes, or the missing-value
 *  sentinel. Same extraction rule computeBreakdown() uses — only single-valued
 *  dimensions are offerable as cards, so `values[0]` is the whole story and no
 *  transaction can be counted twice. */
function firstValue(tx: ScopedTransaction['transaction'], dim: FilterDimension): string {
  const values = dimensionValues(tx, dim)
  return values.length > 0 ? values[0] : UNDEFINED_FILTER
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
 * Pair each stored card with its dimension descriptors, dropping cards whose
 * dimensions are not currently all available.
 *
 * ⚠️ A card on a disabled field is HIDDEN, never deleted: unlike filters, cards
 * are persisted config, so re-enabling the field must bring the card back with
 * its title intact. Nothing here writes to config.dashboardCards.
 *
 * ⚠️ A pivot needs BOTH dimensions. It is deliberately NOT degraded to 1D when
 * one of them is disabled: that would show a card whose title promises two
 * dimensions and whose numbers are a different aggregation (§6).
 */
export function visibleDashboardCards(
  cards: DashboardCardDef[],
  dimensions: FilterDimension[],
): { card: DashboardCardDef; dims: FilterDimension[] }[] {
  const byKey = new Map(dimensions.map((d) => [d.key, d]))
  const out: { card: DashboardCardDef; dims: FilterDimension[] }[] = []
  for (const card of cards) {
    const dims = card.dimensions.map((k) => byKey.get(k))
    if (dims.every((d): d is FilterDimension => d !== undefined)) out.push({ card, dims })
  }
  return out
}

/**
 * The set of dimension combinations already on the dashboard, for the builder's
 * duplicate check (§5).
 *
 * ⚠️ Computed from the FULL stored card array, not the visible one. A card whose
 * dimension is currently disabled is hidden but still stored, so leaving it out
 * would let the user create a second card that silently collides the moment the
 * field is re-enabled.
 *
 * Keyed on the ORDERED join, because order is meaningful: `country|category`
 * and `category|country` are two legitimate, distinct cards, and a 1D
 * `category` card does not block a 2D `category|country` one.
 *
 * `exceptId` excludes the card being edited from its own duplicate check.
 */
export function usedCardKeys(cards: DashboardCardDef[], exceptId?: string): Set<string> {
  return new Set(
    cards.filter((c) => c.id !== exceptId).map((c) => c.dimensions.join('|')),
  )
}

/** A card's heading: the user's override, else derived from the dimensions.
 *
 *  1D → "By category". 2D → "Category × country", which reads as the question
 *  the card answers and makes the ORDER visible — swapping the pair produces a
 *  visibly different title even though the total is unchanged.
 *
 *  The user's override is stored data and is never translated. The derived
 *  title is UI text, in the language of `t`.
 *
 *  ⚠️ `t` defaults to ENGLISH, not to the current language: sheetExport.ts
 *  calls this to title the blocks of the exported Analysis sheet, and the
 *  workbook content must stay English (the importer relies on it). Dashboard
 *  components pass `useT().dashboard` explicitly. */
export function cardTitle(
  card: DashboardCardDef,
  dims: FilterDimension[],
  t: DashboardMessages = MESSAGES.en.dashboard,
): string {
  const override = card.title?.trim()
  if (override) return override
  if (dims.length < 2) return t.breakdown.byDimension({ dimension: dims[0]?.label ?? '' })
  return t.breakdown.pivotTitle({ primary: dims[0].label, secondary: dims[1].label })
}
