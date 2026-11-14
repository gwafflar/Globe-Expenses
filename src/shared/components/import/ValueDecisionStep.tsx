// ValueDecisionStep.tsx — one decision per select column (Phase 8b, part 5).
//
// ⚠️ Per COLUMN, never per value. Importing into a new or near-empty space
// means nearly every value is unmatched — that is the main case, not an edge
// case, and a per-value prompt does not scale past a handful (SPEC §9bis).
//
// The unmatched list is expandable so individual junk values can be excluded,
// which catches typos by review rather than by interrogation.

import { useState } from 'react'
import type { LabeledItem } from '@/spaces/types'
import type { SelectDecision, SelectDecisions, SelectColumnSummary } from '@/shared/utils/foreignSheet'
import { useT } from '@/i18n'

export interface SelectColumnInfo extends SelectColumnSummary {
  /** What the column maps to, for the heading. */
  fieldLabel: string
  existingOptions: LabeledItem[]
}

interface ValueDecisionStepProps {
  columns: SelectColumnInfo[]
  decisions: SelectDecisions
  onChange: (next: SelectDecisions) => void
}

// The three choices, in display order. Their label and hint come from the
// translations (t.importExport.values.choices[kind]) at render time.
const CHOICES: SelectDecision['kind'][] = ['createAll', 'matchExisting', 'skip']

export function ValueDecisionStep({ columns, decisions, onChange }: ValueDecisionStepProps) {
  // translation hook — re-renders when the language changes
  const t = useT()

  if (columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t.importExport.values.nothingToDecide}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t.importExport.values.intro}
      </p>

      {columns.map((col) => (
        <ColumnDecision
          key={col.columnIndex}
          column={col}
          decision={decisions[col.columnIndex] ?? { kind: 'createAll', excluded: [] }}
          onChange={(next) => onChange({ ...decisions, [col.columnIndex]: next })}
        />
      ))}
    </div>
  )
}

function ColumnDecision({
  column,
  decision,
  onChange,
}: {
  column: SelectColumnInfo
  decision: SelectDecision
  onChange: (next: SelectDecision) => void
}) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const tv = t.importExport.values
  const [expanded, setExpanded] = useState(false)
  const excluded = decision.kind === 'createAll' ? decision.excluded : []
  const willCreate = column.unmatched.filter((v) => !excluded.includes(v))

  function toggleValue(value: string) {
    if (decision.kind !== 'createAll') return
    const next = excluded.includes(value)
      ? excluded.filter((v) => v !== value)
      : [...excluded, value]
    onChange({ kind: 'createAll', excluded: next })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{column.header}</p>
        <p className="text-xs text-muted-foreground">
          {tv.matchSummary({
            field: column.fieldLabel,
            matched: column.matched.length,
            unmatched: column.unmatched.length,
          })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {CHOICES.map((kind) => (
          <label
            key={kind}
            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
          >
            <input
              type="radio"
              className="mt-0.5"
              name={`decision-${column.columnIndex}`}
              checked={decision.kind === kind}
              onChange={() =>
                onChange(kind === 'createAll' ? { kind: 'createAll', excluded: [] } : { kind })
              }
            />
            <span className="min-w-0">
              <span className="block font-medium">
                {kind === 'createAll' ? tv.createAllWithCount(willCreate.length) : tv.choices[kind].label}
              </span>
              <span className="block text-xs text-muted-foreground">{tv.choices[kind].hint}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Sample + exclusion list, only while "add" is selected. */}
      {decision.kind === 'createAll' && column.unmatched.length > 0 && (
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <button
            type="button"
            className="flex w-full items-center justify-between text-xs font-medium"
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="min-w-0 truncate pr-2 text-left">
              {expanded ? tv.untick : column.unmatched.slice(0, 3).join(', ')}
              {!expanded && column.unmatched.length > 3 && tv.more(column.unmatched.length - 3)}
            </span>
            <span className="shrink-0">{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {column.unmatched.map((value) => (
                <label key={value} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!excluded.includes(value)}
                    onChange={() => toggleValue(value)}
                  />
                  <span className="min-w-0 truncate">{value}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
