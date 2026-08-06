// filterDimensions.ts — the filter panel's dimension descriptors.
//
// Space refactor Phase 6, §1–§3. Pure module: no React, no Firestore.
//
// The filter panel used to hard-code one section per dimension. It now renders
// generically over the descriptor list this module produces, so enabling a
// custom field in Parameters makes it filterable with no UI change at all.
//
// Three descriptor sources:
//   'core'    — never config-gated as a *field*, but still conditional on the
//               space (currency needs multiCurrency, members need ≥2 members).
//               These are not Tier-2 built-in fields, hence their own source.
//   'builtIn' — Tier-2 fields, gated by config.builtInFields.<key>.
//   'custom'  — Tier-3 user-defined fields, gated by CustomFieldDef.enabled.

import type { CustomValue, LabeledItem, Space, SpaceConfig } from '@/spaces/types'
import { enabledCustomFields } from '@/spaces/config'
import { getTransactionType } from '@/transactions/utils/walletHelpers'
import type { Transaction } from '@/transactions/types'
import type { DateRange } from '@/shared/utils/dateRange'

// ---------------------------------------------------------------------------
// Sentinel values
// ---------------------------------------------------------------------------

/** Represents transactions where an optional field has no value.
 *  Stored in the filter Set and in the option list; rendered as "Undefined". */
export const UNDEFINED_FILTER = '__undefined__'

/** Tri-state option ids for boolean custom fields. An empty selection means
 *  "any"; these two are mutually exclusive in the UI. */
export const BOOL_TRUE = '__true__'
export const BOOL_FALSE = '__false__'

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

export interface FilterDimension {
  /** 'type' | 'currency' | 'paidBy' | 'beneficiaries' for core dimensions,
   *  'country' | 'city' | 'category' | 'paymentMethod' for built-ins,
   *  or the CustomFieldDef.id for custom fields. */
  key: string
  label: string
  emoji?: string
  source: 'core' | 'builtIn' | 'custom'
  /** 'multi'     — pick any number of values (core, built-ins, custom select)
   *  'triState'  — any / yes / no (custom boolean) */
  control: 'multi' | 'triState'
  /** Selectable values. `id` is the value stored in the filter Set (and, for
   *  custom selects, the option id stored on the transaction — never a label). */
  options: LabeledItem[]
  /** True when `options` is the complete, definition-driven set of legal values
   *  (custom fields). False when the options are merely the values observed in
   *  the current transaction list (core + built-ins), where a value vanishing
   *  from the list is not evidence that a selection is stale.
   *  reconcileFilters() only prunes selections on closed dimensions. */
  optionsAreClosed: boolean
}

/** Values observed in the transaction list, keyed by core/built-in dimension
 *  key, already in display order. Supplied by the hook; the descriptors for
 *  core and built-in dimensions have no other source of options. */
export type ObservedValues = Partial<Record<string, string[]>>

/** dimension key → set of selected value ids. Custom fields are keyed by
 *  CustomFieldDef.id, so this map is `string`-keyed rather than a closed union. */
export type FilterState = Partial<Record<string, Set<string>>>

/**
 * A filter selection pushed in from OUTSIDE the transactions tab — currently
 * the dashboard drill-down (Phase 7a §5). This is the tab's set-from-outside
 * entry point: callers build one of these instead of reaching into the filter
 * hook's internals.
 *
 * Applying it REPLACES every existing filter and the search query. The user
 * tapped a number and expects to see exactly the transactions behind it.
 */
export interface FilterSelection {
  /** A FilterDimension.key. */
  dimensionKey: string
  /** Value ids to select. Several at once for a collapsed "Other" row. */
  values: string[]
}

export interface FilterRequest {
  /** Changes on every request. Required because the same dimension/value pair
   *  can legitimately be requested twice in a row (tap a row, clear filters,
   *  tap the same row again) and the payload alone would look unchanged. */
  nonce: number
  /** One entry for a 1D breakdown row, two for a 2D pivot cell (Phase 7b).
   *  Entries are ANDed, which is what the filter state already does across
   *  dimensions — so this is a shape change, not a behaviour change. */
  selections: FilterSelection[]
  /** ⚠️ Carried deliberately: without the dashboard's date range the drilled
   *  list would not sum to the number the user tapped. */
  range: DateRange
}

// ---------------------------------------------------------------------------
// Static (core + built-in) dimension metadata
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  expense: 'Expense',
  transfer: 'Transfer',
  withdrawal: 'Withdrawal',
  adjustment: 'Adjustment',
}

