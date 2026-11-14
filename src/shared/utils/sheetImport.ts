// sheetImport.ts — parses a GlobeExpenses Standard Sheet and writes to Firestore.
//
// Two-step process:
//   1. parseSheetFile(file)   — pure: reads xlsx, returns typed rows + slot metadata
//   2. importParsedRows(...)  — writes: calls createTransaction for each valid row
//
// The member-mapping step (slot index → space member UID) happens in the UI
// between the two steps.  See ImportXlsxDialog.tsx.

import * as XLSX from 'xlsx'
import { collection, doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import {
  buildColumnMap,
  colLetter,
  columnMapForConfig,
  parseBooleanCell,
  type ColumnMap,
} from '@/shared/utils/sheetColumns'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { SHEET_PARAMS, SHEET_EXPENSES } from '@/shared/utils/sheetExport'
import { parseMetaSheet, type MetaPayload } from '@/shared/utils/sheetMeta'
import type { ForeignParsedRow } from '@/shared/utils/foreignSheet'
import type { CustomFieldDef, CustomValue, Space } from '@/spaces/types'
// getT() reads the current UI language at call time: row errors shown in the
// import result, and the default name of a description-less row.
import { getT } from '@/i18n'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SheetMemberSlot {
  slotIndex: number       // 0-based (0 = Member_1)
  nameInSheet: string     // display name read from the Parameters tab
  rowCount: number        // number of data rows involving this slot (non-zero amounts)
  /** From the metadata sheet only. Lets a re-import into the SAME space map
   *  slots by stable id instead of by display name. */
  travelMemberId?: string
}

export interface ParsedSheetRow {
  date: string            // "DD-MM-YYYY"
  country?: string
  city?: string
  category?: string
  name: string            // Transaction.name (description column)
  totalAmount: number
  currency: string        // ISO 4217
  paymentMethod?: string
  notes?: string
  splitLabel?: string     // raw value from col J
  paidByLabel?: string    // raw value from col K
  costPerSlot: (number | undefined)[]   // length = nMembersInSheet
  paidPerSlot: (number | undefined)[]   // length = nMembersInSheet
  exchangeRate?: number   // present when col I contains a numeric rate; undefined for older files
  txId?: string           // Firestore doc ID from a previous export (for re-import dedup)
  /** Custom field values keyed by the FILE's CustomFieldDef.id, with select
   *  values already resolved to OPTION IDS via the metadata sheet. Only
   *  populated on the lossless path. */
  custom?: Record<string, CustomValue>
  /** Raw cell text per custom column, keyed by the file's field id. Kept
   *  alongside `custom` so the foreign path (Part 5) can label-match without
   *  re-reading the workbook. */
  customText?: Record<string, string>
}

export interface ParseResult {
  rows: ParsedSheetRow[]
  slots: SheetMemberSlot[]  // only slots with rowCount > 0
  mainCurrency: string
  nMembersInSheet: number
  /** The metadata sheet's payload when the file carried a readable one.
   *  Its presence is what selects the lossless import path. */
  meta: MetaPayload | null
  /** Set when a metadata sheet was present but could not be used — shown to
   *  the user so a silent downgrade to label matching is never invisible. */
  metaWarning?: string
  /** Custom field definitions the file exported, in column order. Empty on a
   *  foreign file. */
  customFields: CustomFieldDef[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read a single cell value from the worksheet (raw, with Date coercion on). */
function getCellValue(ws: XLSX.WorkSheet, col: number, row: number): unknown {
  const cell = ws[`${colLetter(col)}${row}`]
  return cell?.v ?? undefined
}

/** Read a cell from a column that may not exist in this sheet.
 *  A disabled built-in produces NO column (Phase 8a), so `undefined` here means
 *  "the sheet has no such field", which reads identically to an empty cell. */
function getOptionalCellValue(ws: XLSX.WorkSheet, col: number | undefined, row: number): unknown {
  return col === undefined ? undefined : getCellValue(ws, col, row)
}

/** Coerce a raw cell value to a string or undefined. */
function asString(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v).trim() || undefined
}

/** Coerce a raw cell value to a number, returning 0 for missing/NaN. */
function asNumber(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

/**
 * Parse a date cell value into "DD-MM-YYYY" (Firestore format).
 *
 * SheetJS with cellDates:true returns:
 *   - JS Date  → when the cell's numFmt is recognised as a date format
 *   - number   → raw Excel serial when numFmt is "General" or unrecognised (our old export bug)
 *   - string   → when the cell was stored as text (e.g. "23/07/2025")
 *
 * Exported for unit testing.
 */
export function parseDate(raw: unknown): string | undefined {
  let date: Date | undefined

  if (typeof raw === 'number' && raw > 0) {
    // Raw Excel serial → calendar date, entirely in UTC.
    //
    // ⚠️ Never do this with local Dates. The Excel epoch (1899-12-30) predates
    // standardised time zones, so the offset to a modern local midnight is not
    // a whole number of days: Europe/Paris was on LMT (+00:09:21) in 1899, and
    // Pacific/Kiritimati was on −10:40 then versus +14:00 now — over a day of
    // drift. Local arithmetic made the parsed date depend on the importing
    // machine's time zone and silently shifted every transaction by a day.
    return formatUtcDate(new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000))
  } else if (raw instanceof Date) {
    // A Date only reaches here from a workbook read elsewhere with cellDates
    // on; parseSheetFile deliberately reads raw serials instead. SheetJS builds
    // these so the LOCAL calendar fields carry the intended date.
    date = raw
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    // Try DD/MM/YYYY (our sheet display format)
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (slashMatch) {
      const [, d, m, y] = slashMatch.map(Number)
      date = new Date(y, m - 1, d)
    }
    // Try DD-MM-YYYY (Firestore format — e.g. if someone hand-edited the sheet)
    if (!date) {
      const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
      if (dashMatch) {
        const [, d, m, y] = dashMatch.map(Number)
        date = new Date(y, m - 1, d)
      }
    }
  }

  if (!date || isNaN(date.getTime())) return undefined

  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/** "DD-MM-YYYY" from a Date's UTC fields. */
function formatUtcDate(d: Date): string | undefined {
  if (isNaN(d.getTime())) return undefined
  const dd   = String(d.getUTCDate()).padStart(2, '0')
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getUTCFullYear()}`
}

// ---------------------------------------------------------------------------
// Step 1 — Parse
// ---------------------------------------------------------------------------

/**
 * Reads a .xlsx file and extracts:
 *  - The member slots and their display names (from the Parameters tab)
 *  - All transaction rows (from the Expenses tab)
 *  - The main currency
 *
 * Pure function — no Firestore writes.
 */
export async function parseSheetFile(file: File): Promise<ParseResult> {
  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer()
  // ⚠️ cellDates is deliberately OFF. Letting SheetJS build Date objects makes
  // the parsed day depend on the importing machine's time zone, because the
  // 1899 Excel epoch predates standardised offsets (see parseDate). Reading the
  // raw serial and converting in UTC is exact. Cells that were already stored
  // as text still arrive as strings and are handled by parseDate's string
  // branch — including the numFmtId=164 / "General" case, which has always
  // yielded raw integers here.
  const wb = XLSX.read(buffer, { cellDates: false })

  // ── Metadata sheet — decides which import path we are on ──────────────────
  const metaResult = parseMetaSheet(wb)
  const meta = metaResult.status === 'ok' ? metaResult.payload : null
  const metaWarning = metaResult.status === 'unsupported' ? metaResult.reason : undefined

  // ── Read Parameters sheet ──────────────────────────────────────────────────
  const wsParams = wb.Sheets[SHEET_PARAMS]
  if (!wsParams) throw new Error(`Sheet "${SHEET_PARAMS}" not found in the uploaded file.`)

  // Main currency is in B1
  const mainCurrency = asString(getCellValue(wsParams, 2, 1)) ?? 'EUR'

  // Member slots: rows 5 onwards while col A matches "Member_N"
  const slotNames: string[] = []
  for (let row = 5; row <= 5 + 100; row++) {
    const labelA = asString(getCellValue(wsParams, 1, row))
    if (!labelA || !/^Member_\d+$/.test(labelA)) break
    const nameB = asString(getCellValue(wsParams, 2, row)) ?? ''
    slotNames.push(nameB)
  }

  const nMembersInSheet = Math.max(1, slotNames.length)

  // The column layout. With metadata we know it exactly, including which
  // built-ins were omitted and which custom fields were emitted. Without it we
  // fall back to the historical all-built-ins layout, which is what every
  // pre-Phase-8 file uses.
  let cm: ColumnMap
  let customFields: CustomFieldDef[] = []
  if (meta) {
    cm = columnMapForConfig(nMembersInSheet, meta.config, meta.includedDisabledFields ?? [])
    customFields = cm.customFields
  } else {
    cm = buildColumnMap(nMembersInSheet)
  }

  // ── Read Expenses sheet ───────────────────────────────────────────────────
  const wsExpenses = wb.Sheets[SHEET_EXPENSES]
  if (!wsExpenses) throw new Error(`Sheet "${SHEET_EXPENSES}" not found in the uploaded file.`)

  const rows: ParsedSheetRow[] = []
  let consecutiveEmpty = 0

  for (let r = 3; r <= 3 + 5000; r++) {
    // Read using column map positions
    const rawDate   = getCellValue(wsExpenses, cm.date,        r)
    const rawName   = asString(getCellValue(wsExpenses, cm.name,        r))
    const rawAmount = getCellValue(wsExpenses, cm.amountLocal, r)
    const rawCurrency = asString(getCellValue(wsExpenses, cm.currency, r))

    const totalAmount = asNumber(rawAmount)
    const name = rawName ?? ''

    // Stop after 10 consecutive empty rows
    if (!name && !totalAmount) {
      consecutiveEmpty++
      if (consecutiveEmpty >= 10) break
      continue
    }
    consecutiveEmpty = 0

    // Skip rows that are still empty (e.g. sparse data)
    if (!name && !totalAmount) continue

    const costPerSlot: (number | undefined)[] = Array.from(
      { length: nMembersInSheet },
      (_, i) => {
        const v = asNumber(getCellValue(wsExpenses, cm.costLocal[i], r))
        return v !== 0 ? v : undefined
      },
    )

    const paidPerSlot: (number | undefined)[] = Array.from(
      { length: nMembersInSheet },
      (_, i) => {
        const v = asNumber(getCellValue(wsExpenses, cm.paidLocal[i], r))
        return v !== 0 ? v : undefined
      },
    )

    // Read the exchange rate column (present in exports with the rate column)
    const rawRate = getCellValue(wsExpenses, cm.exchangeRate, r)
    const exchangeRate = typeof rawRate === 'number' && rawRate > 0 ? rawRate : undefined

    // Read the hidden txId column (present in GlobeExpenses exports for re-import dedup)
    const txId = asString(getCellValue(wsExpenses, cm.txId, r))

    // Custom field columns. `customText` keeps the raw cell for the foreign
    // path; `custom` is the resolved value and is only meaningful when the
    // definitions came from the metadata sheet.
    const customText: Record<string, string> = {}
    const custom: Record<string, CustomValue> = {}
    for (const def of customFields) {
      const raw = asString(getCellValue(wsExpenses, cm.custom[def.id], r))
      if (raw !== undefined) customText[def.id] = raw

      if (def.type === 'boolean') {
        // ⚠️ Only `true` is stored. buildCustomPayload() omits false entirely,
        // so writing `false` here would produce documents that differ from
        // ones the app itself creates.
        if (parseBooleanCell(raw)) custom[def.id] = true
      } else if (raw !== undefined && raw !== '') {
        if (def.type === 'select') {
          // The cell holds the option LABEL; the metadata carries the id↔label
          // mapping, so this is a deterministic lookup, not a guess.
          const option = def.options?.find(
            (o) => o.label.toLowerCase() === raw.toLowerCase(),
          )
          if (option) custom[def.id] = option.id
        } else {
          custom[def.id] = raw
        }
      }
    }

    rows.push({
      date:          parseDate(rawDate) || new Date().toLocaleDateString('fr-FR').replace(/\//g, '-'),
      country:       asString(getOptionalCellValue(wsExpenses, cm.country,       r)),
      city:          asString(getOptionalCellValue(wsExpenses, cm.city,          r)),
      category:      asString(getOptionalCellValue(wsExpenses, cm.category,      r)),
      // Written to Firestore as the transaction name, in the current language.
      name:          name || getT().importExport.unnamedTransaction,
      totalAmount,
      currency:      rawCurrency ?? mainCurrency,
      paymentMethod: asString(getOptionalCellValue(wsExpenses, cm.paymentMethod, r)),
      notes:         asString(getOptionalCellValue(wsExpenses, cm.notes,         r)),
      splitLabel:    asString(getCellValue(wsExpenses, cm.splitLabel,    r)),
      paidByLabel:   asString(getCellValue(wsExpenses, cm.paidByLabel,   r)),
      costPerSlot,
      paidPerSlot,
      ...(exchangeRate !== undefined && { exchangeRate }),
      ...(txId && { txId }),
      ...(Object.keys(custom).length > 0 && { custom }),
      ...(Object.keys(customText).length > 0 && { customText }),
    })
  }

  // Build slot list — only include slots with at least 1 non-zero amount.
  // Slot i corresponds to Member_{i+1} in the Parameters sheet, which is the
  // same position the metadata sheet wrote its member list in.
  const slots: SheetMemberSlot[] = slotNames
    .map((nameInSheet, slotIndex) => {
      const rowCount = rows.filter(
        (row) =>
          (row.costPerSlot[slotIndex] ?? 0) !== 0 ||
          (row.paidPerSlot[slotIndex] ?? 0) !== 0,
      ).length
      const travelMemberId = meta?.members[slotIndex]?.travelMemberId
      return { slotIndex, nameInSheet, rowCount, ...(travelMemberId && { travelMemberId }) }
    })
    .filter((s) => s.rowCount > 0)

  return {
    rows,
    slots,
    mainCurrency,
    nMembersInSheet,
    meta,
    customFields,
    ...(metaWarning && { metaWarning }),
  }
}

// ---------------------------------------------------------------------------
// Import path selection
// ---------------------------------------------------------------------------

export type ImportPath =
  /** Our own export, coming back into the space it came from. Ids match: no
   *  member mapping, no label matching, nothing to ask the user. */
  | { kind: 'lossless'; slotToTravelMemberId: Record<number, string | undefined> }
  /** Our own export, going into a DIFFERENT space. The config is known but the
   *  ids are foreign, so members and custom fields both need mapping. */
  | { kind: 'foreignSpace' }
  /** No usable metadata: a spreadsheet from elsewhere, or a heavily edited one. */
  | { kind: 'foreignFile'; reason?: string }

/**
 * Decide how this file should be imported into this space.
 *
 * The lossless path requires that EVERY slot carrying data resolves to a member
 * that still exists in the target space. A partial match is treated as a
 * different space: silently importing half the splits by id and leaving the
 * rest unassigned would be worse than asking.
 */
export function selectImportPath(parseResult: ParseResult, space: Space): ImportPath {
  if (!parseResult.meta) {
    return { kind: 'foreignFile', ...(parseResult.metaWarning && { reason: parseResult.metaWarning }) }
  }

  const known = new Set(space.members.map((m) => m.travelMemberId))
  const active = parseResult.slots
  const allResolve = active.length > 0
    && active.every((s) => s.travelMemberId !== undefined && known.has(s.travelMemberId))

  if (!allResolve) return { kind: 'foreignSpace' }

  const slotToTravelMemberId: Record<number, string | undefined> = {}
  for (const slot of active) slotToTravelMemberId[slot.slotIndex] = slot.travelMemberId

  return { kind: 'lossless', slotToTravelMemberId }
}

/**
 * Custom values that can be written into the TARGET space as they stand.
 *
 * A field id survives only when the target space defines the same field, and a
 * `select` value only when the target still has that option id. Anything else
 * is dropped here rather than written as a dangling reference — the foreign
 * path maps those by label instead (Part 5).
 */
export function resolveCustomForSpace(
  custom: Record<string, CustomValue> | undefined,
  targetFields: CustomFieldDef[],
): Record<string, CustomValue> | undefined {
  if (!custom) return undefined
  const byId = new Map(targetFields.map((f) => [f.id, f]))
  const out: Record<string, CustomValue> = {}

  for (const [fieldId, value] of Object.entries(custom)) {
    const def = byId.get(fieldId)
    if (!def) continue
    if (def.type === 'select') {
      if (def.options?.some((o) => o.id === value)) out[fieldId] = value
    } else if (def.type === 'boolean') {
      if (value === true) out[fieldId] = true
    } else {
      out[fieldId] = value
    }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

// ---------------------------------------------------------------------------
// Import batch marker — one push per import, not one per row
// (docs/NOTIFICATIONS_SPEC.md §7)
// ---------------------------------------------------------------------------
//
// Every transaction written by one import run carries the same `importBatchId`.
// The Cloud Function that watches transactions sees that field and writes the
// activity-feed entry WITHOUT sending a push. Once every row is committed, the
// importer writes one small "this import is finished" document; a second Cloud
// Function reacts to it and sends a single summary push per involved member
// ("Alice imported 120 transactions, 35 involve you").

/** A fresh id for one import run. Generated client-side, no network needed. */
function newImportBatchId(spaceId: string): string {
  return doc(collection(db, 'travels', spaceId, 'importBatches')).id
}

/**
 * Writes the marker. Must be called AFTER the last batch of rows committed:
 * the server counts the rows when it sees the marker.
 *
 * Fire-and-forget: Firestore sends queued writes in order, so even offline the
 * marker reaches the server after its rows. A failure here only costs the
 * summary notification, never the import itself.
 */
function writeImportBatchMarker(spaceId: string, importBatchId: string, uid: string, rowCount: number): void {
  if (rowCount === 0) return
  setDoc(doc(db, 'travels', spaceId, 'importBatches', importBatchId), {
    // The security rules require createdBy to be the signed-in user.
    createdBy: uid,
    rowCount,
    createdAt: serverTimestamp(),
  }).catch((err: unknown) => {
    console.error('[sheetImport] import batch marker failed:', err)
  })
}

// ---------------------------------------------------------------------------
// Foreign-path writes
// ---------------------------------------------------------------------------

/**
 * Write rows built by the foreign path.
 *
 * Splits are already resolved to travelMemberIds, so there is no slot mapping —
 * that difference is why this is a sibling of importParsedRows() rather than a
 * parameter on it. Batching, progress and the offline story are identical.
 */
export async function importForeignRows(
  spaceId: string,
  rows: ForeignParsedRow[],
  currentUserUid: string,
  mainCurrency: string,
  onProgress?: (committed: number, total: number) => void,
): Promise<ImportResult> {
  const BATCH_SIZE = 500
  const txCollection = collection(db, 'travels', spaceId, 'transactions')
  const payloads: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = []
  // Stamped on every row of this run — see "Import batch marker" above.
  const importBatchId = newImportBatchId(spaceId)

  for (const row of rows) {
    const exchangeRate    = row.exchangeRate ?? getExchangeRate(row.currency, mainCurrency)
    const totalAmountMain = row.totalAmount * exchangeRate

    const data: Record<string, unknown> = {
      date:           row.date,
      name:           row.name,
      totalAmount:    row.totalAmount,
      currency:       row.currency,
      exchangeRate,
      totalAmountMain,
      paidBy:         row.paid,
      beneficiaries:  row.cost,
      createdBy:      { type: 'user', uid: currentUserUid },
      createdAt:      serverTimestamp(),
      lastModifiedBy: currentUserUid,
      lastModifiedAt: serverTimestamp(),
      importBatchId,
      // ⚠️ `!== undefined`, never truthiness: '' and 0 are valid stored values.
      ...(row.category      !== undefined && { category:      row.category }),
      ...(row.paymentMethod !== undefined && { paymentMethod: row.paymentMethod }),
      ...(row.country       !== undefined && { country:       row.country }),
      ...(row.city          !== undefined && { city:          row.city }),
      ...(row.notes         !== undefined && { notes:         row.notes }),
      ...(row.custom        !== undefined && { custom:        row.custom }),
    }

    payloads.push({ ref: doc(txCollection), data })
  }

  onProgress?.(0, payloads.length)
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const { ref, data } of payloads.slice(i, i + BATCH_SIZE)) batch.set(ref, data)
    await batch.commit()
    onProgress?.(Math.min(i + BATCH_SIZE, payloads.length), payloads.length)
  }

  // After the LAST batch: triggers the single summary notification.
  writeImportBatchMarker(spaceId, importBatchId, currentUserUid, payloads.length)

  return { imported: payloads.length, updated: 0, skipped: 0, errors: [] }
}

// ---------------------------------------------------------------------------
// Step 2 — Write to Firestore
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number    // new transactions created
  updated: number     // existing transactions updated (re-import with txId)
  skipped: number
  errors: string[]
}

/**
 * Writes parsed rows to Firestore as Transaction documents and syncs
 * any new list values (categories, countries, cities, paymentMethods,
 * currencies) to the space document.
 *
 * If a row carries a txId (from a previous GlobeExpenses export), the
 * existing document is updated in-place (merge: true) instead of creating
 * a duplicate.
 *
 * @param slotToTravelMemberId  Maps slotIndex → space member's travelMemberId.
 *                              undefined value = skip that slot's transactions.
 */
export async function importParsedRows(
  spaceId: string,
  rows: ParsedSheetRow[],
  slotToTravelMemberId: Record<number, string | undefined>,
  currentUserUid: string,
  mainCurrency: string,
  /** Called after each batch commit with (committedSoFar, totalToCommit). */
  onProgress?: (committed: number, total: number) => void,
  /** The TARGET space's custom field definitions. Values are filtered against
   *  these so a foreign field id is never written as a dangling reference. */
  targetCustomFields: CustomFieldDef[] = [],
): Promise<ImportResult> {
  let imported = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  // Collect all valid transaction payloads first, then batch-write in chunks of 500.
  // This avoids 1400+ individual pending writes which flood the onSnapshot listener.
  const BATCH_SIZE = 500
  const payloads: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = []
  const txCollection = collection(db, 'travels', spaceId, 'transactions')
  // Stamped on every row of this run — created AND updated-in-place rows — so
  // none of them pushes on its own. See "Import batch marker" above.
  const importBatchId = newImportBatchId(spaceId)
  // Messages in the current UI language (the result step lists the errors).
  const t = getT().importExport
  // parseSheetFile() names description-less rows in the language current at
  // parse time; also accept the English name for rows parsed before a switch.
  const isUnnamed = (name: string) => name === t.unnamedTransaction || name === '(unnamed)'

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const rowNumber = rowIndex + 1

    // Only skip rows that have neither a description nor an amount.
    // Zero-amount rows (transfers, withdrawals) are valid and must be imported.
    if (!row.name || isUnnamed(row.name)) {
      if (row.totalAmount === null || row.totalAmount === undefined) {
        skipped++
        continue
      }
    }

    // Build beneficiaries from costPerSlot (keyed by travelMemberId)
    const beneficiaries: { travelMemberId: string; amount: number }[] = []
    let hasUnmappedCost = false

    row.costPerSlot.forEach((amount, slotIdx) => {
      if (!amount || amount <= 0) return
      const travelMemberId = slotToTravelMemberId[slotIdx]
      if (travelMemberId === undefined) {
        errors.push(t.result.costSkipped({ row: rowNumber, name: row.name, slot: slotIdx + 1 }))
        hasUnmappedCost = true
      } else {
        beneficiaries.push({ travelMemberId, amount })
      }
    })

    // Build paidBy from paidPerSlot (keyed by travelMemberId)
    const paidBy: { travelMemberId: string; amount: number }[] = []
    let hasUnmappedPaid = false

    row.paidPerSlot.forEach((amount, slotIdx) => {
      if (!amount || amount === 0) return
      const travelMemberId = slotToTravelMemberId[slotIdx]
      if (travelMemberId === undefined) {
        errors.push(t.result.paidSkipped({ row: rowNumber, name: row.name, slot: slotIdx + 1 }))
        hasUnmappedPaid = true
      } else {
        paidBy.push({ travelMemberId, amount })
      }
    })

    // Skip if both arrays are empty after mapping
    if (beneficiaries.length === 0 && paidBy.length === 0) {
      if (!hasUnmappedCost && !hasUnmappedPaid) {
        // Truly nothing (zero-amount or all-zero splits) → silent skip
        skipped++
      }
      // else: already reported as errors above
      continue
    }

    // Prefer the rate stored in the sheet (locked at original transaction time).
    // Fall back to getExchangeRate() only for files exported before the rate column was added.
    const exchangeRate     = row.exchangeRate ?? getExchangeRate(row.currency, mainCurrency)
    const totalAmountMain  = row.totalAmount * exchangeRate

    // Build the transaction document data.
    // Optional fields are spread conditionally: passing `key: undefined` to
    // Firestore throws an error, so we only include the key when the value
    // is actually present.
    const data: Record<string, unknown> = {
      date:           row.date,
      name:           row.name,
      totalAmount:    row.totalAmount,
      currency:       row.currency,
      exchangeRate,
      totalAmountMain,
      paidBy,
      beneficiaries,
      createdBy:      { type: 'user', uid: currentUserUid },
      lastModifiedBy: currentUserUid,
      lastModifiedAt: serverTimestamp(),
      importBatchId,
      ...(row.category      !== undefined && { category:      row.category }),
      ...(row.paymentMethod !== undefined && { paymentMethod: row.paymentMethod }),
      ...(row.country       !== undefined && { country:       row.country }),
      ...(row.city          !== undefined && { city:          row.city }),
      ...(row.notes         !== undefined && { notes:         row.notes }),
    }

    // Custom values, filtered to fields the target space actually defines.
    const custom = resolveCustomForSpace(row.custom, targetCustomFields)
    if (custom) data.custom = custom

    // Use existing doc ref if txId is present (re-import dedup), otherwise generate a new ID.
    // For new documents, also set createdAt.
    if (row.txId) {
      payloads.push({ ref: doc(txCollection, row.txId), data })
      updated++
    } else {
      data.createdAt = serverTimestamp()
      payloads.push({ ref: doc(txCollection), data })
      imported++
    }
  }

  // Commit in chunks of 500 (Firestore hard limit per batch)
  onProgress?.(0, payloads.length)
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = payloads.slice(i, i + BATCH_SIZE)
    for (const { ref, data } of chunk) {
      // merge: true preserves createdAt / createdBy on re-import of existing rows
      batch.set(ref, data, { merge: true })
    }
    await batch.commit()
    onProgress?.(Math.min(i + BATCH_SIZE, payloads.length), payloads.length)
  }

  // After the LAST batch: triggers the single summary notification.
  writeImportBatchMarker(spaceId, importBatchId, currentUserUid, payloads.length)

  return { imported, updated, skipped, errors }
}
