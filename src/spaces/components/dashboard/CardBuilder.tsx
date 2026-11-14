// CardBuilder.tsx — create or edit one dashboard breakdown card
// (Space refactor Phase 7a §6, extended to 2D pivots in Phase 7b §5).
//
// The dimension list comes straight from Phase 6's filterDimensions(), so the
// builder offers exactly what is filterable: enabled built-in selects and
// enabled custom select/boolean fields. Text dimensions are already absent —
// free text has no meaningful group-by.
//
// The preview renders with the space's REAL scoped data, so top-N behaviour and
// row readability are judged before saving rather than after. For a pivot it
// shows the COLLAPSED state, which is where the user finds out whether their
// chosen order is readable — the main reason the preview exists.

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
import { PivotCard } from './PivotCard'
import { useT } from '@/i18n'

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
  /** Ordered dimension combinations already on the dashboard — see
   *  usedCardKeys(). Includes HIDDEN cards, so the user cannot create one that
   *  silently collides the moment a disabled field is re-enabled.
   *  The card being edited is excluded by the caller. */
  usedKeys: Set<string>
  onSave: (card: DashboardCardDef) => void
}

// The duplicate hint shown on every disabled picker option and on a disabled
// swap is t.dashboard.builder.duplicateHint (it used to be a module-level
// constant, which would have frozen the language at import time).

