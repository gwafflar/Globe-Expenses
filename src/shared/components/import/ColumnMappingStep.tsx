// ColumnMappingStep.tsx — map each sheet column to a field (Phase 8b, part 5).
//
// Shown for foreign files only. Auto-matching has already run, so most rows
// arrive correct and the user is correcting rather than filling in.

import type { Space, SpaceConfig } from '@/spaces/types'
import {
  OPTIONAL_BUILT_INS,
  type OptionalBuiltIn,
} from '@/shared/utils/sheetColumns'
import {
  inferColumnType,
  type ColumnMapping,
  type ColumnTarget,
  type CoreField,
  type ForeignColumn,
} from '@/shared/utils/foreignSheet'

const CORE_LABELS: Record<CoreField, string> = {
  date: 'Date',
  name: 'Description',
  totalAmount: 'Amount',
  currency: 'Currency',
  exchangeRate: 'Exchange rate',
}

const BUILT_IN_LABELS: Record<OptionalBuiltIn, string> = {
  country: 'Country',
  city: 'City',
  category: 'Category',
  paymentMethod: 'Payment method',
  notes: 'Notes',
}

/** Encode a target as a <select> value, and back. A single string keeps the
 *  dropdown a plain controlled input instead of a parallel state machine. */
export function targetToValue(target: ColumnTarget): string {
  switch (target.kind) {
    case 'ignore':      return 'ignore'
    case 'core':        return `core:${target.field}`
    case 'builtIn':     return `builtIn:${target.field}`
    case 'custom':      return `custom:${target.fieldId}`
    case 'memberCost':  return `cost:${target.travelMemberId}`
    case 'memberPaid':  return `paid:${target.travelMemberId}`
    case 'newField':    return 'newField'
  }
}

export function valueToTarget(value: string, col: ForeignColumn): ColumnTarget {
  const [kind, rest] = value.split(':', 2)
  switch (kind) {
    case 'core':     return { kind: 'core', field: rest as CoreField }
    case 'builtIn':  return { kind: 'builtIn', field: rest as OptionalBuiltIn }
    case 'custom':   return { kind: 'custom', fieldId: rest }
    case 'cost':     return { kind: 'memberCost', travelMemberId: rest }
    case 'paid':     return { kind: 'memberPaid', travelMemberId: rest }
    // Seed the type from the column's own values; the next step shows the
    // inference with its evidence so the user can overrule it.
    case 'newField': return { kind: 'newField', type: inferColumnType(col).type, label: col.header }
    default:         return { kind: 'ignore' }
  }
}

interface ColumnMappingStepProps {
  columns: ForeignColumn[]
  mapping: ColumnMapping
  onChange: (next: ColumnMapping) => void
  space: Space
  config: SpaceConfig
  rowCount: number
  errors: string[]
  /** Whether "create a new field" is offered (Part 6 caps how many). */
  canCreateFields: boolean
}

export function ColumnMappingStep({
  columns,
  mapping,
  onChange,
  space,
  config,
  rowCount,
  errors,
  canCreateFields,
}: ColumnMappingStepProps) {
  const enabledBuiltIns = OPTIONAL_BUILT_INS.filter((f) => config.builtInFields[f])
  const enabledCustom = config.customFields.filter((f) => f.enabled)
  const isSolo = space.members.length < 2

  function setTarget(col: ForeignColumn, value: string) {
    onChange({ ...mapping, [col.index]: valueToTarget(value, col) })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Found <strong>{rowCount}</strong> row{rowCount !== 1 ? 's' : ''} and{' '}
        <strong>{columns.length}</strong> column{columns.length !== 1 ? 's' : ''}. Matching
        columns have been filled in — check them and correct anything wrong.
      </p>

      {errors.length > 0 && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <ul className="list-disc space-y-1 pl-4">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-col divide-y rounded-lg border">
        {columns.map((col) => {
          const target = mapping[col.index] ?? { kind: 'ignore' as const }
          const isIgnored = target.kind === 'ignore'
          return (
            <div key={col.index} className="flex flex-col gap-2 px-3 py-2.5">
              {/* Stacked, not side-by-side: at 375px a two-column row leaves the
                  dropdown too narrow to read the field names. */}
              <div className="min-w-0">
                <p className={`truncate text-sm font-medium ${isIgnored ? 'text-muted-foreground' : ''}`}>
                  {col.header}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {col.nonEmptyCount} value{col.nonEmptyCount !== 1 ? 's' : ''}
                  {col.distinctValues.length > 0 && ` · e.g. ${col.distinctValues.slice(0, 3).join(', ')}`}
                </p>
              </div>

              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={targetToValue(target)}
                onChange={(e) => setTarget(col, e.target.value)}
              >
                <option value="ignore">— Don't import —</option>

                <optgroup label="Transaction">
                  {(Object.keys(CORE_LABELS) as CoreField[]).map((f) => (
                    <option key={f} value={`core:${f}`}>{CORE_LABELS[f]}</option>
                  ))}
                </optgroup>

                {enabledBuiltIns.length > 0 && (
                  <optgroup label="Fields">
                    {enabledBuiltIns.map((f) => (
                      <option key={f} value={`builtIn:${f}`}>{BUILT_IN_LABELS[f]}</option>
                    ))}
                  </optgroup>
                )}

                {enabledCustom.length > 0 && (
                  <optgroup label="Custom fields">
                    {enabledCustom.map((f) => (
                      <option key={f.id} value={`custom:${f.id}`}>
                        {f.emoji ? `${f.emoji} ${f.label}` : f.label}
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* Splits are meaningless in a solo space — every amount is the
                    one member's, which the importer already does by default. */}
                {!isSolo && (
                  <optgroup label="Who">
                    {space.members.map((m) => (
                      <option key={`cost-${m.travelMemberId}`} value={`cost:${m.travelMemberId}`}>
                        Cost — {m.displayName}
                      </option>
                    ))}
                    {space.members.map((m) => (
                      <option key={`paid-${m.travelMemberId}`} value={`paid:${m.travelMemberId}`}>
                        Paid — {m.displayName}
                      </option>
                    ))}
                  </optgroup>
                )}

                {canCreateFields && (
                  <optgroup label="New">
                    <option value="newField">+ Create a new field…</option>
                  </optgroup>
                )}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
