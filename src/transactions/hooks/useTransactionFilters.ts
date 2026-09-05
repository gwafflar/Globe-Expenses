// useTransactionFilters.ts — client-side filtering & search for transactions.
//
// All filtering happens in-memory on the already-loaded transaction array.
// No extra Firestore reads needed — this is pure JS filtering via useMemo.
//
// Which dimensions exist is decided by the space's config, not by this file:
// see filterDimensions.ts (Space refactor Phase 6, §1). Core dimensions (type,
// currency, paidBy, beneficiaries), enabled built-ins (category, country, city,
// paymentMethod) and enabled custom select/boolean fields all arrive as the
// same descriptor shape, so everything below is generic over `dimensions`.
//
// Search: substring match on transaction name and notes, exact/prefix match on
//         amount, and substring match on enabled custom 'text' field values.

import { useMemo, useState, useCallback } from 'react'
import type { TransactionWithStatus } from './useTransactions'
import type { Space } from '@/spaces/types'
import { getSpaceConfig, enabledCustomFields } from '@/spaces/config'
import { getTransactionType, countsAsSpending } from '@/transactions/utils/walletHelpers'
import {
  UNDEFINED_FILTER,
  allFilterDimensions,
  dimensionValues,
  matchesDimension,
  reconcileFilters,
  searchableCustomFieldIds,
  type FilterDimension,
  type FilterRequest,
  type FilterState,
  type ObservedValues,
} from '@/transactions/utils/filterDimensions'
import { ALL_TIME, isDateInRange, type DateRange } from '@/shared/utils/dateRange'

export {
  UNDEFINED_FILTER,
  BOOL_TRUE,
  BOOL_FALSE,
  type FilterDimension,
  type FilterRequest,
  type FilterState,
} from '@/transactions/utils/filterDimensions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Value ids still reachable for each dimension, keyed by dimension key. */
export type AvailableOptions = Record<string, Set<string>>