export function CardBuilder({
  open,
  onOpenChange,
  dimensions,
  scoped,
  mainCurrency,
  editing,
  usedKeys,
  onSave,
}: CardBuilderProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const tb = t.dashboard.builder

  // Local draft state. Keyed remount by the caller (see DashboardTab) means
  // these initialisers re-run for each open, so no syncing effect is needed.
  // A NEW card opens on the first dimension that is not already a 1D card, so
  // the builder never starts on a combination it would refuse to save. When
  // every dimension is taken it falls back to the first and the duplicate
  // message explains why Save is unavailable.
  const [primaryKey, setPrimaryKey] = useState<string>(
    editing?.dimensions[0] ??
      (dimensions.find((d) => !usedKeys.has(d.key)) ?? dimensions[0])?.key ??
      '',
  )
  // '' means "no second dimension" — the card stays 1D.
  const [secondaryKey, setSecondaryKey] = useState<string>(editing?.dimensions[1] ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')

  const primary = dimensions.find((d) => d.key === primaryKey)
  const secondary = dimensions.find((d) => d.key === secondaryKey)

  /** The card as it would be saved right now — also what the preview renders. */
  const draftDimensions: [string] | [string, string] = secondary
    ? [primaryKey, secondaryKey]
    : [primaryKey]
  const draftKey = draftDimensions.join('|')
  const isDuplicate = usedKeys.has(draftKey)

  // Swapping produces a DIFFERENT card (order is meaningful), so it needs its
  // own duplicate check. This is the case most easily missed: it can create a
  // collision without either picker being touched.
  const swappedKey = secondary ? `${secondaryKey}|${primaryKey}` : ''
  const swapWouldDuplicate = Boolean(secondary) && usedKeys.has(swappedKey)

  const selectedDims = secondary ? [primary!, secondary] : primary ? [primary] : []

  function handleSwap() {
    if (!secondary || swapWouldDuplicate) return
    setPrimaryKey(secondaryKey)
    setSecondaryKey(primaryKey)
  }

  /** Picking a new primary that equals the current secondary would pair a
   *  dimension with itself — drop the secondary rather than refuse the tap. */
  function handlePickPrimary(key: string) {
    setPrimaryKey(key)
    if (secondaryKey === key) setSecondaryKey('')
  }

  function handleSave() {
    if (!primary || isDuplicate) return
    onSave({
      // A new card gets a fresh nanoid; editing keeps the existing id so the
      // card's position and identity survive.
      id: editing?.id ?? nanoid(),
      dimensions: draftDimensions,
      title: title.trim() || undefined,
    })
    onOpenChange(false)
  }

  const draft: DashboardCardDef = {
    id: editing?.id ?? '',
    dimensions: draftDimensions,
    title: title.trim() || undefined,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? tb.editTitle : tb.addTitle}</DialogTitle>
          <DialogDescription>
            {tb.description}
          </DialogDescription>
        </DialogHeader>

        {dimensions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {tb.noFields}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* ── First dimension ───────────────────────────────────────── */}
            {/* The check is always on the EXACT ordered key of the card being
                built, never on mere membership: a dimension already used by a
                1D card stays pickable as the START of a pivot, and one used
                inside a pair does not block the 1D card. */}
            <DimensionPicker
              label={tb.firstDimension}
              dimensions={dimensions}
              selectedKey={primaryKey}
              isDisabled={(dim) =>
                secondary
                  ? dim.key === secondaryKey || usedKeys.has(`${dim.key}|${secondaryKey}`)
                  : usedKeys.has(dim.key)
              }
              onPick={handlePickPrimary}
            />

            {/* ── Second dimension ──────────────────────────────────────── */}
            {/* Always visible, with a leading "None" chip standing for a 1D
                card. A hidden "+ Add a second dimension" action made the pivot
                option — and the greying that depends on it — undiscoverable.
                A dimension is disabled here when it would COMPLETE an existing
                pair; pairing a dimension with itself is never legal; and None
                is disabled when the 1D card already exists. */}
            <DimensionPicker
              label={tb.secondDimension}
              dimensions={dimensions}
              selectedKey={secondaryKey}
              noneLabel={t.common.none}
              isDisabled={(dim) =>
                dim.key === primaryKey || usedKeys.has(`${primaryKey}|${dim.key}`)
              }
              isNoneDisabled={usedKeys.has(primaryKey)}
              onPick={setSecondaryKey}
            />

            {/* Swap — the live title beside it updates with the order. */}
            {secondary && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSwap}
                    disabled={swapWouldDuplicate}
                    title={swapWouldDuplicate ? tb.duplicateHint : undefined}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    {tb.swapOrder}
                  </button>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {cardTitle({ id: '', dimensions: draftDimensions }, selectedDims, t.dashboard)}
                  </span>
                </div>
                {swapWouldDuplicate && (
                  <p className="text-xs text-muted-foreground">
                    {tb.swapUnavailable}
                  </p>
                )}
              </div>
            )}

            {/* ── Title — auto-derived from the dimensions, overridable ─── */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{tb.title}</span>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  primary
                    ? cardTitle({ id: '', dimensions: draftDimensions }, selectedDims, t.dashboard)
                    : ''
                }
                className="h-8 text-sm"
              />
            </label>

            {isDuplicate && (
              <p className="text-xs text-destructive">
                {tb.duplicateExplain}
              </p>
            )}

            {/* ── Live preview with the space's real data ───────────────── */}
            {primary && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{tb.preview}</span>
                {secondary ? (
                  <PivotCard
                    // Remount on a dimension change so the collapsed state is
                    // re-derived (first section open) rather than carried over
                    // from the previous pair.
                    key={draftKey}
                    card={draft}
                    dims={[primary, secondary]}
                    scoped={scoped}
                    mainCurrency={mainCurrency}
                    preview
                  />
                ) : (
                  <BreakdownCard
                    card={draft}
                    dimension={primary}
                    scoped={scoped}
                    mainCurrency={mainCurrency}
                    preview
                  />
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!primary || isDuplicate}>
            {editing ? t.common.save : tb.addCard}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// DimensionPicker — one row of chips
// ---------------------------------------------------------------------------

function DimensionPicker({
  label,
  dimensions,
  selectedKey,
  noneLabel,
  isDisabled,
  isNoneDisabled = false,
  onPick,
}: {
  label?: string
  dimensions: FilterDimension[]
  selectedKey: string
  /** When set, a leading chip for "no dimension" (key ''). Only the second
   *  picker uses it: an empty secondary is what keeps the card 1D. */
  noneLabel?: string
  /** Unavailable choices are GREYED OUT rather than rejected after the fact,
   *  so the user never fills a form that cannot be saved. */
  isDisabled: (dim: FilterDimension) => boolean
  /** Dropping back to 1D can itself be a duplicate, when the [primary] card
   *  already exists. */
  isNoneDisabled?: boolean
  onPick: (key: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      {/* A labelled group: the two rows offer the SAME chip labels, so without
          it neither a screen reader nor a test can tell them apart. */}
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {noneLabel !== undefined && (
          <Chip
            label={noneLabel}
            isActive={selectedKey === ''}
            disabled={selectedKey !== '' && isNoneDisabled}
            onClick={() => onPick('')}
          />
        )}
        {dimensions.map((dim) => {
          const isActive = dim.key === selectedKey
          return (
            <Chip
              key={dim.key}
              label={dim.label}
              emoji={dim.emoji}
              isActive={isActive}
              disabled={!isActive && isDisabled(dim)}
              onClick={() => onPick(dim.key)}
            />
          )
        })}
      </div>
    </div>
  )
}

/** One picker chip. Never disables the ACTIVE choice — a selection the user can
 *  see must stay reversible. */
function Chip({
  label,
  emoji,
  isActive,
  disabled,
  onClick,
}: {
  label: string
  emoji?: string
  isActive: boolean
  disabled: boolean
  onClick: () => void
}) {
  // translation hook — re-renders when the language changes
  const t = useT()
  return (
    <button
      type="button"
      // Accessible name is the plain label — the emoji is decoration.
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      title={disabled ? t.dashboard.builder.duplicateHint : undefined}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        isActive
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-accent'
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background`}
    >
      {emoji && <span>{emoji}</span>}
      <span>{label}</span>
    </button>
  )
}
