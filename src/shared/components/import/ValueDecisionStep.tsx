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

const CHOICES: { kind: SelectDecision['kind']; label: string; hint: string }[] = [
  { kind: 'createAll',     label: 'Add the new values',  hint: 'Missing values are added to the field' },
  { kind: 'matchExisting', label: 'Only existing values', hint: 'Unmatched cells import empty' },
  { kind: 'skip',          label: "Don't import this",    hint: 'The column is ignored entirely' },
]

export function ValueDecisionStep({ columns, decisions, onChange }: ValueDecisionStepProps) {
  if (columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every value in the mapped columns already exists in this space. Nothing to decide.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Some columns contain values this space doesn't have yet. Choose what to do with each.
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
          → {column.fieldLabel} · {column.matched.length} match
          {column.matched.length !== 1 ? 'es' : ''}, {column.unmatched.length} new
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {CHOICES.map((choice) => (
          <label
            key={choice.kind}
            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
          >
            <input
              type="radio"
              className="mt-0.5"
              name={`decision-${column.columnIndex}`}
              checked={decision.kind === choice.kind}
              onChange={() =>
                onChange(choice.kind === 'createAll' ? { kind: 'createAll', excluded: [] } : { kind: choice.kind })
              }
            />
            <span className="min-w-0">
              <span className="block font-medium">
                {choice.kind === 'createAll' ? `${choice.label} (${willCreate.length})` : choice.label}
              </span>
              <span className="block text-xs text-muted-foreground">{choice.hint}</span>
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
              {expanded ? 'Untick anything you don’t want' : column.unmatched.slice(0, 3).join(', ')}
              {!expanded && column.unmatched.length > 3 && ` +${column.unmatched.length - 3} more`}
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