export interface UseTransactionFiltersResult {
  /** The transaction list after applying all active filters + search. */
  filtered: TransactionWithStatus[]
  /** Current search query string. */
  searchQuery: string
  /** Update the search query. */
  setSearchQuery: (q: string) => void
  /** The dimensions this space can currently filter on, in display order. */
  dimensions: FilterDimension[]
  /** Current filter state, already reconciled against `dimensions` (§3): it
   *  never contains a dimension or option that no longer exists. */
  filters: FilterState
  /** Toggle a single value within a dimension (add if absent, remove if present). */
  toggleFilter: (key: string, value: string) => void
  /** Select exactly one value for a dimension, or clear it with null.
   *  Used by tri-state (boolean) controls, where the choices are exclusive. */
  setExclusiveFilter: (key: string, value: string | null) => void
  /** Clear all selected values for one dimension. */
  clearDimension: (key: string) => void
  /** The active date-range restriction. ALL_TIME means "no restriction".
   *  Set by the dashboard drill-down (§5); there is no in-panel date picker
   *  yet, so the panel only offers to clear it. */
  dateRange: DateRange
  /** Drop the date-range restriction, leaving other filters alone. */
  clearDateRange: () => void
  /** Whether the list is restricted to spending transactions (countsAsSpending).
   *  Set by the dashboard drill-down (§5) so the drilled list contains exactly
   *  the transactions the card counted; there is no in-panel control to switch
   *  it on, only to clear it. */
  spendingOnly: boolean
  /** Drop the spending-only restriction, leaving other filters alone. */
  clearSpendingOnly: () => void
  /** Clear ALL filters, the date range and the search in one action. */
  clearAll: () => void
  /** Whether any filter or search is currently active. */
  hasActiveFilters: boolean
  /** Cross-filtered availability: for each dimension, which values would still
   *  produce results given all OTHER active filters. Values outside this set
   *  should be greyed out. */
  availableOptions: AvailableOptions
  /** Number of results after filtering. */
  resultCount: number
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Check if a transaction matches the search query.
 *  Every free-text field the space currently has enabled is searched: a
 *  disabled field is hidden everywhere else, so it must not produce search
 *  hits either. `searchNotes` is config.builtInFields.notes; `textFieldIds`
 *  are the enabled custom 'text' fields (§4). */
function matchesSearch(
  tx: TransactionWithStatus,
  q: string,
  searchAsNumber: number,
  searchNotes: boolean,
  textFieldIds: string[],
): boolean {
  if (!q) return true
  const nameMatch = tx.name.toLowerCase().includes(q)
  const notesMatch = searchNotes && (tx.notes?.toLowerCase().includes(q) ?? false)
  const amountMatch = !isNaN(searchAsNumber) && (
    tx.totalAmount === searchAsNumber ||
    tx.totalAmountMain === searchAsNumber ||
    tx.totalAmount.toString().startsWith(searchAsNumber.toString()) ||
    tx.totalAmountMain.toString().startsWith(searchAsNumber.toString())
  )
  const customMatch = textFieldIds.some((id) => {
    const v = tx.custom?.[id]
    return typeof v === 'string' && v.toLowerCase().includes(q)
  })
  return nameMatch || notesMatch || amountMatch || customMatch
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTransactionFilters(
  transactions: TransactionWithStatus[],
  space: Space,
  isSolo: boolean,
  /** A selection pushed in from outside the tab — see FilterRequest. The
   *  dashboard drill-down uses this; pass undefined when there is none. */
  request?: FilterRequest,
): UseTransactionFiltersResult {
  // -- State --
  const [filters, setFilters] = useState<FilterState>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME)
  // Spending-only restriction, set by the dashboard drill-down. Modelled on
  // dateRange rather than on the `type` filter: it is a restriction pushed in
  // from outside that the panel can only display and clear, and the type
  // dimension cannot express it anyway (a balance-only adjustment IS an
  // adjustment but is not spending).
  const [spendingOnly, setSpendingOnly] = useState(false)

  // -- External filter request (§5) --
  // Which request has already been consumed. Compared by nonce, not by value:
  // drilling into the same row twice in a row is a legitimate repeat request.
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null)

  // Same "adjust state during render" escape hatch as the reconciliation below
  // (and for the same reason: an effect would apply the filters one commit too
  // late, so the user would see the unfiltered list flash first). Identity-
  // guarded by the nonce, so it runs exactly once per request and converges.
  if (request && request.nonce !== appliedNonce) {
    setAppliedNonce(request.nonce)
    // REPLACE, never merge: the user tapped a number and expects to see
    // exactly the transactions behind it. Several selections (a 2D pivot cell)
    // are ANDed, which is what the filter state does across dimensions anyway.
    const next: FilterState = {}
    for (const sel of request.selections) next[sel.dimensionKey] = new Set(sel.values)
    setFilters(next)
    setDateRange(request.range)
    setSpendingOnly(request.spendingOnly ?? false)
    setSearchQuery('')
  }

  const clearDateRange = useCallback(() => setDateRange(ALL_TIME), [])
  const clearSpendingOnly = useCallback(() => setSpendingOnly(false), [])

  // Legacy spaces (no space.config) resolve to travel-mode defaults, so the
  // dimension list below is identical to the old hard-coded one.
  const config = useMemo(() => getSpaceConfig(space), [space])

