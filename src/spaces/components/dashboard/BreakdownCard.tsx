// BreakdownCard.tsx — the generic 1D "breakdown by dimension" card
// (Space refactor Phase 7a, §4).
//
// ONE component, instantiated per DashboardCardDef. It replaces the bespoke
// category card: category and country are now card definitions like any other,
// which is exactly what makes the same card buildable on a custom field.
//
// The card knows nothing about which dimension it is showing. It receives
// ScopedTransaction[] (already date-scoped and You/All-attributed) plus a
// FilterDimension descriptor, and renders whatever computeBreakdown() returns.

import { useMemo } from 'react'
import { CollapsibleCard } from '@/spaces/components/CollapsibleCard'
import { categoryColor, formatAmount } from '@/spaces/components/tabs/dashboardHelpers'
import type { DashboardCardDef } from '@/spaces/types'
import type { FilterDimension } from '@/transactions/utils/filterDimensions'
import type { ScopedTransaction } from '@/spaces/utils/dashboardScope'
import { computeBreakdown, cardTitle, type BreakdownRow } from '@/spaces/utils/dashboardCards'

interface BreakdownCardProps {
  card: DashboardCardDef
  dimension: FilterDimension
  scoped: ScopedTransaction[]
  mainCurrency: string
  /** Tapping a row drills into the Transactions tab. Omitted in the builder's
   *  live preview, where the rows are inert. */
  onDrillDown?: (values: string[]) => void
  /** Rendered inside the card header — the edit/delete/reorder affordances. */
  actions?: React.ReactNode
  /** Preview mode: no drill-down, no actions, tighter chrome. */
  preview?: boolean
}

export function BreakdownCard({
  card,
  dimension,
  scoped,
  mainCurrency,
  onDrillDown,
  actions,
  preview = false,
}: BreakdownCardProps) {
  // Recomputed only when the scoped list or the dimension descriptor changes —
  // i.e. once per range / mode / config change, not on every render.
  const { rows, total } = useMemo(
    () => computeBreakdown(scoped, dimension),
    [scoped, dimension],
  )

  // cardTitle() takes the dimension LIST since Phase 7b (a pivot title names
  // both). A 1D card passes a single-element list and is otherwise unchanged.
  const title = cardTitle(card, [dimension])

  const body =
    rows.length === 0 ? (
      <p className="py-4 text-center text-sm text-muted-foreground">No data</p>
    ) : (
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <Row
            key={row.key}
            row={row}
            total={total}
            mainCurrency={mainCurrency}
            onDrillDown={preview ? undefined : onDrillDown}
          />
        ))}
      </div>
    )

  if (preview) {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">
            {formatAmount(total, mainCurrency)}
          </span>
        </div>
        {body}
      </div>
    )
  }

  return (
    <CollapsibleCard title={title} summary={formatAmount(total, mainCurrency)} actions={actions}>
      {body}
    </CollapsibleCard>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function Row({
  row,
  total,
  mainCurrency,
  onDrillDown,
}: {
  row: BreakdownRow
  total: number
  mainCurrency: string
  onDrillDown?: (values: string[]) => void
}) {
  const pct = total > 0 ? Math.round((row.amount / total) * 100) : 0
  // The Other and "No value" rows get a neutral grey rather than a palette
  // colour, so they read as meta-rows rather than as another value.
  const color = row.isOther || row.isMissing ? '#9CA3AF' : categoryColor(row.label)

  const content = (
    <>
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: 8, height: 8, backgroundColor: color }}
      />
      <span
        className={`flex-1 truncate text-left text-sm ${
          row.isOther || row.isMissing ? 'italic text-muted-foreground' : 'text-foreground'
        }`}
      >
        {row.label}
      </span>
      <span className="shrink-0 text-sm font-medium text-foreground">
        {formatAmount(row.amount, mainCurrency)}
      </span>
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{pct}%</span>
    </>
  )

  if (!onDrillDown) {
    return <div className="flex items-center gap-2 px-1 py-0.5">{content}</div>
  }

  return (
    <button
      type="button"
      // Accessible name spells out the drill-down, since the visible label
      // alone ("Other · 3 values") doesn't say what tapping does.
      aria-label={`Show transactions for ${row.label}`}
      onClick={() => onDrillDown(row.values)}
      className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
    >
      {content}
    </button>
  )
}
