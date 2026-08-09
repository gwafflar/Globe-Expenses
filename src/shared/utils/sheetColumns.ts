// sheetColumns.ts — shared column layout for the GlobeExpenses Standard Sheet.
//
// The Expenses tab has a DYNAMIC column layout. It scales with:
//   - the number of space members (N), and
//   - the space's config: disabled built-in fields produce NO column, and each
//     exported custom field produces one (Phase 8a, SPEC §9bis).
//
// Imported by BOTH sheetExport.ts and sheetImport.ts so the layout is computed
// exactly once and the two can never drift.
//
// ⚠️ Optional built-in columns are `number | undefined`. That is deliberate:
// making absence a type-level fact means every consumer has to decide what to
// do about it, instead of silently reading column 0.

import type { CustomFieldDef, CustomValue, SpaceConfig } from '@/spaces/types'
import { resolveOptionLabel } from '@/spaces/config'

/** Built-in fields that can be toggled off, in their column order. */
export const OPTIONAL_BUILT_INS = ['country', 'city', 'category', 'paymentMethod', 'notes'] as const
export type OptionalBuiltIn = (typeof OPTIONAL_BUILT_INS)[number]

export interface ColumnMap {
  // ── Always present ───────────────────────────────────────────────────────
  rowIndex: number      // sequential row index (1, 2, 3…)
  date: number          // "DD/MM/YYYY"
  name: number          // Transaction.name (description)
  amountLocal: number   // totalAmount
  currency: number      // ISO 4217 code
  exchangeRate: number  // rate locked at transaction creation time
  costMain: number      // totalAmountMain (=amount*rate formula on export)
  splitLabel: number    // derived split label
  paidByLabel: number   // derived paid-by label

  // ── Config-gated built-ins: undefined when the field is not exported ──────
  country?: number
  city?: number
  category?: number
  paymentMethod?: number
  notes?: number

  // ── Dynamic: one entry per space member ──────────────────────────────────
  costLocal: number[]           // beneficiaries[i].amount
  paidLocal: number[]           // paidBy[i].amount
  costMainPerMember: number[]   // formula on export

  /** CustomFieldDef.id → column number, for every exported custom field. */
  custom: Record<string, number>
  /** The custom field definitions backing `custom`, in column order. Carried on
   *  the map so writers and the Analysis generator agree on which definition
   *  owns which column without re-deriving it from config. */
  customFields: CustomFieldDef[]

  // ── Check columns (formulas on export, ignored on import) ────────────────
  checkCost: number
  checkPaid: number
  allGood: number

  /** Firestore transaction ID — hidden on export, read on import for dedup. */
  txId: number

  totalCols: number     // = txId (total width of the sheet)
}

export interface ColumnMapOptions {
  /** Which built-in fields get a column. Defaults to ALL of them, so existing
   *  callers and legacy spaces keep the pre-refactor layout exactly. */
  builtIns?: Partial<Record<OptionalBuiltIn, boolean>>
  /** Custom fields to emit, in column order. Normally the enabled ones, plus
   *  any disabled ones the user chose to include anyway. */
  customFields?: CustomFieldDef[]
}

/**
 * Compute the full column layout. All column numbers are 1-based (col A = 1).
 *
 * Order:
 *   #, date, [country] [city] [category], description, amount, currency,
 *   rate, cost-main, split, paid-by,
 *   N×cost-local, N×paid-local,
 *   [payment method] [notes], custom fields…,
 *   N×cost-main-per-member, 3 checks, txId
 *
 * Custom fields sit after the built-in optional columns (SPEC §9bis) — grouped
 * with paymentMethod/notes under the sheet's existing "DETAILS" banner rather
 * than pushed between amount and currency.
 *
 * With every built-in enabled and no custom fields this reproduces the
 * pre-Phase-8 layout column for column, which is what keeps old exports and
 * old tests valid.
 */
export function buildColumnMap(nMembers: number, options: ColumnMapOptions = {}): ColumnMap {
  // Guard: minimum 1 member so the per-member arrays are never empty.
  const n = Math.max(1, nMembers)
  const enabled = (key: OptionalBuiltIn) => options.builtIns?.[key] ?? true
  const customFields = options.customFields ?? []

  let col = 1
  const next = () => col++
  /** Claim a column only when the field is exported; undefined otherwise. */
  const optional = (key: OptionalBuiltIn) => (enabled(key) ? next() : undefined)

  const rowIndex = next()
  const date = next()
  const country = optional('country')
  const city = optional('city')
  const category = optional('category')
  const name = next()
  const amountLocal = next()
  const currency = next()
  const exchangeRate = next()
  const costMain = next()
  const splitLabel = next()
  const paidByLabel = next()

  const costLocal = Array.from({ length: n }, () => next())
  const paidLocal = Array.from({ length: n }, () => next())

  const paymentMethod = optional('paymentMethod')
  const notes = optional('notes')

  const custom: Record<string, number> = {}
  for (const def of customFields) custom[def.id] = next()

  const costMainPerMember = Array.from({ length: n }, () => next())

  const checkCost = next()
  const checkPaid = next()
  const allGood = next()
  const txId = next()

  return {
    rowIndex,
    date,
    country,
    city,
    category,
    name,
    amountLocal,
    currency,
    exchangeRate,
    costMain,
    splitLabel,
    paidByLabel,
    costLocal,
    paidLocal,
    paymentMethod,
    notes,
    custom,
    customFields,
    costMainPerMember,
    checkCost,
    checkPaid,
    allGood,
    txId,
    totalCols: txId,
  }
}