interface StaticMeta {
  key: string
  label: string
  emoji: string
  source: 'core' | 'builtIn'
  /** Whether the space's config makes this dimension available at all. */
  isAvailable: (config: SpaceConfig, isSolo: boolean) => boolean
  /** The value(s) a transaction contributes to this dimension. Also drives
   *  matching: a transaction matches when any extracted value is selected. */
  extract: (tx: Transaction) => string[]
  /** Renders a raw stored value for display. Keeps every value-specific label
   *  rule (type names, member names) inside the descriptor rather than in the
   *  panel — the panel must never branch on a dimension key. */
  labelFor?: (value: string, space: Space) => string
}

/** Ordered exactly as the hard-coded panel used to list them, so a legacy space
 *  renders the same chips in the same order as before the refactor. */
const STATIC_META: StaticMeta[] = [
  {
    key: 'type',
    label: 'Type',
    emoji: '📋',
    source: 'core',
    // Always available: existing withdrawals/adjustments stay visible and
    // filterable in a space where wallets were later turned off (SPEC §6.1).
    isAvailable: () => true,
    extract: (tx) => [getTransactionType(tx)],
    labelFor: (value) => TYPE_LABELS[value] ?? value,
  },
  {
    key: 'category',
    label: 'Category',
    emoji: '🏷️',
    source: 'builtIn',
    isAvailable: (config) => config.builtInFields.category,
    extract: (tx) => [tx.category ?? UNDEFINED_FILTER],
  },
  {
    key: 'currency',
    label: 'Currency',
    emoji: '💱',
    source: 'core',
    // Core field, but meaningless when every transaction is in the main
    // currency — same visibility rule as the form's currency pill (SPEC §6.2).
    isAvailable: (config) => config.features.multiCurrency,
    extract: (tx) => [tx.currency],
  },
  {
    key: 'country',
    label: 'Country',
    emoji: '🌍',
    source: 'builtIn',
    isAvailable: (config) => config.builtInFields.country,
    extract: (tx) => [tx.country ?? UNDEFINED_FILTER],
  },
  {
    key: 'city',
    label: 'City',
    emoji: '🏙️',
    source: 'builtIn',
    isAvailable: (config) => config.builtInFields.city,
    extract: (tx) => [tx.city ?? UNDEFINED_FILTER],
  },
  {
    key: 'paymentMethod',
    label: 'Payment',
    emoji: '💳',
    source: 'builtIn',
    isAvailable: (config) => config.builtInFields.paymentMethod,
    extract: (tx) => [tx.paymentMethod ?? UNDEFINED_FILTER],
  },
  {
    key: 'paidBy',
    label: 'Paid by',
    emoji: '🧑',
    source: 'core',
    isAvailable: (_config, isSolo) => !isSolo,
    extract: (tx) => tx.paidBy.map((s) => s.travelMemberId),
    labelFor: (value, space) =>
      space.members.find((m) => m.travelMemberId === value)?.displayName ?? value,
  },
  {
    key: 'beneficiaries',
    label: 'For',
    emoji: '👥',
    source: 'core',
    isAvailable: (_config, isSolo) => !isSolo,
    extract: (tx) => tx.beneficiaries.map((s) => s.travelMemberId),
    labelFor: (value, space) =>
      space.members.find((m) => m.travelMemberId === value)?.displayName ?? value,
  },
]

const STATIC_BY_KEY = new Map(STATIC_META.map((m) => [m.key, m]))

// ---------------------------------------------------------------------------
// Descriptor builders
// ---------------------------------------------------------------------------

/** The CONFIG-GATED dimensions a space can filter on, in display order:
 *  enabled built-ins first (existing order), then enabled custom fields in
 *  definition order. Custom 'text' fields are NOT dimensions — free text has no
 *  meaningful option list, so it feeds the search box instead (§4).
 *
 *  Core dimensions (type, currency, members) are deliberately absent — see
 *  allFilterDimensions() for the full list the panel renders. */
export function filterDimensions(
  space: Space,
  config: SpaceConfig,
  observed: ObservedValues = {},
): FilterDimension[] {
  const builtIns = STATIC_META.filter((m) => m.source === 'builtIn' && m.isAvailable(config, false))
    .map((m) => staticDimension(m, space, observed))

  return [...builtIns, ...customDimensions(config)]
}

/** Everything the panel renders: core dimensions interleaved with the built-ins
 *  in the historical display order, then the custom fields. */
export function allFilterDimensions(
  space: Space,
  config: SpaceConfig,
  isSolo: boolean,
  observed: ObservedValues = {},
): FilterDimension[] {
  const statics = STATIC_META.filter((m) => m.isAvailable(config, isSolo))
    .map((m) => staticDimension(m, space, observed))

  return [...statics, ...customDimensions(config)]
}