  // -- Observed values for the core + built-in dimensions --
  // Derived from the FULL transaction list (not the filtered one) so options
  // stay visible while filters are active. A custom select's real options come
  // from the field definition, not from the data — the ONLY thing observed for
  // one is whether some transaction has no value, which the definition cannot
  // know and which the "No <field>" filter needs to exist.
  const observed = useMemo<ObservedValues>(() => {
    const types = new Set<string>()
    const cats = new Set<string>()
    const currencies = new Set<string>()
    const countries = new Set<string>()
    const cities = new Set<string>()
    const methods = new Set<string>()
    const payers = new Set<string>()
    const beneficiaries = new Set<string>()

    // Track whether any transaction is missing a value for an optional field.
    // If so, the UNDEFINED_FILTER sentinel is appended so "no value" is filterable.
    let hasUndefinedCat = false
    let hasUndefinedCountry = false
    let hasUndefinedCity = false
    let hasUndefinedMethod = false

    for (const tx of transactions) {
      types.add(getTransactionType(tx))
      if (tx.category) cats.add(tx.category); else hasUndefinedCat = true
      if (tx.currency) currencies.add(tx.currency)
      if (tx.country) countries.add(tx.country); else hasUndefinedCountry = true
      if (tx.city) cities.add(tx.city); else hasUndefinedCity = true
      if (tx.paymentMethod) methods.add(tx.paymentMethod); else hasUndefinedMethod = true
      // Member dimensions store travelMemberId; only known members are offered.
      for (const s of tx.paidBy) {
        if (space.members.some((mem) => mem.travelMemberId === s.travelMemberId)) {
          payers.add(s.travelMemberId)
        }
      }
      for (const s of tx.beneficiaries) {
        if (space.members.some((mem) => mem.travelMemberId === s.travelMemberId)) {
          beneficiaries.add(s.travelMemberId)
        }
      }
    }

    // Append the "Undefined" option at the end when some transactions lack the field
    const catList = Array.from(cats).sort()
    if (hasUndefinedCat) catList.push(UNDEFINED_FILTER)
    const countryList = Array.from(countries).sort()
    if (hasUndefinedCountry) countryList.push(UNDEFINED_FILTER)
    const cityList = Array.from(cities).sort()
    if (hasUndefinedCity) cityList.push(UNDEFINED_FILTER)
    const methodList = Array.from(methods).sort()
    if (hasUndefinedMethod) methodList.push(UNDEFINED_FILTER)

    // Custom selects: the sentinel alone, keyed by field id. The field's own
    // options are added by customDimensions() from the definition.
    const customObserved: ObservedValues = {}
    for (const def of enabledCustomFields(config)) {
      if (def.type !== 'select') continue
      const someMissing = transactions.some((tx) => {
        const v = tx.custom?.[def.id]
        return !(typeof v === 'string' && v !== '')
      })
      if (someMissing) customObserved[def.id] = [UNDEFINED_FILTER]
    }

    return {
      // Type is ordered semantically: expense first, then transfer, withdrawal, adjustment
      type: ['expense', 'transfer', 'withdrawal', 'adjustment'].filter((t) => types.has(t)),
      category: catList,
      currency: Array.from(currencies).sort(),
      country: countryList,
      city: cityList,
      paymentMethod: methodList,
      paidBy: Array.from(payers),
      beneficiaries: Array.from(beneficiaries),
      ...customObserved,
    }
  }, [transactions, space.members, config])

  // -- The dimension list this space can filter on --
  const dimensions = useMemo(
    () => allFilterDimensions(space, config, isSolo, observed),
    [space, config, isSolo, observed],
  )

  // Enabled custom 'text' fields feed the search box rather than the panel (§4).
  const textFieldIds = useMemo(() => searchableCustomFieldIds(config), [config])

  // Notes is a toggleable built-in, so it is searched only while enabled.
  const searchNotes = config.builtInFields.notes

  // -- Stale filter reconciliation (§3) --
  // Applied as a pure derivation first, so a filter on a just-disabled field
  // never narrows THIS render's results, then written back to state so the
  // stale selection is really gone (re-enabling a field must not resurrect it).
  //
  // React pattern note: this is the "adjust state during render" escape hatch,
  // not an effect. Calling setState during the render of the *same* component
  // makes React discard this render and immediately re-run it with the new
  // state — no extra commit, no flash of stale UI, and no cascading-render
  // lint warning. It is safe only because it is guarded by an identity check
  // and reconcileFilters() is idempotent (reconciling an already-clean state
  // returns the very same object), so this converges after one extra pass.
  const effectiveFilters = useMemo(
    () => reconcileFilters(filters, dimensions),
    [filters, dimensions],
  )
  if (effectiveFilters !== filters) setFilters(effectiveFilters)

