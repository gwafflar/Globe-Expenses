// useTransactionFilters.ts — client-side filtering & search for transactions.
//
// All filtering happens in-memory on the already-loaded transaction array.
// No extra Firestore reads needed — this is pure JS filtering via useMemo.
//
// Filter dimensions:
//   category, currency, country, city, paymentMethod
//   + paidBy, beneficiaries (multi-user travels only)
//
// Search: fuzzy match on transaction name (case-insensitive substring),
//         or exact match on amount (if the search term is a number).

import { useMemo, useState, useCallback } from 'react'
import type { TransactionWithStatus } from './useTransactions'
import type { Travel } from '@/travels/types'

// Sentinel value representing transactions where the field is undefined/empty.
// Stored in the filter Set and options array; the UI renders it as "Undefined".
export const UNDEFINED_FILTER = '__undefined__'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The filter dimensions that can be active. Each maps to a Set of selected values. */
export type FilterDimension =
  | 'category'
  | 'currency'
  | 'country'
  | 'city'
  | 'paymentMethod'
  | 'paidBy'
  | 'beneficiaries'

/** State for all active filters: dimension → set of selected values. */
export type FilterState = Partial<Record<FilterDimension, Set<string>>>

/** Unique values available for each filter dimension, extracted from the transaction list. */
export type FilterOptions = Record<FilterDimension, string[]>

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseTransactionFiltersResult {
  /** The transaction list after applying all active filters + search. */
  filtered: TransactionWithStatus[]
  /** Current search query string. */
  searchQuery: string
  /** Update the search query. */
  setSearchQuery: (q: string) => void
  /** Current filter state (dimension → selected values). */
  filters: FilterState
  /** Toggle a single value within a dimension (add if absent, remove if present). */
  toggleFilter: (dimension: FilterDimension, value: string) => void
  /** Clear all selected values for one dimension. */
  clearDimension: (dimension: FilterDimension) => void
  /** Clear ALL filters and search in one action. */
  clearAll: () => void
  /** Whether any filter or search is currently active. */
  hasActiveFilters: boolean
  /** Available unique values for each dimension (derived from the full, unfiltered list). */
  options: FilterOptions
  /** Cross-filtered availability: for each dimension, which values would produce results
   *  given all OTHER active filters. Values NOT in this set should be greyed out. */
  availableOptions: FilterOptions
  /** Number of results after filtering. */
  resultCount: number
}

// ---------------------------------------------------------------------------
// Helpers — extracted so they can be reused for cross-filtering
// ---------------------------------------------------------------------------

/** Check if a transaction matches one dimension's filter. */
function matchesDimension(
  tx: TransactionWithStatus,
  dim: FilterDimension,
  selected: Set<string>,
): boolean {
  switch (dim) {
    case 'category': {
      const val = tx.category
      return val ? selected.has(val) : selected.has(UNDEFINED_FILTER)
    }
    case 'currency':
      return selected.has(tx.currency)
    case 'country': {
      const val = tx.country
      return val ? selected.has(val) : selected.has(UNDEFINED_FILTER)
    }
    case 'city': {
      const val = tx.city
      return val ? selected.has(val) : selected.has(UNDEFINED_FILTER)
    }
    case 'paymentMethod': {
      const val = tx.paymentMethod
      return val ? selected.has(val) : selected.has(UNDEFINED_FILTER)
    }
    case 'paidBy':
      return tx.paidBy.some((s) => selected.has(s.travelMemberId))
    case 'beneficiaries':
      return tx.beneficiaries.some((s) => selected.has(s.travelMemberId))
  }
}

/** Check if a transaction matches the search query. */
function matchesSearch(tx: TransactionWithStatus, q: string, searchAsNumber: number): boolean {
  if (!q) return true
  const nameMatch = tx.name.toLowerCase().includes(q)
  const amountMatch = !isNaN(searchAsNumber) && (
    tx.totalAmount === searchAsNumber ||
    tx.totalAmountMain === searchAsNumber ||
    tx.totalAmount.toString().startsWith(searchAsNumber.toString()) ||
    tx.totalAmountMain.toString().startsWith(searchAsNumber.toString())
  )
  return nameMatch || amountMatch
}

/** Extract the value(s) a transaction contributes to a given dimension. */
function extractDimensionValues(tx: TransactionWithStatus, dim: FilterDimension): string[] {
  switch (dim) {
    case 'category':
      return [tx.category ?? UNDEFINED_FILTER]
    case 'currency':
      return [tx.currency]
    case 'country':
      return [tx.country ?? UNDEFINED_FILTER]
    case 'city':
      return [tx.city ?? UNDEFINED_FILTER]
    case 'paymentMethod':
      return [tx.paymentMethod ?? UNDEFINED_FILTER]
    case 'paidBy':
      return tx.paidBy.map((s) => s.travelMemberId)
    case 'beneficiaries':
      return tx.beneficiaries.map((s) => s.travelMemberId)
  }
}

