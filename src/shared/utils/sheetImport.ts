// sheetImport.ts — parses a GlobeExpenses Standard Sheet and writes to Firestore.
//
// Two-step process:
//   1. parseSheetFile(file)   — pure: reads xlsx, returns typed rows + slot metadata
//   2. importParsedRows(...)  — writes: calls createTransaction for each valid row
//
// The member-mapping step (slot index → travel member UID) happens in the UI
// between the two steps.  See ImportXlsxDialog.tsx.

import * as XLSX from 'xlsx'
import { buildColumnMap, colLetter } from '@/shared/utils/sheetColumns'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { createTransaction } from '@/transactions/services/transactionService'
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
 * Parse a date cell value (JS Date, Excel serial number, or "DD/MM/YYYY" string)
 * into the Firestore format "DD-MM-YYYY".
 */
function parseDate(v: unknown): string {
  if (v instanceof Date) {
    const d = v
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear(),
    ].join('-')
  }
  if (typeof v === 'string') {
    const trimmed = v.trim()
    // Handles "DD/MM/YYYY" (sheet format)
    const slashParts = trimmed.split('/')
    if (slashParts.length === 3) {
      const [dd, mm, yyyy] = slashParts.map((s) => s.trim())
      return `${dd.padStart(2, '0')}-${mm.padStart(2, '0')}-${yyyy}`
    }
    // Handles "DD-MM-YYYY" (already correct)
    const dashParts = trimmed.split('-')
    if (dashParts.length === 3) {
      return `${dashParts[0].padStart(2, '0')}-${dashParts[1].padStart(2, '0')}-${dashParts[2]}`
    }
  }
  if (typeof v === 'number') {
    // Excel serial date: SheetJS exposes XLSX.SSF for date parsing
    try {
      const d = (XLSX.SSF as unknown as { parse_date_code: (n: number) => { d: number; m: number; y: number } | null }).parse_date_code(v)
      if (d) return `${String(d.d).padStart(2, '0')}-${String(d.m).padStart(2, '0')}-${d.y}`
    } catch {
      // fall through
    }
  }
  return ''
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

    rows.push({
      date:          parseDate(rawDate) || new Date().toLocaleDateString('fr-FR').replace(/\//g, '-'),
      country:       asString(getCellValue(wsExpenses, cm.country,       r)),
      city:          asString(getCellValue(wsExpenses, cm.city,          r)),
      category:      asString(getCellValue(wsExpenses, cm.category,      r)),
      name:          name || '(unnamed)',
      totalAmount,
      currency:      rawCurrency ?? mainCurrency,
      paymentMethod: asString(getCellValue(wsExpenses, cm.paymentMethod, r)),
      notes:         asString(getCellValue(wsExpenses, cm.notes,         r)),
      splitLabel:    asString(getCellValue(wsExpenses, cm.splitLabel,    r)),
      paidByLabel:   asString(getCellValue(wsExpenses, cm.paidByLabel,   r)),
      costPerSlot,
      paidPerSlot,
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
  imported: number
  skipped: number
  errors: string[]
}

/**
 * Writes parsed rows to Firestore as new Transaction documents.
 *
 * @param slotToMemberId  Maps slotIndex → travelMemberId.
 *                        undefined value = skip that slot's transactions.
 */
export async function importParsedRows(
  travelId: string,
  rows: ParsedSheetRow[],
  slotToMemberId: Record<number, string | undefined>,
  currentUserUid: string,
  mainCurrency: string,
): Promise<ImportResult> {
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  rows.forEach((row, rowIndex) => {
    const rowLabel = `Row ${rowIndex + 1}`

    // Skip rows that have no name and no amount (truly empty)
    if (!row.name || row.name === '(unnamed)') {
      if (!row.totalAmount) {
        skipped++
        return
      }
    }

    // Build beneficiaries from costPerSlot — Split now uses travelMemberId
    const beneficiaries: { travelMemberId: string; amount: number }[] = []
    let hasUnmappedCost = false

    row.costPerSlot.forEach((amount, slotIdx) => {
      if (!amount || amount <= 0) return
      const travelMemberId = slotToMemberId[slotIdx]
      if (travelMemberId === undefined) {
        errors.push(`${rowLabel} (${row.name}): slot ${slotIdx + 1} not mapped — cost skipped`)
        hasUnmappedCost = true
      } else {
        beneficiaries.push({ travelMemberId, amount })
      }
    })

    // Build paidBy from paidPerSlot — Split now uses travelMemberId
    const paidBy: { travelMemberId: string; amount: number }[] = []
    let hasUnmappedPaid = false

    row.paidPerSlot.forEach((amount, slotIdx) => {
      if (!amount || amount === 0) return
      const travelMemberId = slotToMemberId[slotIdx]
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
      return
    }

    // Compute exchange rate and main-currency amount
    const exchangeRate     = getExchangeRate(row.currency, mainCurrency)
    const totalAmountMain  = row.totalAmount * exchangeRate

    // Fire-and-forget create — returns txId synchronously.
    // Optional fields are spread conditionally: passing `key: undefined` to
    // setDoc() throws a Firestore error, so we only include the key when the
    // value is actually present.
    createTransaction(travelId, {
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
      ...(row.category      !== undefined && { category:      row.category }),
      ...(row.paymentMethod !== undefined && { paymentMethod: row.paymentMethod }),
      ...(row.country       !== undefined && { country:       row.country }),
      ...(row.city          !== undefined && { city:          row.city }),
      ...(row.notes         !== undefined && { notes:         row.notes }),
    })

    imported++
  })

  return { imported, skipped, errors }
}