  // -- Actions --

  const toggleFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const current = prev[key] ?? new Set<string>()
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      // An empty set means "no filter" — remove the key entirely
      const updated = { ...prev }
      if (next.size === 0) delete updated[key]
      else updated[key] = next
      return updated
    })
  }, [])

  const setExclusiveFilter = useCallback((key: string, value: string | null) => {
    setFilters((prev) => {
      const updated = { ...prev }
      if (value === null) delete updated[key]
      else updated[key] = new Set([value])
      return updated
    })
  }, [])

  const clearDimension = useCallback((key: string) => {
    setFilters((prev) => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters({})
    setSearchQuery('')
    setDateRange(ALL_TIME)
    setSpendingOnly(false)
  }, [])

  // -- Filtering logic --

  const q = searchQuery.trim().toLowerCase()
  const searchAsNumber = q ? parseFloat(q.replace(',', '.')) : NaN

  /** Active filters paired with their descriptor. Built from `dimensions`, so a
   *  filter whose dimension disappeared simply isn't here. */
  const activeDims = useMemo(
    () => dimensions
      .map((dim) => [dim, effectiveFilters[dim.key]] as const)
      .filter((entry): entry is readonly [FilterDimension, Set<string>] =>
        entry[1] !== undefined && entry[1].size > 0),
    [dimensions, effectiveFilters],
  )

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (!matchesSearch(tx, q, searchAsNumber, searchNotes, textFieldIds)) return false
      // ⚠️ Goes through isDateInRange → parseTxDate: "DD-MM-YYYY" does not
      // compare lexicographically.
      if (!isDateInRange(tx.date, dateRange)) return false
      if (spendingOnly && !countsAsSpending(tx)) return false
      // Each active dimension is OR within, AND across.
      for (const [dim, selected] of activeDims) {
        if (!matchesDimension(tx, dim, selected)) return false
      }
      return true
    })
  }, [transactions, activeDims, q, searchAsNumber, searchNotes, textFieldIds, dateRange, spendingOnly])

  // -- Cross-filtered availability --
  // For each dimension, apply all OTHER filters + search, then collect which
  // values still appear. Values not in this set get greyed out in the UI.
  const availableOptions = useMemo<AvailableOptions>(() => {
    const result: AvailableOptions = {}

    // Shortcut: with nothing active every option is reachable.
    if (activeDims.length === 0 && !q && dateRange.preset === 'all' && !spendingOnly) {
      for (const dim of dimensions) result[dim.key] = new Set(dim.options.map((o) => o.id))
      return result
    }

    for (const target of dimensions) {
      const otherDims = activeDims.filter(([dim]) => dim.key !== target.key)
      const available = new Set<string>()
      for (const tx of transactions) {
        if (!matchesSearch(tx, q, searchAsNumber, searchNotes, textFieldIds)) continue
        if (!isDateInRange(tx.date, dateRange)) continue
        if (spendingOnly && !countsAsSpending(tx)) continue
        let passesOthers = true
        for (const [dim, selected] of otherDims) {
          if (!matchesDimension(tx, dim, selected)) { passesOthers = false; break }
        }
        if (!passesOthers) continue
        for (const val of dimensionValues(tx, target)) available.add(val)
      }
      result[target.key] = available
    }
    return result
  }, [transactions, dimensions, activeDims, q, searchAsNumber, searchNotes, textFieldIds, dateRange, spendingOnly])

  // -- Derived --

  const hasActiveFilters =
    activeDims.length > 0 || q.length > 0 || dateRange.preset !== 'all' || spendingOnly

  return {
    filtered,
    searchQuery,
    setSearchQuery,
    dimensions,
    filters: effectiveFilters,
    toggleFilter,
    setExclusiveFilter,
    clearDimension,
    dateRange,
    clearDateRange,
    spendingOnly,
    clearSpendingOnly,
    clearAll,
    hasActiveFilters,
    availableOptions,
    resultCount: filtered.length,
  }
}