function staticDimension(meta: StaticMeta, space: Space, observed: ObservedValues): FilterDimension {
  const values = observed[meta.key] ?? []
  return {
    key: meta.key,
    label: meta.label,
    emoji: meta.emoji,
    source: meta.source,
    control: 'multi',
    options: values.map((value) => ({
      id: value,
      // The sentinel's label is uniform across every dimension, so it lives
      // here rather than in each descriptor.
      label: value === UNDEFINED_FILTER ? 'Undefined' : (meta.labelFor?.(value, space) ?? value),
    })),
    // Observed values, not a definition: a category that disappears from the
    // list must not silently clear the user's active filter.
    optionsAreClosed: false,
  }
}

function customDimensions(config: SpaceConfig): FilterDimension[] {
  const dims: FilterDimension[] = []
  for (const def of enabledCustomFields(config)) {
    if (def.type === 'select') {
      dims.push({
        key: def.id,
        label: def.label,
        emoji: def.emoji,
        source: 'custom',
        control: 'multi',
        // Option ids, never labels (SPEC §8 invariant 6).
        options: (def.options ?? []).map((o) => ({
          id: o.id,
          label: o.emoji ? `${o.emoji} ${o.label}` : o.label,
        })),
        optionsAreClosed: true,
      })
    } else if (def.type === 'boolean') {
      dims.push({
        key: def.id,
        label: def.label,
        emoji: def.emoji,
        source: 'custom',
        control: 'triState',
        options: [
          { id: BOOL_TRUE, label: 'Yes' },
          { id: BOOL_FALSE, label: 'No' },
        ],
        optionsAreClosed: true,
      })
    }
    // 'text' → not a dimension; searched instead (§4).
  }
  return dims
}

/** The ids of enabled custom 'text' fields, whose values feed the search box. */
export function searchableCustomFieldIds(config: SpaceConfig): string[] {
  return enabledCustomFields(config)
    .filter((def) => def.type === 'text')
    .map((def) => def.id)
}

// ---------------------------------------------------------------------------
// Value extraction — the single place a transaction is mapped onto a dimension
// ---------------------------------------------------------------------------

/** The value(s) a transaction contributes to one dimension.
 *  A transaction matches a dimension's filter when any of these is selected —
 *  so this one function drives both filtering and cross-filtered availability. */
export function dimensionValues(tx: Transaction, dim: FilterDimension): string[] {
  if (dim.source !== 'custom') {
    return STATIC_BY_KEY.get(dim.key)?.extract(tx) ?? []
  }
  const raw: CustomValue | undefined = tx.custom?.[dim.key]
  if (dim.control === 'triState') {
    // ⚠️ Absent means false: buildCustomPayload() omits `false` entirely, so a
    // transaction saved before the field existed — or saved with the box
    // unticked — has no key at all and must still match the "No" filter.
    return [raw === true ? BOOL_TRUE : BOOL_FALSE]
  }
  return typeof raw === 'string' && raw !== '' ? [raw] : []
}

/** True when the transaction satisfies one dimension's active selection. */
export function matchesDimension(
  tx: Transaction,
  dim: FilterDimension,
  selected: Set<string>,
): boolean {
  return dimensionValues(tx, dim).some((v) => selected.has(v))
}

// ---------------------------------------------------------------------------
// Stale filter reconciliation (§3)
// ---------------------------------------------------------------------------

/** Drops filter state that no longer corresponds to anything selectable:
 *
 *  - a filter on a dimension that is no longer available (field disabled, or
 *    member filters in a space that became solo) is removed entirely — never
 *    left invisibly narrowing the list;
 *  - on a CLOSED dimension (custom fields, whose options come from the
 *    definition), selected values that no longer exist are dropped while the
 *    dimension's other selections survive;
 *  - everything else is untouched.
 *
 *  Returns the SAME object reference when nothing changed, so callers can
 *  compare identity and skip a re-render. Re-enabling a field does not restore
 *  the old selection — filters are ephemeral UI state, not data. */
export function reconcileFilters(
  filters: FilterState,
  dimensions: FilterDimension[],
): FilterState {
  const byKey = new Map(dimensions.map((d) => [d.key, d]))
  let changed = false
  const next: FilterState = {}

  for (const [key, selected] of Object.entries(filters)) {
    if (!selected || selected.size === 0) {
      changed = true
      continue
    }
    const dim = byKey.get(key)
    if (!dim) {
      changed = true // dimension gone → drop the whole filter
      continue
    }
    if (!dim.optionsAreClosed) {
      next[key] = selected
      continue
    }
    const legal = new Set(dim.options.map((o) => o.id))
    const kept = new Set(Array.from(selected).filter((v) => legal.has(v)))
    if (kept.size === selected.size) {
      next[key] = selected
      continue
    }
    changed = true
    if (kept.size > 0) next[key] = kept
  }

  return changed ? next : filters
}
