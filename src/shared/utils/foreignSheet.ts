// foreignSheet.ts — importing a spreadsheet that is NOT one of our exports
// (Phase 8b, SPEC §9bis). Pure module: no React, no Firestore.
//
// The lossless path (sheetImport.selectImportPath) handles our own files. This
// one handles everything else: a sheet from another app, or one of ours that
// was heavily edited or had its metadata sheet deleted. Nothing about the
// column layout can be assumed, so the user maps columns to fields and we
// auto-match what we can.

import * as XLSX from 'xlsx'
import type { CustomFieldDef, LabeledItem, Space, SpaceConfig } from '@/spaces/types'
import { OPTIONAL_BUILT_INS, parseBooleanCell, type OptionalBuiltIn } from '@/shared/utils/sheetColumns'
import { parseDate } from '@/shared/utils/sheetImport'

// ---------------------------------------------------------------------------
// Column model
// ---------------------------------------------------------------------------

/** How many distinct values a column keeps for preview and type inference.
 *  A free-text column can have thousands; we only ever need enough to decide. */
const MAX_TRACKED_DISTINCT = 500

export interface ForeignColumn {
  /** 1-based column number, matching colLetter(). */
  index: number
  /** Raw header text, as written in the sheet. */
  header: string
  /** Rows with a non-empty value in this column. */
  nonEmptyCount: number
  /** Distinct non-empty values, capped at MAX_TRACKED_DISTINCT, in first-seen order. */
  distinctValues: string[]
  /** True when the distinct list hit the cap and is therefore incomplete. */
  distinctTruncated: boolean
}

export type CoreField = 'date' | 'name' | 'totalAmount' | 'currency' | 'exchangeRate'

/** What one sheet column becomes on import. */
export type ColumnTarget =
  | { kind: 'ignore' }
  | { kind: 'core'; field: CoreField }
  | { kind: 'builtIn'; field: OptionalBuiltIn }
  | { kind: 'custom'; fieldId: string }
  /** Per-member split columns, for a sheet that carries them. */
  | { kind: 'memberCost'; travelMemberId: string }
  | { kind: 'memberPaid'; travelMemberId: string }
  /** A column that becomes a NEW custom field (Part 6). */
  | { kind: 'newField'; type: CustomFieldDef['type']; label: string }

/** Column index → target. */
export type ColumnMapping = Record<number, ColumnTarget>

/**
 * The one decision taken per `select` column, rather than per unmatched value
 * (SPEC §9bis).
 *
 * Importing into a new or near-empty space means nearly every value is
 * unmatched — that is the MAIN case, not an edge case, and a per-value prompt
 * does not scale past a handful.
 */
export type SelectDecision =
  /** Create every missing option, minus any the user unticked on review. */
  | { kind: 'createAll'; excluded: string[] }
  /** Import only values that already exist; the rest import empty. */
  | { kind: 'matchExisting' }
  /** Import nothing from this column. */
  | { kind: 'skip' }

