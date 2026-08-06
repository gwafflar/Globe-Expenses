// CardBuilder.tsx — create or edit one dashboard breakdown card
// (Space refactor Phase 7a, §6).
//
// The dimension list comes straight from Phase 6's filterDimensions(), so the
// builder offers exactly what is filterable: enabled built-in selects and
// enabled custom select/boolean fields. Text dimensions are already absent —
// free text has no meaningful group-by.
//
// The preview renders with the space's REAL scoped data, so top-N behaviour and
// row readability are judged before saving rather than after.

import { useState } from 'react'
import { nanoid } from 'nanoid'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { DashboardCardDef } from '@/spaces/types'
import type { FilterDimension } from '@/transactions/utils/filterDimensions'
import type { ScopedTransaction } from '@/spaces/utils/dashboardScope'
import { cardTitle } from '@/spaces/utils/dashboardCards'
import { BreakdownCard } from './BreakdownCard'

interface CardBuilderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dimensions a card may be built on, in display order. */
  dimensions: FilterDimension[]
  /** Already-scoped transactions, so the preview matches what the card will
   *  show under the dashboard's current range and You/All mode. */
  scoped: ScopedTransaction[]
  mainCurrency: string
  /** The card being edited, or undefined when creating a new one. */
  editing?: DashboardCardDef
  onSave: (card: DashboardCardDef) => void
}

export function CardBuilder({
  open,
  onOpenChange,
  dimensions,
  scoped,
  mainCurrency,
  editing,
  onSave,
}: CardBuilderProps) {
  // Local draft state. Keyed remount by the caller (see DashboardTab) means
  // these initialisers re-run for each open, so no syncing effect is needed.
  const [dimensionKey, setDimensionKey] = useState<string>(
    editing?.dimensions[0] ?? dimensions[0]?.key ?? '',
  )
  const [title, setTitle] = useState(editing?.title ?? '')

  const selected = dimensions.find((d) => d.key === dimensionKey)

  // The card as it would be saved right now — also what the preview renders.
  const draft: DashboardCardDef = {
    id: editing?.id ?? '',
    dimensions: [dimensionKey],
    title: title.trim() || undefined,
  }

  function handleSave() {
    if (!selected) return
    onSave({
      // A new card gets a fresh nanoid; editing keeps the existing id so the
      // card's position and identity survive.
      id: editing?.id ?? nanoid(),
      // Kept as an array even though only one entry is allowed today —
      // Phase 7b adds the second without a migration.
      dimensions: [dimensionKey],
      title: title.trim() || undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit card' : 'Add a card'}</DialogTitle>
          <DialogDescription>
            Break your spending down by any field this space tracks.
          </DialogDescription>
        </DialogHeader>

        {dimensions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            This space has no fields to break down by yet. Enable a built-in field or add a
            custom one in Parameters first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Dimension picker */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Break down by</span>
              <div className="flex flex-wrap gap-1.5">
                {dimensions.map((dim) => {
                  const isActive = dim.key === dimensionKey
                  return (
                    <button
                      key={dim.key}
                      type="button"
                      // Accessible name is the plain label — the emoji is decoration.
                      aria-label={dim.label}
                      aria-pressed={isActive}
                      onClick={() => setDimensionKey(dim.key)}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-foreground hover:bg-accent'
                      }`}
                    >
                      {dim.emoji && <span>{dim.emoji}</span>}
                      <span>{dim.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Title — auto-derived from the dimension, overridable */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selected ? cardTitle({ id: '', dimensions: [dimensionKey] }, selected) : ''}
                className="h-8 text-sm"
              />
            </label>

            {/* Live preview with the space's real data */}
            {selected && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Preview</span>
                <BreakdownCard
                  card={draft}
                  dimension={selected}
                  scoped={scoped}
                  mainCurrency={mainCurrency}
                  preview
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!selected}>
            {editing ? 'Save' : 'Add card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
