// sheetImport.ts — parses a GlobeExpenses Standard Sheet and writes to Firestore.
//
// Two-step process:
//   1. parseSheetFile(file)   — pure: reads xlsx, returns typed rows + slot metadata
//   2. importParsedRows(...)  — writes: calls createTransaction for each valid row
//
// The member-mapping step (slot index → space member UID) happens in the UI
// between the two steps.  See ImportXlsxDialog.tsx.

import * as XLSX from 'xlsx'
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { buildColumnMap, colLetter } from '@/shared/utils/sheetColumns'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { SHEET_PARAMS, SHEET_EXPENSES } from '@/shared/utils/sheetExport'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SheetMemberSlot {
  slotIndex: number       // 0-based (0 = Member_1)
  nameInSheet: string     // display name read from the Parameters tab
  rowCount: number        // number of data rows involving this slot (non-zero amounts)
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
}

export interface ParseResult {
  rows: ParsedSheetRow[]
  slots: SheetMemberSlot[]  // only slots with rowCount > 0
  mainCurrency: string
  nMembersInSheet: number
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

  if (raw instanceof Date) {
    // SheetJS correctly identified a date cell — use directly
    date = raw
  } else if (typeof raw === 'number' && raw > 0) {
    // Raw Excel serial — convert using the Excel epoch (1899-12-30).
    // This handles files exported before the date format fix was applied.
    const excelEpoch = new Date(1899, 11, 30)
    date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000)
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
  // cellDates: true → date-formatted numeric cells become JS Date objects
  const wb = XLSX.read(buffer, { cellDates: true })

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
  const cm = buildColumnMap(nMembersInSheet)

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

    rows.push({
      date:          parseDate(rawDate) || new Date().toLocaleDateString('fr-FR').replace(/\//g, '-'),
      country:       asString(getOptionalCellValue(wsExpenses, cm.country,       r)),
      city:          asString(getOptionalCellValue(wsExpenses, cm.city,          r)),
      category:      asString(getOptionalCellValue(wsExpenses, cm.category,      r)),
      name:          name || '(unnamed)',
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
    })
  }

  // Build slot list — only include slots with at least 1 non-zero amount
  const slots: SheetMemberSlot[] = slotNames
    .map((nameInSheet, slotIndex) => {
      const rowCount = rows.filter(
        (row) =>
          (row.costPerSlot[slotIndex] ?? 0) !== 0 ||
          (row.paidPerSlot[slotIndex] ?? 0) !== 0,
      ).length
      return { slotIndex, nameInSheet, rowCount }
    })
    .filter((s) => s.rowCount > 0)

  return { rows, slots, mainCurrency, nMembersInSheet }
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

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const rowLabel = `Row ${rowIndex + 1}`

    // Only skip rows that have neither a description nor an amount.
    // Zero-amount rows (transfers, withdrawals) are valid and must be imported.
    if (!row.name || row.name === '(unnamed)') {
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
        errors.push(`${rowLabel} (${row.name}): slot ${slotIdx + 1} not mapped — cost skipped`)
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
        errors.push(`${rowLabel} (${row.name}): slot ${slotIdx + 1} not mapped — paid skipped`)
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
      ...(row.category      !== undefined && { category:      row.category }),
      ...(row.paymentMethod !== undefined && { paymentMethod: row.paymentMethod }),
      ...(row.country       !== undefined && { country:       row.country }),
      ...(row.city          !== undefined && { city:          row.city }),
      ...(row.notes         !== undefined && { notes:         row.notes }),
    }

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

  return { imported, updated, skipped, errors }
}