export type SelectDecisions = Record<number, SelectDecision>

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ForeignSheet {
  /** Every sheet in the workbook, so the user can switch. */
  sheetNames: string[]
  /** The sheet these columns and rows came from. */
  sheetName: string
  /** 1-based row number the headers were found on. */
  headerRow: number
  columns: ForeignColumn[]
  /** Data rows as raw cell values, aligned to `columns` by array position. */
  rows: unknown[][]
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

/**
 * Locate the header row.
 *
 * Scans the first few rows and takes the one with the most non-empty text
 * cells. Our own exports put a merged banner on row 1 and the real headers on
 * row 2, so the banner loses on cell count; a foreign sheet usually has its
 * headers on row 1 and wins outright.
 */
function findHeaderRow(grid: unknown[][]): number {
  let best = 0
  let bestScore = -1
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    const score = (grid[r] ?? []).filter((c) => cellText(c) !== '' && isNaN(Number(cellText(c)))).length
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  return best
}

/** Read a workbook sheet into headers + rows, with per-column statistics. */
export function readForeignSheet(wb: XLSX.WorkBook, sheetName?: string): ForeignSheet {
  const sheetNames = wb.SheetNames.filter((n) => !n.startsWith('_'))
  const chosen = sheetName && wb.Sheets[sheetName] ? sheetName : sheetNames[0]
  if (!chosen) throw new Error('The workbook has no readable sheets.')

  const ws = wb.Sheets[chosen]
  // header:1 → array-of-arrays; raw → keep serials and numbers untouched, so
  // parseDate can do its own exact UTC conversion.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })

  const headerIdx = findHeaderRow(grid)
  const headerCells = grid[headerIdx] ?? []
  const dataRows = grid.slice(headerIdx + 1)

  const width = Math.max(headerCells.length, ...dataRows.map((r) => r?.length ?? 0), 0)

  const columns: ForeignColumn[] = []
  for (let c = 0; c < width; c++) {
    const seen = new Set<string>()
    const distinctValues: string[] = []
    let nonEmptyCount = 0
    let distinctTruncated = false

    for (const row of dataRows) {
      const text = cellText(row?.[c])
      if (text === '') continue
      nonEmptyCount++
      if (seen.has(text)) continue
      if (distinctValues.length >= MAX_TRACKED_DISTINCT) {
        distinctTruncated = true
        continue
      }
      seen.add(text)
      distinctValues.push(text)
    }

    columns.push({
      index: c + 1,
      header: cellText(headerCells[c]) || `Column ${c + 1}`,
      nonEmptyCount,
      distinctValues,
      distinctTruncated,
    })
  }

  // Drop trailing columns that are entirely empty and unnamed — spreadsheets
  // routinely carry a few of these and they only clutter the mapping table.
  while (columns.length > 0) {
    const last = columns[columns.length - 1]
    if (last.nonEmptyCount === 0 && /^Column \d+$/.test(last.header)) columns.pop()
    else break
  }

  return {
    sheetNames,
    sheetName: chosen,
    headerRow: headerIdx + 1,
    columns,
    rows: dataRows,
  }
}

// ---------------------------------------------------------------------------
// Auto-matching
// ---------------------------------------------------------------------------

/** Header spellings we recognise, case-insensitively, for each target.
 *  Deliberately generous: the user corrects anything wrong, and a good guess
 *  on a 20-column sheet saves far more time than a wrong one costs. */
const CORE_ALIASES: Record<CoreField, string[]> = {
  date: ['date', 'day', 'when', 'transaction date'],
  name: ['description', 'name', 'label', 'item', 'details', 'memo', 'title', 'what'],
  totalAmount: ['amount', 'amount (local)', 'total', 'cost', 'price', 'value', 'sum'],
  currency: ['currency', 'ccy', 'curr'],
  exchangeRate: ['exch. rate', 'exchange rate', 'rate', 'fx', 'fx rate'],
}

const BUILT_IN_ALIASES: Record<OptionalBuiltIn, string[]> = {
  country: ['country', 'nation'],
  city: ['city', 'town', 'location', 'place'],
  category: ['category', 'type', 'kind', 'tag'],
  paymentMethod: ['payment method', 'payment', 'method', 'paid with', 'account'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks'],
}

function normalise(s: string): string {
  // Strip a leading emoji/symbol run so "🏷️ Category" matches "category".
  return s.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase()
}

/**
 * Guess a target for every column from its header text.
 *
 * Each target is claimed at most once — two columns both called "Amount" must
 * not both map to totalAmount, silently making one of them win.
 */
export function autoMatchColumns(
  columns: ForeignColumn[],
  space: Space,
  config: SpaceConfig,
): ColumnMapping {
  const mapping: ColumnMapping = {}
  const claimed = new Set<string>()

  const claim = (key: string, target: ColumnTarget, columnIndex: number) => {
    if (claimed.has(key)) return false
    claimed.add(key)
    mapping[columnIndex] = target
    return true
  }

  for (const col of columns) {
    const h = normalise(col.header)
    if (h === '') { mapping[col.index] = { kind: 'ignore' }; continue }

    // Custom fields first: a user-defined field called "Category" should win
    // over the built-in of the same name, because they named it deliberately.
    const custom = config.customFields.find(
      (f) => f.enabled && (normalise(f.label) === h || normalise(`${f.emoji ?? ''} ${f.label}`) === h),
    )
    if (custom && claim(`custom:${custom.id}`, { kind: 'custom', fieldId: custom.id }, col.index)) continue

    // Per-member split columns, as our own exports write them.
    const member = space.members.find((m) => {
      const name = m.displayName.toLowerCase()
      return h.startsWith(`cost ${name}`) || h.startsWith(`paid ${name}`)
    })
    if (member) {
      const isPaid = h.startsWith('paid ')
      const key = `${isPaid ? 'paid' : 'cost'}:${member.travelMemberId}`
      const target: ColumnTarget = isPaid
        ? { kind: 'memberPaid', travelMemberId: member.travelMemberId }
        : { kind: 'memberCost', travelMemberId: member.travelMemberId }
      if (claim(key, target, col.index)) continue
    }

    const core = (Object.keys(CORE_ALIASES) as CoreField[])
      .find((f) => CORE_ALIASES[f].includes(h))
    if (core && claim(`core:${core}`, { kind: 'core', field: core }, col.index)) continue

    const builtIn = OPTIONAL_BUILT_INS
      .find((f) => config.builtInFields[f] && BUILT_IN_ALIASES[f].includes(h))
    if (builtIn && claim(`builtIn:${builtIn}`, { kind: 'builtIn', field: builtIn }, col.index)) continue

    mapping[col.index] = { kind: 'ignore' }
  }

  return mapping
}

// ---------------------------------------------------------------------------
// Type inference for new fields (Part 6)
// ---------------------------------------------------------------------------

const BOOLEAN_VOCAB = new Set(['yes', 'no', 'y', 'n', 'true', 'false', '1', '0', 'oui', 'non', 'vrai', 'faux'])

export interface TypeInference {
  type: CustomFieldDef['type']
  /** Shown to the user so a wrong guess is obvious rather than mysterious. */
  evidence: string
  /** Seeded options when the guess is `select`. */
  suggestedOptions: string[]
}

/**
 * Infer a custom field type from a column's values (SPEC §9bis / prompt Part 6).
 *
 *   - every non-empty value in a small recognised set → boolean
 *   - distinct ≤ 20 AND distinct ≤ 50% of non-empty rows → select
 *   - otherwise → text
 *
 * The evidence string is part of the contract, not decoration: a user shown
 * "12 distinct values in 340 rows" can tell at a glance whether `select` was
 * the right call.
 */
export function inferColumnType(col: ForeignColumn): TypeInference {
  const distinct = col.distinctValues.length
  const rows = col.nonEmptyCount

  if (rows === 0) {
    return { type: 'text', evidence: 'No values to infer from', suggestedOptions: [] }
  }

  if (!col.distinctTruncated && distinct > 0 &&
      col.distinctValues.every((v) => BOOLEAN_VOCAB.has(v.toLowerCase()))) {
    return {
      type: 'boolean',
      evidence: `Every value is one of ${col.distinctValues.slice(0, 4).join(', ')}`,
      suggestedOptions: [],
    }
  }

  if (!col.distinctTruncated && distinct <= 20 && distinct <= rows * 0.5) {
    return {
      type: 'select',
      evidence: `${distinct} distinct value${distinct === 1 ? '' : 's'} in ${rows} row${rows === 1 ? '' : 's'}`,
      suggestedOptions: [...col.distinctValues],
    }
  }

  const reason = col.distinctTruncated
    ? `over ${MAX_TRACKED_DISTINCT} distinct values`
    : `${distinct} distinct value${distinct === 1 ? '' : 's'} in ${rows} row${rows === 1 ? '' : 's'}`
  return { type: 'text', evidence: `Mostly unique — ${reason}`, suggestedOptions: [] }
}

// ---------------------------------------------------------------------------
// Select-column matching
// ---------------------------------------------------------------------------

/** Match a sheet value against an existing option list, case-insensitively and
 *  tolerating an emoji prefix on either side. */
export function matchOption(value: string, options: LabeledItem[]): LabeledItem | undefined {
  const v = normalise(value)
  return options.find(
    (o) => normalise(o.label) === v || normalise(`${o.emoji ?? ''} ${o.label}`) === v,
  )
}

export interface SelectColumnSummary {
  columnIndex: number
  header: string
  /** Values already present in the target field. */
  matched: string[]
  /** Values that would need creating. */
  unmatched: string[]
}

/** What a `select`-mapped column would do, for the per-column decision UI. */
export function summariseSelectColumn(
  col: ForeignColumn,
  options: LabeledItem[],
): SelectColumnSummary {
  const matched: string[] = []
  const unmatched: string[] = []
  for (const value of col.distinctValues) {
    if (matchOption(value, options)) matched.push(value)
    else unmatched.push(value)
  }
  return { columnIndex: col.index, header: col.header, matched, unmatched }
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

export interface ForeignRowResult {
  /** Rows ready for importParsedRows(), already keyed by travelMemberId. */
  rows: ForeignParsedRow[]
  /** Rows dropped for having neither a description nor an amount. */
  skipped: number
}

/** Same shape importParsedRows() consumes, but with splits already resolved to
 *  member ids rather than sheet slots. */
export interface ForeignParsedRow {
  date: string
  name: string
  totalAmount: number
  currency: string
  exchangeRate?: number
  country?: string
  city?: string
  category?: string
  paymentMethod?: string
  notes?: string
  custom?: Record<string, string | boolean>
  cost: { travelMemberId: string; amount: number }[]
  paid: { travelMemberId: string; amount: number }[]
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const text = cellText(v)
  if (text === '') return 0
  // Tolerate "1 234,56" and "1,234.56" — both common in exported sheets.
  const cleaned = text.replace(/[^\d.,-]/g, '')
  const normalised = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '')
  const n = Number(normalised)
  return isNaN(n) ? 0 : n
}

export interface BuildForeignRowsOptions {
  sheet: ForeignSheet
  mapping: ColumnMapping
  decisions: SelectDecisions
  /** Target space definitions, including any fields just created in Part 6. */
  customFields: CustomFieldDef[]
  /** Option lists for built-in select-like fields, for value matching. */
  builtInOptions: Partial<Record<OptionalBuiltIn, LabeledItem[]>>
  /** Fallback when the sheet carries no per-member columns: the whole amount is
   *  attributed to this member, which is what a personal-budget import means. */
  defaultMemberId?: string
  mainCurrency: string
}

/**
 * Turn mapped columns into importable rows.
 *
 * Per-column select decisions are applied here rather than per value, so a
 * column set to `matchExisting` silently imports its unmatched cells as empty
 * and a `skip` column contributes nothing at all.
 */
export function buildForeignRows(options: BuildForeignRowsOptions): ForeignRowResult {
  const { sheet, mapping, decisions, customFields, builtInOptions, defaultMemberId, mainCurrency } = options
  const byId = new Map(customFields.map((f) => [f.id, f]))
  const rows: ForeignParsedRow[] = []
  let skipped = 0

  for (const raw of sheet.rows) {
    const row: ForeignParsedRow = {
      date: '',
      name: '',
      totalAmount: 0,
      currency: mainCurrency,
      cost: [],
      paid: [],
    }
    const custom: Record<string, string | boolean> = {}

    for (const col of sheet.columns) {
      const target = mapping[col.index] ?? { kind: 'ignore' }
      if (target.kind === 'ignore') continue

      const cell = raw?.[col.index - 1]
      const text = cellText(cell)

      switch (target.kind) {
        case 'core': {
          if (target.field === 'date') row.date = parseDate(cell) ?? ''
          else if (target.field === 'name') row.name = text
          else if (target.field === 'totalAmount') row.totalAmount = asNumber(cell)
          else if (target.field === 'currency') { if (text) row.currency = text.toUpperCase() }
          else if (target.field === 'exchangeRate') {
            const n = asNumber(cell)
            if (n > 0) row.exchangeRate = n
          }
          break
        }
        case 'builtIn': {
          if (text === '') break
          const decision = decisions[col.index]
          if (decision?.kind === 'skip') break
          const opts = builtInOptions[target.field] ?? []
          const match = matchOption(text, opts)
          if (match) {
            // Built-ins store the DISPLAY string, emoji included where the
            // picker offers one — see dimensionCellText().
            row[target.field] = target.field === 'country'
              ? match.label
              : (match.emoji ? `${match.emoji} ${match.label}` : match.label)
          } else if (decision?.kind === 'matchExisting') {
            // Unmatched values import empty, by the user's choice.
          } else {
            row[target.field] = text
          }
          break
        }
        case 'custom': {
          const def = byId.get(target.fieldId)
          if (!def) break
          if (def.type === 'boolean') {
            if (parseBooleanCell(cell)) custom[def.id] = true
            break
          }
          if (text === '') break
          if (def.type === 'text') { custom[def.id] = text; break }

          const decision = decisions[col.index]
          if (decision?.kind === 'skip') break
          const match = matchOption(text, def.options ?? [])
          if (match) custom[def.id] = match.id
          // No match: created options are resolved by the caller before this
          // runs, so anything still unmatched here imports empty.
          break
        }
        case 'memberCost': {
          const amount = asNumber(cell)
          if (amount !== 0) row.cost.push({ travelMemberId: target.travelMemberId, amount })
          break
        }
        case 'memberPaid': {
          const amount = asNumber(cell)
          if (amount !== 0) row.paid.push({ travelMemberId: target.travelMemberId, amount })
          break
        }
        case 'newField':
          // Resolved into a real custom field before this runs (Part 6).
          break
      }
    }

    // Drop rows with neither a description nor an amount — blank spacer rows
    // are extremely common in hand-maintained spreadsheets.
    if (row.name === '' && row.totalAmount === 0) { skipped++; continue }
    if (row.name === '') row.name = '(unnamed)'
    if (row.date === '') row.date = todayFsDate()

    // No per-member columns → attribute the whole amount to one member. This is
    // what a personal-budget or bank export means, and without it every row
    // would import with no splits and vanish from the balance.
    if (row.cost.length === 0 && row.paid.length === 0 && defaultMemberId) {
      row.cost.push({ travelMemberId: defaultMemberId, amount: row.totalAmount })
      row.paid.push({ travelMemberId: defaultMemberId, amount: row.totalAmount })
    }

    if (Object.keys(custom).length > 0) row.custom = custom
    rows.push(row)
  }

  return { rows, skipped }
}

/** Today in Transaction.date's "DD-MM-YYYY" format. */
function todayFsDate(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Applying the per-column decisions
// ---------------------------------------------------------------------------

/** A new option to append to a field or a space list before rows are built. */
export interface PendingOptions {
  /** CustomFieldDef.id → option labels to create. */
  custom: Record<string, string[]>
  /** Built-in field → labels to create in the space's list. */
  builtIn: Partial<Record<OptionalBuiltIn, string[]>>
}

/** Stable-ish id for a newly created option. Mirrors the convention used by
 *  the form's inline "+ Add new" paths. */
function newOptionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Work out which options each `createAll` column would add.
 *
 * Pure: it decides WHAT to create. The caller performs the writes, so this
 * stays unit-testable and the Firestore round-trip stays in one place.
 */
export function collectPendingOptions(
  sheet: ForeignSheet,
  mapping: ColumnMapping,
  decisions: SelectDecisions,
  customFields: CustomFieldDef[],
  builtInOptions: Partial<Record<OptionalBuiltIn, LabeledItem[]>>,
): PendingOptions {
  const byId = new Map(customFields.map((f) => [f.id, f]))
  const pending: PendingOptions = { custom: {}, builtIn: {} }

  for (const col of sheet.columns) {
    const target = mapping[col.index]
    const decision = decisions[col.index]
    if (!target || decision?.kind !== 'createAll') continue

    const existing =
      target.kind === 'custom' ? (byId.get(target.fieldId)?.options ?? [])
      : target.kind === 'builtIn' ? (builtInOptions[target.field] ?? [])
      : null
    if (existing === null) continue

    const toCreate = col.distinctValues.filter(
      (v) => !decision.excluded.includes(v) && !matchOption(v, existing),
    )
    if (toCreate.length === 0) continue

    if (target.kind === 'custom') pending.custom[target.fieldId] = toCreate
    else if (target.kind === 'builtIn') pending.builtIn[target.field] = toCreate
  }

  return pending
}

/** Apply pending custom-field options, returning updated definitions.
 *  Never mutates the input: the caller may still need the originals if the
 *  write fails. */
export function withCreatedOptions(
  customFields: CustomFieldDef[],
  pending: PendingOptions,
): CustomFieldDef[] {
  return customFields.map((field) => {
    const labels = pending.custom[field.id]
    if (!labels || labels.length === 0) return field
    return {
      ...field,
      options: [
        ...(field.options ?? []),
        ...labels.map((label) => ({ id: newOptionId('opt'), label })),
      ],
    }
  })
}

/** Apply pending built-in options to a space list. */
export function withCreatedListItems(
  existing: LabeledItem[],
  labels: string[] | undefined,
  prefix: string,
): LabeledItem[] {
  if (!labels || labels.length === 0) return existing
  return [...existing, ...labels.map((label) => ({ id: newOptionId(prefix), label }))]
}

// ---------------------------------------------------------------------------
// Creating fields from columns (Part 6)
// ---------------------------------------------------------------------------

/** Ceiling on fields creatable in one import — a malformed sheet with fifty
 *  junk headers must not be able to create fifty fields. */
export const MAX_NEW_FIELDS = 10

export interface CreatedFields {
  /** Definitions to append to config.customFields. */
  definitions: CustomFieldDef[]
  /** Mapping with every `newField` target rewritten to the real field id, so
   *  row building has nothing special to handle. */
  mapping: ColumnMapping
}

/** Generate an id for a newly created field. Same nanoid-shaped convention as
 *  the Fields editor — never derived from the label, so renaming is free. */
function newFieldId(): string {
  return `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Turn every `newField` column into a real CustomFieldDef.
 *
 * Pure: it decides WHAT to create and how the mapping should be rewritten. The
 * caller writes the config through updateSpaceConfig(), so the importer never
 * owns field definitions.
 *
 * Columns beyond MAX_NEW_FIELDS are dropped to `ignore` rather than silently
 * created, and a field whose label collides with an existing one is dropped
 * too — two fields with the same name would be indistinguishable everywhere.
 */
export function resolveNewFields(
  sheet: ForeignSheet,
  mapping: ColumnMapping,
  existingFields: CustomFieldDef[],
): CreatedFields {
  const definitions: CustomFieldDef[] = []
  const next: ColumnMapping = { ...mapping }
  const takenLabels = new Set(existingFields.map((f) => normalise(f.label)))

  for (const col of sheet.columns) {
    const target = mapping[col.index]
    if (target?.kind !== 'newField') continue

    const label = target.label.trim() || col.header
    const key = normalise(label)

    if (definitions.length >= MAX_NEW_FIELDS || key === '' || takenLabels.has(key)) {
      next[col.index] = { kind: 'ignore' }
      continue
    }
    takenLabels.add(key)

    const id = newFieldId()
    const def: CustomFieldDef = {
      id,
      label,
      type: target.type,
      enabled: true,
      ...(target.type === 'select' && {
        // Seed from the column's own values, so the field arrives usable
        // rather than empty. Nothing is unmatched afterwards.
        options: col.distinctValues.map((value) => ({ id: newOptionId('opt'), label: value })),
      }),
    }

    definitions.push(def)
    next[col.index] = { kind: 'custom', fieldId: id }
  }

  return { definitions, mapping: next }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Mapping problems that must be fixed before the import can run. */
export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = []
  const targets = Object.values(mapping)

  const has = (kind: ColumnTarget['kind'], field?: string) =>
    targets.some((t) => t.kind === kind && (field === undefined || (t as { field?: string }).field === field))

  if (!has('core', 'totalAmount')) errors.push('One column must be mapped to Amount.')

  // Duplicate single-valued targets: two Amount columns is a mistake, and
  // silently letting the last one win would be worse than saying so.
  const seen = new Map<string, number>()
  for (const t of targets) {
    const key =
      t.kind === 'core' ? `core:${t.field}` :
      t.kind === 'builtIn' ? `builtIn:${t.field}` :
      t.kind === 'custom' ? `custom:${t.fieldId}` :
      t.kind === 'memberCost' ? `cost:${t.travelMemberId}` :
      t.kind === 'memberPaid' ? `paid:${t.travelMemberId}` : null
    if (!key) continue
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [key, count] of seen) {
    if (count > 1) errors.push(`${count} columns are mapped to the same field (${key.split(':')[1]}).`)
  }

  return errors
}
