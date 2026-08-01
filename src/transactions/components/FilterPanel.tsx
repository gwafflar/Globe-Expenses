// FilterPanel.tsx — collapsible filter & search UI for the Transactions tab.
//
// Structure:
//   1. Search bar (always visible when panel is open)
//   2. Filter dimension chips — tap to expand that dimension's options
//   3. Option buttons for the expanded dimension (multi-select, or tri-state
//      Any/Yes/No for boolean custom fields)
//   4. Active filter badges showing what's selected
//   5. "Clear all" button when any filter is active
//
// The panel is generic over the descriptor list produced by filterDimensions.ts:
// it never branches on a dimension key, so an enabled custom field becomes
// filterable with no change here. Everything is client-side; no Firestore reads.

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  UNDEFINED_FILTER,
  type AvailableOptions,
} from '@/transactions/hooks/useTransactionFilters'
import type { FilterDimension, FilterState } from '@/transactions/utils/filterDimensions'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  /** Dimensions to render, in display order (config-derived). */
  dimensions: FilterDimension[]
  filters: FilterState
  /** Cross-filtered: which values still produce results given other active filters. */
  availableOptions: AvailableOptions
  onToggleFilter: (key: string, value: string) => void
  /** Exclusive selection, used by tri-state controls. null clears the dimension. */
  onSetExclusiveFilter: (key: string, value: string | null) => void
  onClearDimension: (key: string) => void
  onClearAll: () => void
  hasActiveFilters: boolean
  resultCount: number
  totalCount: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterPanel({
  searchQuery,
  onSearchChange,
  dimensions,
  filters,
  availableOptions,
  onToggleFilter,
  onSetExclusiveFilter,
  onClearDimension,
  onClearAll,
  hasActiveFilters,
  resultCount,
  totalCount,
}: FilterPanelProps) {
  // Which dimension is currently expanded (showing its options). null = none.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Hide dimensions with nothing to pick from (e.g. no country recorded yet,
  // or a select field whose option list is still empty) — same rule as before.
  const visibleDimensions = dimensions.filter((d) => d.options.length > 0)

  const expanded = visibleDimensions.find((d) => d.key === expandedKey) ?? null

  /** Count how many values are selected for a given dimension. */
  function selectedCount(key: string): number {
    return filters[key]?.size ?? 0
  }

  /** Display label for one option id within a dimension. */
  function optionLabel(dim: FilterDimension, value: string): string {
    return dim.options.find((o) => o.id === value)?.label ?? value
  }

  /** "Undefined" and tri-state Yes/No are meaningless on their own, so their
   *  badges are qualified with the dimension name. A value-level rule — the
   *  panel still never branches on which dimension it is looking at. */
  function needsQualifier(dim: FilterDimension, value: string): boolean {
    return value === UNDEFINED_FILTER || dim.control === 'triState'
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
          const isExpanded = expandedKey === dim.key
          return (
            <button
              key={dim.key}
              type="button"
              // Accessible name is the plain label — the emoji is decoration.
              aria-label={dim.label}
              aria-expanded={isExpanded}
              onClick={() => setExpandedKey(isExpanded ? null : dim.key)}
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
              {dim.emoji && <span>{dim.emoji}</span>}
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

      {/* Expanded dimension — option buttons */}
      {expanded && (
        <div className="space-y-1">
          {/* Dimension header with clear button */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{expanded.label}</span>
            {selectedCount(expanded.key) > 0 && (
              <button
                type="button"
                onClick={() => onClearDimension(expanded.key)}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {expanded.control === 'triState' ? (
            /* Tri-state: Any / Yes / No, mutually exclusive. "Any" is the
               absence of a filter, so it is simply an empty selection. */
            <div className="flex flex-wrap gap-1.5">
              {[{ id: null, label: 'Any' }, ...expanded.options].map((opt) => {
                const isSelected = opt.id === null
                  ? selectedCount(expanded.key) === 0
                  : (filters[expanded.key]?.has(opt.id) ?? false)
                return (
                  <button
                    key={opt.id ?? '__any__'}
                    type="button"
                    onClick={() => onSetExclusiveFilter(expanded.key, opt.id)}
                    className={`
                      rounded-md border px-2 py-1 text-xs transition-colors
                      ${isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background text-foreground hover:bg-accent'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          ) : (
            /* Multi-select. Values with no matching transactions given the
               other active filters are greyed out but remain clickable. */
            <div className="flex flex-wrap gap-1.5">
              {expanded.options.map((opt) => {
                const isSelected = filters[expanded.key]?.has(opt.id) ?? false
                const isAvailable = availableOptions[expanded.key]?.has(opt.id) ?? false
                const isSentinel = opt.id === UNDEFINED_FILTER
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onToggleFilter(expanded.key, opt.id)}
                    className={`
                      rounded-md border px-2 py-1 text-xs transition-colors
                      ${isSentinel ? 'italic' : ''}
                      ${isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : !isAvailable
                          ? 'border-input bg-muted text-muted-foreground/40 line-through'
                          : isSentinel
                            ? 'border-dashed border-input bg-background text-muted-foreground hover:bg-accent'
                            : 'border-input bg-background text-foreground hover:bg-accent'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Active filter summary badges — iterated in dimension display order */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {dimensions.map((dim) =>
            Array.from(filters[dim.key] ?? []).map((value) => (
              <span
                key={`${dim.key}-${value}`}
                className={`inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ${value === UNDEFINED_FILTER ? 'italic' : ''}`}
              >
                {needsQualifier(dim, value)
                  ? `${dim.label}: ${optionLabel(dim, value)}`
                  : optionLabel(dim, value)}
                {/* × button to remove this single filter value */}
                <button
                  type="button"
                  aria-label={`Remove filter ${optionLabel(dim, value)}`}
                  onClick={() => onToggleFilter(dim.key, value)}
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
