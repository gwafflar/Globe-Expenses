// PivotCard.tsx — the generic 2D "breakdown by two dimensions" card
// (Space refactor Phase 7b, §3).
//
// A SIBLING of BreakdownCard, not a replacement: a 1D card still renders
// through BreakdownCard, unchanged. DashboardTab picks between the two on
// card.dimensions.length.
//
// ── Why a nested list rather than a real grid ──────────────────────────────
// A true matrix loses on a phone: ten countries × twelve categories needs
// horizontal scrolling inside a vertically-scrolling tab, which is miserable.
// So the primary dimension becomes collapsible SECTIONS and the secondary
// becomes indented ROWS inside them. The row chrome (dot, label, amount, %)
// deliberately matches BreakdownCard's so the two cards read as one feature.
//
// ── Two distinct tap targets in a section header ───────────────────────────
// The chevron collapses. The TOTAL drills down (to the primary value alone —
// the same result as the equivalent 1D card row). They are separate buttons on
// purpose: the total is the more valuable action and must stay reachable
// without expanding the section first.

import { useMemo, useState } from 'react'
import { CollapsibleCard } from '@/spaces/components/CollapsibleCard'
import { categoryColor, formatAmount } from '@/spaces/components/tabs/dashboardHelpers'
import type { DashboardCardDef } from '@/spaces/types'
import type { FilterDimension, FilterSelection } from '@/transactions/utils/filterDimensions'
import type { ScopedTransaction } from '@/spaces/utils/dashboardScope'
import {
  computePivot,
  cardTitle,
  displayValueLabel,
  drillValues,
  type PivotRow,
  type PivotSection,
} from '@/spaces/utils/dashboardCards'
import { useLocale, useT } from '@/i18n'

interface PivotCardProps {
  card: DashboardCardDef
  /** [primary, secondary], in that order. */
  dims: [FilterDimension, FilterDimension]
  scoped: ScopedTransaction[]
  mainCurrency: string
  /** Tapping a row or a section total drills into the Transactions tab.
   *  Omitted in the builder's live preview, where the numbers are inert. */
  onDrillDown?: (selections: FilterSelection[]) => void
  /** Rendered inside the card header — the edit/delete/reorder affordances. */
  actions?: React.ReactNode
  /** Preview mode: no drill-down, no actions, tighter chrome. */
  preview?: boolean
}

