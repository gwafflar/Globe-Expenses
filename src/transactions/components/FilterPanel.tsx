// FilterPanel.tsx — collapsible filter & search UI for the Transactions tab.
//
// Structure:
//   1. Search bar (always visible when panel is open)
//   2. Filter dimension chips — tap to expand that dimension's options
//   3. Multi-select checkboxes for the expanded dimension
//   4. Active filter badges showing what's selected
//   5. "Clear all" button when any filter is active
//
// Everything is client-side. No Firestore reads.

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import type { Space } from '@/spaces/types'
import {
  UNDEFINED_FILTER,
  type FilterDimension,
  type FilterState,
  type FilterOptions,
} from '@/transactions/hooks/useTransactionFilters'

// ---------------------------------------------------------------------------
// Dimension metadata — label, emoji, display order
// ---------------------------------------------------------------------------

interface DimensionMeta {
  key: FilterDimension
  label: string
  emoji: string
  /** Only show this dimension in multi-user spaces */
  multiUserOnly?: boolean
}

const DIMENSIONS: DimensionMeta[] = [
  { key: 'type', label: 'Type', emoji: '📋' },
  { key: 'category', label: 'Category', emoji: '🏷️' },
  { key: 'currency', label: 'Currency', emoji: '💱' },
  { key: 'country', label: 'Country', emoji: '🌍' },
  { key: 'city', label: 'City', emoji: '🏙️' },
  { key: 'paymentMethod', label: 'Payment', emoji: '💳' },
  { key: 'paidBy', label: 'Paid by', emoji: '🧑', multiUserOnly: true },
  { key: 'beneficiaries', label: 'For', emoji: '👥', multiUserOnly: true },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  filters: FilterState
  options: FilterOptions
  /** Cross-filtered: which values still produce results given other active filters. */
  availableOptions: FilterOptions
  onToggleFilter: (dimension: FilterDimension, value: string) => void
  onClearDimension: (dimension: FilterDimension) => void
  onClearAll: () => void
  hasActiveFilters: boolean
  resultCount: number
  totalCount: number
  space: Space
  isSolo: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterPanel({
  searchQuery,
  onSearchChange,
  filters,
  options,
  availableOptions,
  onToggleFilter,
  onClearDimension,
  onClearAll,
  hasActiveFilters,
  resultCount,
  totalCount,
  space,
  isSolo,
}: FilterPanelProps) {
  // Which dimension is currently expanded (showing its checkboxes). null = none.
  const [expandedDim, setExpandedDim] = useState<FilterDimension | null>(null)

  // Filter out dimensions that don't apply (solo space → hide paidBy/beneficiaries)
  // and dimensions that have no options (e.g. no countries recorded)
  const visibleDimensions = DIMENSIONS.filter((d) => {
    if (d.multiUserOnly && isSolo) return false
    if (options[d.key].length === 0) return false
    return true
  })

  /** Resolve a value to a display label. For member dimensions, resolve travelMemberId → displayName.
   *  For the UNDEFINED_FILTER sentinel, returns "Undefined". */
  /** Map for human-readable transaction type labels. */
  const TYPE_LABELS: Record<string, string> = {
    expense: 'Expense',
    transfer: 'Transfer',
    withdrawal: 'Withdrawal',
    adjustment: 'Adjustment',
  }

  function displayLabel(dimension: FilterDimension, value: string): string {
    if (value === UNDEFINED_FILTER) return 'Undefined'
    if (dimension === 'type') return TYPE_LABELS[value] ?? value
    if (dimension === 'paidBy' || dimension === 'beneficiaries') {
      return space.members.find((m) => m.travelMemberId === value)?.displayName ?? value
    }
    return value
  }

  /** Count how many values are selected for a given dimension. */
  function selectedCount(dimension: FilterDimension): number {
    return filters[dimension]?.size ?? 0
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background p-3">
      {/* Search bar */}
      <div className="relative">
        <Input
          type="text"
          placeholder="Search name or amount…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
        {/* Search icon positioned inside the input */}
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
          🔍
        </span>
      </div>

      {/* Dimension chips — horizontal scrollable row */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {visibleDimensions.map((dim) => {
          const count = selectedCount(dim.key)
          const isExpanded = expandedDim === dim.key
          return (
            <button
              key={dim.key}
              type="button"
              onClick={() => setExpandedDim(isExpanded ? null : dim.key)}
              className={`
                flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium
                transition-colors
                ${isExpanded
                  ? 'border-primary bg-primary/10 text-primary'
                  : count > 0
                    ? 'border-primary/50 bg-primary/5 text-primary'
                    : 'border-input bg-background text-muted-foreground hover:bg-accent'
                }
              `}
            >
              <span>{dim.emoji}</span>
              <span>{dim.label}</span>
              {/* Badge showing how many values are selected */}
              {count > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Expanded dimension — multi-select checkboxes */}
      {expandedDim && (
        <div className="space-y-1">
          {/* Dimension header with clear button */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {DIMENSIONS.find((d) => d.key === expandedDim)?.label}
            </span>
            {selectedCount(expandedDim) > 0 && (
              <button
                type="button"
                onClick={() => onClearDimension(expandedDim)}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Checkbox list — wraps into multiple rows.
              Values not in availableOptions are greyed out (no matching transactions
              given the other active filters), but remain clickable. */}
          <div className="flex flex-wrap gap-1.5">
            {options[expandedDim].map((value) => {
              const isSelected = filters[expandedDim]?.has(value) ?? false
              // A value is "available" if it appears in the cross-filtered set
              const isAvailable = availableOptions[expandedDim].includes(value)
              const label = displayLabel(expandedDim, value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggleFilter(expandedDim, value)}
                  className={`
                    rounded-md border px-2 py-1 text-xs transition-colors
                    ${value === UNDEFINED_FILTER ? 'italic' : ''}
                    ${isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : !isAvailable
                        ? 'border-input bg-muted text-muted-foreground/40 line-through'
                        : value === UNDEFINED_FILTER
                          ? 'border-dashed border-input bg-background text-muted-foreground hover:bg-accent'
                          : 'border-input bg-background text-foreground hover:bg-accent'
                    }
                  `}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Active filter summary badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Show each active filter as a removable badge */}
          {(Object.entries(filters) as [FilterDimension, Set<string>][]).map(([dim, selected]) =>
            Array.from(selected).map((value) => (
              <span
                key={`${dim}-${value}`}
                className={`inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ${value === UNDEFINED_FILTER ? 'italic' : ''}`}
              >
                {/* Prefix with dimension label for "Undefined" badges to disambiguate */}
                {value === UNDEFINED_FILTER
                  ? `${DIMENSIONS.find((d) => d.key === dim)?.label ?? dim}: Undefined`
                  : displayLabel(dim, value)}
                {/* × button to remove this single filter value */}
                <button
                  type="button"
                  onClick={() => onToggleFilter(dim, value)}
                  className="ml-0.5 text-primary/60 hover:text-primary"
                >
                  ×
                </button>
              </span>
            )),
          )}

          {/* Result count + Clear all button */}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {resultCount} / {totalCount}
            </span>
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
            >
              Clear all
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
