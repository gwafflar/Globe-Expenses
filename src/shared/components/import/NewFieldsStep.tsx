// NewFieldsStep.tsx — turn unmatched columns into custom fields (Phase 8b, part 6).
//
// The last mapping option: a column that matches nothing becomes a new custom
// field. The type is INFERRED and shown with its evidence, so a wrong guess is
// obvious rather than mysterious — "12 distinct values in 340 rows" tells the
// user immediately whether `select` was right.

import type { CustomFieldType } from '@/spaces/types'
import { inferColumnType, type ColumnTarget, type ForeignColumn } from '@/shared/utils/foreignSheet'

/** Ceiling on fields creatable in one import, so a malformed sheet cannot
 *  generate fifty. Ten is far more than any real import needs. */
export const MAX_NEW_FIELDS = 10

const TYPE_LABELS: Record<CustomFieldType, string> = {
  select: 'Choice list',
  text: 'Free text',
  boolean: 'Yes / no',
}

const TYPE_HINTS: Record<CustomFieldType, string> = {
  select: 'A fixed set of values you can filter and group by',
  text: 'Anything — searchable, but not groupable',
  boolean: 'A simple flag',
}

export interface NewFieldDraft {
  column: ForeignColumn
  label: string
  type: CustomFieldType
}

interface NewFieldsStepProps {
  drafts: NewFieldDraft[]
  onChange: (columnIndex: number, patch: Partial<Omit<NewFieldDraft, 'column'>>) => void
  /** Drop the column back to "don't import". */
  onRemove: (columnIndex: number) => void
}

export function NewFieldsStep({ drafts, onChange, onRemove }: NewFieldsStepProps) {
  if (drafts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No new fields to create. Go back if you meant to add one.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        These columns will become new fields in this space. Check the name and type of each.
      </p>

      {drafts.length >= MAX_NEW_FIELDS && (
        <div className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          You've reached the limit of {MAX_NEW_FIELDS} new fields per import.
        </div>
      )}

      {drafts.map(({ column, label, type }) => {
        const inference = inferColumnType(column)
        const overridden = type !== inference.type

        return (
          <div key={column.index} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  From column “{column.header}”
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => onRemove(column.index)}
              >
                Don't import
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Field name</span>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={label}
                onChange={(e) => onChange(column.index, { label: e.target.value })}
                placeholder={column.header}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={type}
                onChange={(e) => onChange(column.index, { type: e.target.value as CustomFieldType })}
              >
                {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">{TYPE_HINTS[type]}</span>
            </label>

            {/* The evidence, always shown — this is what makes a wrong guess
                visible instead of something the user discovers days later. */}
            <p className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
              {overridden
                ? `Suggested ${TYPE_LABELS[inference.type].toLowerCase()}: ${inference.evidence}`
                : inference.evidence}
              {type === 'select' && inference.suggestedOptions.length > 0 && (
                <>
                  {' · '}
                  {inference.suggestedOptions.length} option
                  {inference.suggestedOptions.length !== 1 ? 's' : ''} will be created
                </>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/** Every column currently mapped to a new field, in column order. */
export function newFieldDrafts(
  columns: ForeignColumn[],
  mapping: Record<number, ColumnTarget>,
): NewFieldDraft[] {
  const drafts: NewFieldDraft[] = []
  for (const column of columns) {
    const target = mapping[column.index]
    if (target?.kind !== 'newField') continue
    drafts.push({ column, label: target.label, type: target.type })
  }
  return drafts
}