/** The column map implied by a space's config, for `n` members.
 *  `includedDisabledFields` are field keys the user chose to export despite
 *  being disabled — see the disabled-data warning in sheetExport.ts. */
export function columnMapForConfig(
  n: number,
  config: SpaceConfig,
  includedDisabledFields: string[] = [],
): ColumnMap {
  const included = new Set(includedDisabledFields)

  const builtIns: Partial<Record<OptionalBuiltIn, boolean>> = {}
  for (const key of OPTIONAL_BUILT_INS) {
    builtIns[key] = config.builtInFields[key] || included.has(key)
  }

  const customFields = config.customFields.filter((f) => f.enabled || included.has(f.id))

  return buildColumnMap(n, { builtIns, customFields })
}

/** Column number for a filter/dashboard dimension key, or undefined when that
 *  dimension has no column in this sheet. Built-in keys resolve to their fixed
 *  slot; anything else is looked up as a custom field id.
 *
 *  This is what lets the Analysis generator skip a card on a disabled field
 *  instead of emitting a formula that resolves to #REF!. */
export function columnForDimension(cm: ColumnMap, key: string): number | undefined {
  switch (key) {
    case 'country':       return cm.country
    case 'city':          return cm.city
    case 'category':      return cm.category
    case 'paymentMethod': return cm.paymentMethod
    case 'currency':      return cm.currency
    default:              return cm.custom[key]
  }
}

// ---------------------------------------------------------------------------
// Cell value rendering
// ---------------------------------------------------------------------------

/** Cell text for a custom field's stored value (SPEC §9bis).
 *
 *   select  → the option LABEL, so the sheet reads naturally. Nothing is lost:
 *             the metadata sheet carries the id↔label mapping.
 *   boolean → 'yes' / 'no'. An ABSENT value is 'no' — buildCustomPayload()
 *             omits `false` entirely, so absence is the normal way to store it.
 *   text    → the raw string.
 *
 * Returns '' when a select/text value is absent, so the cell is left blank
 * rather than reading "undefined". */
export function customCellValue(def: CustomFieldDef, raw: CustomValue | undefined): string {
  if (def.type === 'boolean') return raw === true ? 'yes' : 'no'
  if (raw === undefined || raw === '') return ''
  if (def.type === 'select') return resolveOptionLabel(def, raw)
  return String(raw)
}

/**
 * The exact text a transaction writes into one dimension's column.
 *
 * ⚠️ THE function the Analysis sheet's formulas depend on. A SUMPRODUCT filter
 * value that differs by so much as an emoji from what the column holds sums
 * silently to zero — no #REF!, no error, just a wrong number. Deriving both the
 * cell and the formula's filter from this one place is what prevents that.
 *
 * The built-ins are NOT uniform, and that is stored reality rather than a
 * choice made here: `category` and `paymentMethod` store the emoji-prefixed
 * display string the picker offered, while `country` stores the bare name and
 * keeps its flag in the space's country list. See audit finding F7.
 *
 * Returns '' when the transaction has no value for the dimension.
 */
export function dimensionCellText(
  tx: { country?: string; city?: string; category?: string; paymentMethod?: string; currency?: string; custom?: Record<string, CustomValue> },
  key: string,
  customFields: CustomFieldDef[],
): string {
  switch (key) {
    case 'country':       return tx.country ?? ''
    case 'city':          return tx.city ?? ''
    case 'category':      return tx.category ?? ''
    case 'paymentMethod': return tx.paymentMethod ?? ''
    case 'currency':      return tx.currency ?? ''
    default: {
      const def = customFields.find((f) => f.id === key)
      return def ? customCellValue(def, tx.custom?.[key]) : ''
    }
  }
}

/** Accepted spellings for a boolean cell on import, including the locale forms
 *  the importer already tolerates elsewhere. Anything unrecognised is `false`
 *  (SPEC §9bis: "anything unrecognised is no"), including blanks. */
const BOOLEAN_TRUE = new Set(['yes', 'y', 'true', '1', 'oui', 'vrai', 'x', '✓', '✔', '✔️'])

export function parseBooleanCell(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1
  if (typeof raw !== 'string') return false
  return BOOLEAN_TRUE.has(raw.trim().toLowerCase())
}

/**
 * Convert a 1-based column number to an Excel column letter (A, B, …, Z, AA, …).
 * Used by both sheetExport.ts and sheetImport.ts.
 */
export function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