export function useTransactionFilters(
  transactions: TransactionWithStatus[],
  travel: Travel,
  isSolo: boolean,
): UseTransactionFiltersResult {
  // -- State --
  const [filters, setFilters] = useState<FilterState>({})
  const [searchQuery, setSearchQuery] = useState('')

  // -- Derive available options from the FULL transaction list (not filtered) --
  // This ensures all options remain visible even when some filters are active.
  const options = useMemo<FilterOptions>(() => {
    const cats = new Set<string>()
    const currencies = new Set<string>()
    const countries = new Set<string>()
    const cities = new Set<string>()
    const methods = new Set<string>()
    const payers = new Set<string>()
    const beneficiaries = new Set<string>()

    // Track whether any transaction is missing a value for optional fields.
    // If so, we add the UNDEFINED_FILTER sentinel so users can filter for "no value".
    let hasUndefinedCat = false
    let hasUndefinedCountry = false
    let hasUndefinedCity = false
    let hasUndefinedMethod = false

    for (const tx of transactions) {
      if (tx.category) cats.add(tx.category); else hasUndefinedCat = true
      if (tx.currency) currencies.add(tx.currency)
      if (tx.country) countries.add(tx.country); else hasUndefinedCountry = true
      if (tx.city) cities.add(tx.city); else hasUndefinedCity = true
      if (tx.paymentMethod) methods.add(tx.paymentMethod); else hasUndefinedMethod = true
      // For paidBy/beneficiaries, use displayName resolved from travel.members
      for (const s of tx.paidBy) {
        const m = travel.members.find((mem) => mem.travelMemberId === s.travelMemberId)
        if (m) payers.add(m.travelMemberId)
      }
      for (const s of tx.beneficiaries) {
        const m = travel.members.find((mem) => mem.travelMemberId === s.travelMemberId)
        if (m) beneficiaries.add(m.travelMemberId)
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

    return {
      category: catList,
      currency: Array.from(currencies).sort(),
      country: countryList,
      city: cityList,
      paymentMethod: methodList,
      // For member-based filters, store travelMemberId. UI resolves displayName.
      paidBy: Array.from(payers),
      beneficiaries: Array.from(beneficiaries),
    }
  }, [transactions, travel.members])

  // -- Actions --

  const toggleFilter = useCallback((dimension: FilterDimension, value: string) => {
    setFilters((prev) => {
      const current = prev[dimension] ?? new Set<string>()
      const next = new Set(current)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      // If the set is now empty, remove the dimension key entirely
      const updated = { ...prev }
      if (next.size === 0) {
        delete updated[dimension]
      } else {
        updated[dimension] = next
      }
      return updated
    })
  }, [])

  const clearDimension = useCallback((dimension: FilterDimension) => {
    setFilters((prev) => {
      const updated = { ...prev }
      delete updated[dimension]
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters({})
    setSearchQuery('')
  }, [])

  // -- Filtering logic --

  const q = searchQuery.trim().toLowerCase()
  const searchAsNumber = q ? parseFloat(q.replace(',', '.')) : NaN

  // Active dimension keys (for iteration)
  const activeDims = useMemo(
    () => (Object.entries(filters) as [FilterDimension, Set<string>][])
      .filter(([, s]) => s && s.size > 0),
    [filters],
  )

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (!matchesSearch(tx, q, searchAsNumber)) return false
      // Each active dimension is OR within, AND across.
      for (const [dim, selected] of activeDims) {
        if (!matchesDimension(tx, dim, selected)) return false
      }
      return true
    })
  }, [transactions, activeDims, q, searchAsNumber])

  // -- Cross-filtered availability --
  // For each dimension, apply all OTHER filters + search, then collect which values
  // still appear. Values not in this set get greyed out in the UI.
  const ALL_DIMS: FilterDimension[] = [
    'category', 'currency', 'country', 'city', 'paymentMethod', 'paidBy', 'beneficiaries',
  ]

  const availableOptions = useMemo<FilterOptions>(() => {
    // If no filters are active, everything is available — shortcut to avoid N full scans
    if (activeDims.length === 0 && !q) return options

    const result = {} as FilterOptions
    for (const targetDim of ALL_DIMS) {
      // Build the list of filters to apply = all active dims EXCEPT targetDim
      const otherDims = activeDims.filter(([dim]) => dim !== targetDim)

      // Collect values that appear in transactions matching all other filters + search
      const available = new Set<string>()
      for (const tx of transactions) {
        if (!matchesSearch(tx, q, searchAsNumber)) continue
        let passesOthers = true
        for (const [dim, selected] of otherDims) {
          if (!matchesDimension(tx, dim, selected)) { passesOthers = false; break }
        }
        if (!passesOthers) continue
        // This transaction passes all other filters — its values for targetDim are available
        for (const val of extractDimensionValues(tx, targetDim)) {
          available.add(val)
        }
      }
      // Intersect with the full options list (preserve ordering, only include known options)
      result[targetDim] = options[targetDim].filter((v) => available.has(v))
    }
    return result
  }, [transactions, activeDims, options, q, searchAsNumber])

  // -- Derived --

  const hasActiveFilters = activeDims.length > 0 || q.length > 0

  return {
    filtered,
    searchQuery,
    setSearchQuery,
    filters,
    toggleFilter,
    clearDimension,
    clearAll,
    hasActiveFilters,
    options,
    availableOptions,
    resultCount: filtered.length,
  }
}