export function PivotCard({
  card,
  dims,
  scoped,
  mainCurrency,
  onDrillDown,
  actions,
  preview = false,
}: PivotCardProps) {
  const [primary, secondary] = dims
  // translation hook — re-renders when the language changes
  const t = useT()

  // Recomputed only when the scoped list or either descriptor changes — i.e.
  // once per range / mode / config change, not on every render.
  // `t.dashboard` is a dependency too: the "Other" / "No …" labels are built
  // inside, so a language switch must recompute them.
  const { sections, total } = useMemo(
    () => computePivot(scoped, primary, secondary, undefined, undefined, t.dashboard),
    [scoped, primary, secondary, t.dashboard],
  )

  // Which sections are open. Component-local and NOT persisted (§3).
  // Initialised to the first section only: opening the card to a wall of rows
  // is exactly what the nested layout exists to avoid. The initialiser runs
  // once per mount, so later data changes never re-open sections behind the
  // user's back — DashboardTab remounts the card when its dimensions change.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(sections.length > 0 ? [sections[0].key] : []),
  )

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Section total tapped → filter on the PRIMARY value only. */
  function drillSection(section: PivotSection) {
    onDrillDown?.([{ dimensionKey: primary.key, values: drillValues(section) }])
  }

  /** Row tapped → primary AND secondary. An "Other" row carries the whole
   *  collapsed key set, so the drilled list still sums to the number tapped. */
  function drillRow(section: PivotSection, row: PivotRow) {
    onDrillDown?.([
      { dimensionKey: primary.key, values: drillValues(section) },
      { dimensionKey: secondary.key, values: drillValues(row) },
    ])
  }

  const title = cardTitle(card, dims, t.dashboard)

  const body =
    sections.length === 0 ? (
      <p className="py-4 text-center text-sm text-muted-foreground">{t.dashboard.breakdown.noData}</p>
    ) : (
      <div className="flex flex-col gap-1">
        {sections.map((section) => (
          <Section
            key={section.key}
            section={section}
            primary={primary}
            secondary={secondary}
            cardTotal={total}
            mainCurrency={mainCurrency}
            isOpen={expanded.has(section.key)}
            onToggle={() => toggle(section.key)}
            onDrillSection={preview ? undefined : () => drillSection(section)}
            onDrillRow={preview ? undefined : (row) => drillRow(section, row)}
          />
        ))}
      </div>
    )

  if (preview) {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-medium text-foreground">{title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
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
// Section — one primary value
// ---------------------------------------------------------------------------

function Section({
  section,
  primary,
  secondary,
  cardTotal,
  mainCurrency,
  isOpen,
  onToggle,
  onDrillSection,
  onDrillRow,
}: {
  section: PivotSection
  /** The two dimensions — needed to know whether a label is a stored country
   *  name that must be displayed in the UI language. */
  primary: FilterDimension
  secondary: FilterDimension
  cardTotal: number
  mainCurrency: string
  isOpen: boolean
  onToggle: () => void
  onDrillSection?: () => void
  onDrillRow?: (row: PivotRow) => void
}) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Intl locale tag for country display names.
  const locale = useLocale()
  const label = displayValueLabel(primary, section, locale)
  const pct = cardTotal > 0 ? Math.round((section.total / cardTotal) * 100) : 0
  // The Other and "No value" sections get neutral grey rather than a palette
  // colour, so they read as meta-entries rather than as another value.
  // Hashed on the STORED label so a value keeps its colour in every language.
  const isMeta = section.isOther || section.isMissing
  const color = isMeta ? '#9CA3AF' : categoryColor(section.label)

  // The collapsed "Other" section is NOT expandable (§4): it stands for several
  // primary values, so it has no single secondary breakdown. It drills straight
  // through instead, and its whole header is one tap target.
  const expandable = !section.isOther

  const totalContent = (
    <>
      <span className="text-sm font-medium text-foreground">
        {formatAmount(section.total, mainCurrency)}
      </span>
      <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
    </>
  )

  return (
    <div>
      {/* ── Section header — chevron and total are SEPARATE tap targets ── */}
      <div className="flex items-center gap-2 rounded-md px-1 py-1">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            // Accessible name says what the chevron does, since the visible
            // glyph alone does not.
            aria-label={
              isOpen
                ? t.dashboard.breakdown.collapse({ label })
                : t.dashboard.breakdown.expand({ label })
            }
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="w-3 shrink-0 text-[10px] text-muted-foreground">
              {isOpen ? '▾' : '▸'}
            </span>
            <span
              className="inline-block shrink-0 rounded-full"
              style={{ width: 8, height: 8, backgroundColor: color }}
            />
            <span
              className={`min-w-0 flex-1 truncate text-sm font-medium ${
                section.isMissing ? 'italic text-muted-foreground' : 'text-foreground'
              }`}
            >
              {label}
            </span>
          </button>
        ) : (
          // Non-expandable Other section: no chevron, label is inert.
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="w-3 shrink-0" />
            <span
              className="inline-block shrink-0 rounded-full"
              style={{ width: 8, height: 8, backgroundColor: color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium italic text-muted-foreground">
              {label}
            </span>
          </div>
        )}

        {/* The total: its own tap target, with an underline affordance so it
            does not read as plain text sitting next to a button. */}
        {onDrillSection ? (
          <button
            type="button"
            aria-label={t.dashboard.breakdown.showTransactionsFor({ label })}
            onClick={onDrillSection}
            className="flex shrink-0 items-center gap-2 rounded-md px-1 py-0.5 underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted/50"
          >
            {totalContent}
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-2 px-1 py-0.5">{totalContent}</span>
        )}
      </div>

      {/* ── Secondary rows, indented under the section ── */}
      {expandable && isOpen && (
        <div className="flex flex-col gap-0.5 pb-1 pl-6">
          {section.rows.map((row) => (
            <Row
              key={row.key}
              row={row}
              displayLabel={displayValueLabel(secondary, row, locale)}
              sectionTotal={section.total}
              mainCurrency={mainCurrency}
              onDrillDown={onDrillRow ? () => onDrillRow(row) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row — one secondary value inside a section
// ---------------------------------------------------------------------------

function Row({
  row,
  displayLabel,
  sectionTotal,
  mainCurrency,
  onDrillDown,
}: {
  row: PivotRow
  /** What to show — row.label, or its translation for a stored country name. */
  displayLabel: string
  /** The percentage is of the SECTION, not the card: inside "Japan", what the
   *  user is comparing is Japan's own composition. */
  sectionTotal: number
  mainCurrency: string
  onDrillDown?: () => void
}) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const pct = sectionTotal > 0 ? Math.round((row.total / sectionTotal) * 100) : 0
  const isMeta = row.isOther || row.isMissing

  const content = (
    <>
      <span
        className={`min-w-0 flex-1 truncate text-left text-sm ${
          isMeta ? 'italic text-muted-foreground' : 'text-foreground'
        }`}
      >
        {displayLabel}
      </span>
      <span className="shrink-0 text-sm text-foreground">
        {formatAmount(row.total, mainCurrency)}
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
      aria-label={t.dashboard.breakdown.showTransactionsFor({ label: displayLabel })}
      onClick={onDrillDown}
      className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
    >
      {content}
    </button>
  )
}
