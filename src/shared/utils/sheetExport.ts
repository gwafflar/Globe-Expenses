// sheetExport.ts — generates and downloads a styled GlobeExpenses Standard Sheet.
//
// Uses xlsx-js-style (drop-in SheetJS fork that supports writing cell styles).
// Styling reproduces the template's color scheme:
//   - Dark navy headers with white text
//   - Per-member pastel column colors (6-color cycling palette)
//   - Light blue for computed/formula cells
//   - Thin borders throughout
//   - Calibri 10pt font

// xlsx-js-style is a CJS-only package — Vite resolves it fine at runtime,
// but there are no bundled TS declarations, so we import xlsx's types as a proxy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import XLSXStyleRaw from 'xlsx-js-style'
import type * as XLSXTypes from 'xlsx'
const XLSXStyle = XLSXStyleRaw as unknown as typeof XLSXTypes
import type { Space, SpaceMember } from '@/spaces/types'
import { getSpaceMainCurrency } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import type { Transaction } from '@/transactions/types'
import { EXCHANGE_RATES } from '@/shared/utils/exchangeRates'
import {
  colLetter,
  columnMapForConfig,
  customCellValue,
  OPTIONAL_BUILT_INS,
  type ColumnMap,
  type OptionalBuiltIn,
} from '@/shared/utils/sheetColumns'
import { SHEET_META, buildMetaSheet, hideSheet } from '@/shared/utils/sheetMeta'

// ---------------------------------------------------------------------------
// Sheet name constants (re-exported for sheetImport.ts)
// ---------------------------------------------------------------------------
export const SHEET_PARAMS          = '⚙️ Parameters'
export const SHEET_EXPENSES        = '📃 Expenses'
export const SHEET_BALANCE         = '⚖️ Balance'
export const SHEET_BALANCE_SUMMARY = '💸 Balance Summary'
export const SHEET_ANALYSIS        = '📊 Analysis'

const MAX_DATA_ROWS           = 2000
const EXPENSES_FIRST_DATA_ROW = 3
const EXPENSES_LAST_ROW       = EXPENSES_FIRST_DATA_ROW + MAX_DATA_ROWS - 1  // 2002

// ---------------------------------------------------------------------------
// Color palette — matches the template exactly
// ---------------------------------------------------------------------------
const C = {
  // Dark header backgrounds (use white text on all of these)
  NAVY:       '1F3864',   // primary section + column headers
  NAVY2:      '1F4E79',   // cost-main-total column header
  GREEN_DARK: '375623',   // paid-local section header
  PURPLE:     '7B2D8B',   // cost-main-per-member section header
  BROWN:      '843C0C',   // check columns header

  // Light backgrounds
  FORMULA:    'EBF3FB',   // computed/formula cells (light steel blue)
  LABEL_ALT:  'F2F2F2',   // alternating key/label cells in Parameters
  WHITE:      'FFFFFF',

  // Borders
  BORDER_DARK:  '8EA9C1', // borders next to dark headers
  BORDER_LIGHT: 'D6DCE4', // borders on data cells

  // Text
  TEXT_FORMULA: '1F4E79', // dark-blue text for formula cells
} as const

// Per-member 6-colour pastel palette (same order as the template)
const MEMBER_PASTELS = ['DDEBF7', 'FCE4D6', 'E2EFDA', 'FFF2CC', 'E8D5F5', 'FCE4F3'] as const
function memberPastel(i: number): string { return MEMBER_PASTELS[i % MEMBER_PASTELS.length] }

// ---------------------------------------------------------------------------
// Style factory helpers
// ---------------------------------------------------------------------------

// SheetJS style object — typed loosely since xlsx-js-style has no TS defs
type S = Record<string, unknown>

function fill(rgb: string): S       { return { fgColor: { rgb } as unknown, patternType: 'solid' } }
function fontWhite(bold = true): S  { return { bold, color: { rgb: C.WHITE }, sz: 10, name: 'Calibri' } }
function fontDark(bold = false): S  { return { bold, color: { rgb: '212121' }, sz: 10, name: 'Calibri' } }
function fontBlue(): S              { return { color: { rgb: C.TEXT_FORMULA }, sz: 10, name: 'Calibri' } }

function thinBorder(rgb: string): S {
  const side = { style: 'thin', color: { rgb } }
  return { top: side, bottom: side, left: side, right: side }
}
function medBorder(rgb: string): S {
  const side = { style: 'medium', color: { rgb } }
  return { top: side, bottom: side, left: side, right: side }
}

const CENTER: S = { horizontal: 'center', vertical: 'center' }
const LEFT:   S = { horizontal: 'left',   vertical: 'center' }
const WRAP:   S = { horizontal: 'center', vertical: 'center', wrapText: true }

/** Dark header: colored background, white bold text, medium border */
function hdrDark(bgRgb: string): S {
  return { font: fontWhite(true), fill: fill(bgRgb), border: medBorder(C.BORDER_DARK), alignment: CENTER }
}
/** Pastel column header: light background, dark bold text, thin border */
function hdrPastel(bgRgb: string): S {
  return { font: fontDark(true), fill: fill(bgRgb), border: thinBorder(C.BORDER_DARK), alignment: WRAP }
}
/** Normal data cell: white bg, thin border */
function dataCell(bgRgb: string = C.WHITE): S {
  return { font: fontDark(), fill: fill(bgRgb), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT }
}
/** Formula/computed cell: light blue bg, blue text, thin border */
function formulaCell(bgRgb = C.FORMULA): S {
  return { font: fontBlue(), fill: fill(bgRgb), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT }
}
/** Member data cell: pastel bg, dark text, thin border */
function memberCell(i: number): S {
  return { font: fontDark(), fill: fill(memberPastel(i)), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT }
}
/** Label/key cell (Parameters alternating row) */
function labelCell(): S {
  return { font: fontDark(), fill: fill(C.LABEL_ALT), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT }
}

// ---------------------------------------------------------------------------
// Worksheet cell writers
// ---------------------------------------------------------------------------
type WS = Record<string, { t: string; v?: unknown; f?: string; s?: S; z?: string }>

function addr(col: number, row: number): string { return `${colLetter(col)}${row}` }

function str(ws: WS, col: number, row: number, v: string, s?: S) {
  ws[addr(col, row)] = s ? { t: 's', v, s } : { t: 's', v }
}
function num(ws: WS, col: number, row: number, v: number, s?: S) {
  ws[addr(col, row)] = s ? { t: 'n', v, s } : { t: 'n', v }
}
// Formula — omit v so xlsx-js-style doesn't cache a stale value
function fml(ws: WS, col: number, row: number, formula: string, s?: S) {
  ws[addr(col, row)] = s ? { t: 'n', f: formula, s } : { t: 'n', f: formula }
}
// Apply (or update) a style on an existing or empty cell
function sty(ws: WS, col: number, row: number, s: S) {
  const a = addr(col, row)
  if (!ws[a]) ws[a] = { t: 'z', v: undefined }
  ws[a].s = s
}
/** Write a config-gated cell: nothing at all when the column does not exist,
 *  a styled-but-empty cell when the column exists and the value does not. */
function optionalCell(ws: WS, col: number | undefined, row: number, v: string | undefined) {
  if (col === undefined) return
  if (v) str(ws, col, row, v, dataCell())
  else   sty(ws, col, row, dataCell())
}

function setRef(ws: Record<string, unknown>, endCol: number, endRow: number) {
  ws['!ref'] = `A1:${colLetter(endCol)}${endRow}`
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function parseFsDate(d: string): Date {
  const [dd, mm, yyyy] = d.split('-').map(Number)
  return new Date(yyyy, mm - 1, dd)
}

/**
 * Convert a JS Date to an Excel date serial number.
 * Excel epoch is 1899-12-30 (not 1900-01-01) due to the intentional 1900 leap year bug.
 */
function dateToSerial(date: Date): number {
  const excelEpoch = new Date(1899, 11, 30) // 1899-12-30
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((date.getTime() - excelEpoch.getTime()) / msPerDay)
}

/**
 * Write a date cell with proper Excel serial + DD/MM/YYYY numFmt.
 * SheetJS (with cellDates:true) will re-read this as a JS Date object.
 */
function dat(ws: WS, col: number, row: number, dateStr: string, s?: S) {
  const jsDate = parseFsDate(dateStr)
  const cell: WS[string] = {
    t: 'n',
    v: dateToSerial(jsDate),
    z: 'DD/MM/YYYY',
  }
  if (s) cell.s = { ...s, numFmt: 'DD/MM/YYYY' }
  ws[addr(col, row)] = cell
}

// ---------------------------------------------------------------------------
// Split / paidBy label derivation
// ---------------------------------------------------------------------------
function deriveSplitLabel(tx: Transaction, members: SpaceMember[]): string {
  const nonZero = tx.beneficiaries.filter((b) => b.amount > 0)
  if (nonZero.length === 0) return ''
  const ids = [...new Set(nonZero.map((b) => b.travelMemberId))]
  if (ids.length === 1) return members.find((m) => m.travelMemberId === ids[0])?.displayName ?? ids[0]
  const expected = tx.totalAmount / members.length
  const allEqual = members.every((m) => {
    const b = tx.beneficiaries.find((s) => s.travelMemberId === m.travelMemberId)
    return Math.abs((b?.amount ?? 0) - expected) <= 0.01
  })
  return allEqual ? 'Split equal' : 'Custom'
}

function derivePaidByLabel(tx: Transaction, members: SpaceMember[]): string {
  const positive = tx.paidBy.filter((p) => p.amount > 0)
  const negative = tx.paidBy.filter((p) => p.amount < 0)
  if (positive.length === 1 && negative.length === 0)
    return members.find((m) => m.travelMemberId === positive[0].travelMemberId)?.displayName ?? positive[0].travelMemberId
  if (positive.length === 1 && negative.length === 1) {
    const from = members.find((m) => m.travelMemberId === positive[0].travelMemberId)?.displayName ?? '?'
    const to   = members.find((m) => m.travelMemberId === negative[0].travelMemberId)?.displayName ?? '?'
    return `Transfer ${from}➡️${to}`
  }
  return 'Custom'
}

// ---------------------------------------------------------------------------
// ⚙️ Parameters sheet
// ---------------------------------------------------------------------------
function buildParamsSheet(space: Space, mainCurrency: string, N: number): WS {
  const ws: WS = {}

  // Row 1: main currency header bar
  str(ws, 1, 1, 'Main Currency', hdrDark(C.NAVY))
  str(ws, 2, 1, 'Value',         hdrDark(C.NAVY))

  // Row 2: main currency value
  str(ws, 1, 2, 'Main Currency', labelCell())
  str(ws, 2, 2, mainCurrency,    dataCell())

  // Row 4: member table header
  str(ws, 1, 4, 'Member', hdrDark(C.NAVY))
  str(ws, 2, 4, 'Name',   hdrDark(C.NAVY))

  // Rows 5…4+N: member slots
  space.members.forEach((m, i) => {
    str(ws, 1, 5 + i, `Member_${i + 1}`, labelCell())
    str(ws, 2, 5 + i, m.displayName,     dataCell())
  })

  // Rate table header: row N+7, data starts N+8
  const ratesHeaderRow = N + 7
  const ratesDataStart = N + 8
  str(ws, 1, ratesHeaderRow, 'Currency',                hdrDark(C.NAVY))
  str(ws, 2, ratesHeaderRow, 'Rate (units per main ccy)', hdrDark(C.NAVY))

  // Build the rate table from space.defaultRates (if available), falling back to hardcoded.
  // Include all currencies from defaultRates + hardcoded EXCHANGE_RATES.
  const spaceRates = space.defaultRates ?? {}
  const rateMainEur = EXCHANGE_RATES[mainCurrency] ?? 1
  const allCurrencyCodes = new Set([...Object.keys(EXCHANGE_RATES), ...Object.keys(spaceRates)])
  const sortedCurrencies = Array.from(allCurrencyCodes).sort()
  sortedCurrencies.forEach((code, i) => {
    const row  = ratesDataStart + i
    // Prefer space-specific rate, then derive from hardcoded table
    let rate: number
    if (code === mainCurrency) {
      rate = 1
    } else if (spaceRates[code] !== undefined) {
      rate = spaceRates[code]
    } else {
      rate = rateMainEur / (EXCHANGE_RATES[code] ?? 1)
    }
    str(ws, 1, row, code,  labelCell())
    num(ws, 2, row, rate,  dataCell())
  })

  const endRow = ratesDataStart + sortedCurrencies.length - 1
  setRef(ws, 2, endRow)

  // Column widths: A=16, B=28
  ;(ws as Record<string, unknown>)['!cols'] = [{ wch: 16 }, { wch: 28 }]
  // Row heights: header rows taller
  const rows = Array.from({ length: endRow }, (_, i) =>
    i === 0 || i === 3 || i === ratesHeaderRow - 1 ? { hpt: 20 } : { hpt: 15 },
  )
  ;(ws as Record<string, unknown>)['!rows'] = rows

  return ws
}

// ---------------------------------------------------------------------------
// 📃 Expenses sheet
// ---------------------------------------------------------------------------
function buildExpensesSheet(
  space: Space,
  transactions: Transaction[],
  N: number,
  cm: ColumnMap,
): unknown {
  const ws: WS = {}
  const members = space.members
  const amtLetter  = colLetter(cm.amountLocal)

  // The "DETAILS" banner spans payment method, notes and the custom field
  // columns — all allocated contiguously in that order. Any of them may be
  // absent, so the span is derived from whichever actually exist rather than
  // from fixed endpoints. All three gone → no banner at all.
  const detailCols = [cm.paymentMethod, cm.notes, ...Object.values(cm.custom)]
    .filter((c): c is number => c !== undefined)
  const detailsStart = detailCols.length > 0 ? Math.min(...detailCols) : undefined
  const detailsEnd   = detailCols.length > 0 ? Math.max(...detailCols) : undefined

  // ── Row 1: section group headers ─────────────────────────────────────────
  str(ws, cm.rowIndex,           1, '#',                hdrDark(C.NAVY))
  str(ws, cm.date,               1, 'FILL IN',          hdrDark(C.NAVY))
  str(ws, cm.costLocal[0],       1, 'COST (local)',      hdrDark(C.NAVY2))
  str(ws, cm.paidLocal[0],       1, 'PAID (local)',      hdrDark(C.GREEN_DARK))
  if (detailsStart !== undefined) str(ws, detailsStart, 1, 'DETAILS', hdrDark(C.NAVY))
  str(ws, cm.costMainPerMember[0], 1, 'COST (main ccy)', hdrDark(C.PURPLE))
  str(ws, cm.checkCost,          1, 'CHECKS',           hdrDark(C.BROWN))

  // Fill the merged cells with the same header style (SheetJS merges need content)
  for (let c = cm.date + 1; c <= cm.paidByLabel; c++) sty(ws, c, 1, hdrDark(C.NAVY))
  for (let c = cm.costLocal[0] + 1; c <= cm.costLocal[N - 1]; c++) sty(ws, c, 1, hdrDark(C.NAVY2))
  for (let c = cm.paidLocal[0] + 1; c <= cm.paidLocal[N - 1]; c++) sty(ws, c, 1, hdrDark(C.GREEN_DARK))
  if (detailsStart !== undefined && detailsEnd !== undefined) {
    for (let c = detailsStart + 1; c <= detailsEnd; c++) sty(ws, c, 1, hdrDark(C.NAVY))
  }
  for (let c = cm.costMainPerMember[0] + 1; c <= cm.costMainPerMember[N - 1]; c++) sty(ws, c, 1, hdrDark(C.PURPLE))
  sty(ws, cm.checkPaid, 1, hdrDark(C.BROWN))
  sty(ws, cm.allGood,   1, hdrDark(C.BROWN))

  // ── Row 2: column headers ─────────────────────────────────────────────────
  // Disabled built-ins produce NO column, so each optional header is written
  // only when the map claimed a slot for it.
  const navy = hdrDark(C.NAVY)
  str(ws, cm.rowIndex,     2, '#',                    navy)
  str(ws, cm.date,         2, 'Date',                 navy)
  if (cm.country  !== undefined) str(ws, cm.country,  2, 'Country',  navy)
  if (cm.city     !== undefined) str(ws, cm.city,     2, 'City',     navy)
  if (cm.category !== undefined) str(ws, cm.category, 2, 'Category', navy)
  str(ws, cm.name,         2, 'Description',          navy)
  str(ws, cm.amountLocal,  2, 'Amount (local)',        navy)
  str(ws, cm.currency,     2, 'Currency',             navy)
  str(ws, cm.exchangeRate, 2, 'Exch. rate',           navy)
  str(ws, cm.costMain,     2, `Cost (${space.currencies[0] ?? 'main'})`, hdrDark(C.NAVY2))
  str(ws, cm.splitLabel,   2, 'Split',                navy)
  str(ws, cm.paidByLabel,  2, 'Paid by',              navy)
  if (cm.paymentMethod !== undefined) str(ws, cm.paymentMethod, 2, 'Payment method', navy)
  if (cm.notes         !== undefined) str(ws, cm.notes,         2, 'Notes',          navy)
  // Custom field headers: the field's label, with its emoji when set — this is
  // also the text the foreign-import path auto-matches on.
  for (const def of cm.customFields) {
    str(ws, cm.custom[def.id], 2, def.emoji ? `${def.emoji} ${def.label}` : def.label, navy)
  }
  str(ws, cm.checkCost,    2, '✔ Cost',               hdrDark(C.BROWN))
  str(ws, cm.checkPaid,    2, '✔ Paid',               hdrDark(C.BROWN))
  str(ws, cm.allGood,      2, '✅ OK?',               hdrDark(C.BROWN))

  // Per-member column headers use that member's pastel colour
  members.forEach((m, i) => {
    const pastel = hdrPastel(memberPastel(i))
    str(ws, cm.costLocal[i],         2, `Cost ${m.displayName} (local)`,    pastel)
    str(ws, cm.paidLocal[i],         2, `Paid ${m.displayName} (local)`,    pastel)
    str(ws, cm.costMainPerMember[i], 2, `Cost ${m.displayName} (main ccy)`, pastel)
  })

  // Merge definitions (0-indexed r, c). A single-column span is not merged —
  // Excel rejects a merge whose start equals its end.
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = []
  const merge = (startCol: number, endCol: number) => {
    if (endCol > startCol) merges.push({ s: { r: 0, c: startCol - 1 }, e: { r: 0, c: endCol - 1 } })
  }
  merge(cm.date, cm.paidByLabel)
  merge(cm.costLocal[0], cm.costLocal[N - 1])
  merge(cm.paidLocal[0], cm.paidLocal[N - 1])
  if (detailsStart !== undefined && detailsEnd !== undefined) merge(detailsStart, detailsEnd)
  merge(cm.costMainPerMember[0], cm.costMainPerMember[N - 1])
  merge(cm.checkCost, cm.allGood)

  // ── Data rows ─────────────────────────────────────────────────────────────
  const sorted = [...transactions].sort(
    (a, b) => parseFsDate(a.date).getTime() - parseFsDate(b.date).getTime(),
  )

  sorted.forEach((tx, idx) => {
    const r    = EXPENSES_FIRST_DATA_ROW + idx
    const rowNum = idx + 1

    // Fixed input columns
    num(ws, cm.rowIndex,    r, rowNum,                 dataCell(C.LABEL_ALT))
    dat(ws, cm.date,        r, tx.date,                dataCell())
    // Optional built-ins: write the value when the column exists, and style the
    // cell even when the value is empty so the grid stays visually complete.
    optionalCell(ws, cm.country,  r, tx.country)
    optionalCell(ws, cm.city,     r, tx.city)
    optionalCell(ws, cm.category, r, tx.category)
    str(ws, cm.name,        r, tx.name,                dataCell())
    num(ws, cm.amountLocal, r, tx.totalAmount,          dataCell())
    str(ws, cm.currency,    r, tx.currency,             dataCell())

    // Exchange rate locked at transaction creation time — not recomputed from the table.
    // This ensures re-import restores the original conversion, not today's rate.
    num(ws, cm.exchangeRate, r, tx.exchangeRate,        dataCell())

    // Cost main ccy: amount × exchange rate (simpler and more accurate than VLOOKUP)
    const exchLetter = colLetter(cm.exchangeRate)
    fml(ws, cm.costMain, r,
      `${amtLetter}${r}*${exchLetter}${r}`,
      formulaCell())

    // Cols J, K: split and paidBy labels
    str(ws, cm.splitLabel,  r, deriveSplitLabel(tx, members),  dataCell())
    str(ws, cm.paidByLabel, r, derivePaidByLabel(tx, members), dataCell())

    // Cost/paid local per member (pastel cells — user-filled data)
    members.forEach((m, i) => {
      const costSplit = tx.beneficiaries.find((s) => s.travelMemberId === m.travelMemberId)
      const paidSplit = tx.paidBy.find((s) => s.travelMemberId === m.travelMemberId)
      num(ws, cm.costLocal[i], r, costSplit?.amount ?? 0, memberCell(i))
      num(ws, cm.paidLocal[i], r, paidSplit?.amount ?? 0, memberCell(i))
    })

    // Payment method, notes
    optionalCell(ws, cm.paymentMethod, r, tx.paymentMethod)
    optionalCell(ws, cm.notes,         r, tx.notes)

    // Custom fields. select → option label, boolean → yes/no, text → raw
    // (see customCellValue). A boolean always writes a value: absent means
    // `no`, never blank, so the column reads unambiguously.
    for (const def of cm.customFields) {
      optionalCell(ws, cm.custom[def.id], r, customCellValue(def, tx.custom?.[def.id]))
    }

    // Cost main per member (formula → pastel + formula overlay)
    members.forEach((_m, i) => {
      const paramCell = `'${SHEET_PARAMS}'!$B$${5 + i}`
      const cLoc      = colLetter(cm.costLocal[i])
      // Use member pastel with blue-ish text to signal "computed"
      const fStyle: S = { font: fontBlue(), fill: fill(memberPastel(i)), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT }
      fml(ws, cm.costMainPerMember[i], r,
        `IF(${paramCell}="",0,IFERROR(${cLoc}${r}*${exchLetter}${r},0))`,
        fStyle)
    })

    // Check formulas (light blue formula style)
    const costRange = `${colLetter(cm.costLocal[0])}${r}:${colLetter(cm.costLocal[N - 1])}${r}`
    const paidRange = `${colLetter(cm.paidLocal[0])}${r}:${colLetter(cm.paidLocal[N - 1])}${r}`
    const ckStyle   = formulaCell()

    fml(ws, cm.checkCost, r,
      `IF(${amtLetter}${r}="","",IF(ROUND(SUM(${costRange})-${amtLetter}${r},4)=0,"✔️","❌"))`,
      ckStyle)
    fml(ws, cm.checkPaid, r,
      `IF(${amtLetter}${r}="","",IF(ROUND(SUM(${paidRange})-${amtLetter}${r},4)=0,"✔️","❌"))`,
      ckStyle)
    fml(ws, cm.allGood, r,
      `IF(${amtLetter}${r}="","",IF(AND(${colLetter(cm.checkCost)}${r}="✔️",${colLetter(cm.checkPaid)}${r}="✔️"),"✅","❌"))`,
      ckStyle)

    // Hidden txId column — Firestore document ID for round-trip re-import
    str(ws, cm.txId, r, tx.txId, dataCell())
  })

  const endRow = Math.max(2, EXPENSES_FIRST_DATA_ROW + sorted.length - 1)
  setRef(ws, cm.totalCols, endRow)
  ;(ws as Record<string, unknown>)['!merges'] = merges

  // Column widths. Assigned BY COLUMN NUMBER rather than by pushing in a fixed
  // order, so a disabled built-in shifts every following width automatically
  // instead of silently applying the Category width to the Description column.
  const colWidths: number[] = new Array(cm.totalCols).fill(14)
  const setWidth = (col: number | undefined, wch: number) => {
    if (col !== undefined) colWidths[col - 1] = wch
  }
  setWidth(cm.rowIndex, 5)
  setWidth(cm.date, 12)
  setWidth(cm.country, 20)
  setWidth(cm.city, 16)
  setWidth(cm.category, 18)
  setWidth(cm.name, 30)
  setWidth(cm.amountLocal, 14)
  setWidth(cm.currency, 10)
  setWidth(cm.exchangeRate, 12)
  setWidth(cm.costMain, 14)
  setWidth(cm.splitLabel, 14)
  setWidth(cm.paidByLabel, 16)
  setWidth(cm.paymentMethod, 18)
  setWidth(cm.notes, 25)
  for (const def of cm.customFields) setWidth(cm.custom[def.id], 18)
  setWidth(cm.checkCost, 10)
  setWidth(cm.checkPaid, 10)
  setWidth(cm.allGood, 9)
  setWidth(cm.txId, 0)         // hidden column

  ;(ws as Record<string, unknown>)['!cols'] = colWidths.map((wch) => ({ wch }))

  // Row heights
  const rows: { hpt: number }[] = [{ hpt: 22 }, { hpt: 22 }]
  for (let i = 0; i < sorted.length; i++) rows.push({ hpt: 16 })
  ;(ws as Record<string, unknown>)['!rows'] = rows

  return ws
}

// ---------------------------------------------------------------------------
// ⚖️ Balance sheet
// ---------------------------------------------------------------------------
function balanceMemberCols(i: number) {
  const base = 2 + 5 * i
  return { costLocal: base, paidLocal: base + 1, costMain: base + 2, paidMain: base + 3, balance: base + 4 }
}

function buildBalanceSheet(
  space: Space,
  N: number,
  cm: ColumnMap,
): unknown {
  const ws: WS = {}
  const members = space.members
  const lastExpCol    = colLetter(cm.totalCols)
  const expRange      = `'${SHEET_EXPENSES}'!$A:$${lastExpCol}`

  // Row 1: member section headers (merged per member)
  str(ws, 1, 1, '#', hdrDark(C.NAVY))
  members.forEach((m, i) => {
    const cols = balanceMemberCols(i)
    str(ws, cols.costLocal, 1, m.displayName, hdrDark(C.NAVY2))
    for (let c = cols.costLocal + 1; c <= cols.balance; c++) sty(ws, c, 1, hdrDark(C.NAVY2))
  })

  // Row 2: column headers
  str(ws, 1, 2, 'Row', hdrDark(C.NAVY))
  members.forEach((m, i) => {
    const cols   = balanceMemberCols(i)
    const pastel = hdrPastel(memberPastel(i))
    str(ws, cols.costLocal, 2, `Cost local (${m.displayName})`,    pastel)
    str(ws, cols.paidLocal, 2, `Paid local (${m.displayName})`,    pastel)
    str(ws, cols.costMain,  2, `Cost main (${m.displayName})`,     pastel)
    str(ws, cols.paidMain,  2, `Paid main (${m.displayName})`,     pastel)
    str(ws, cols.balance,   2, `Balance (${m.displayName})`,       hdrPastel(memberPastel(i)))
  })

  // Merges: row 1 per-member
  const merges = [
    ...members.map((_, i) => {
      const cols = balanceMemberCols(i)
      return { s: { r: 0, c: cols.costLocal - 1 }, e: { r: 0, c: cols.balance - 1 } }
    }),
  ]

  // 2000 data rows — styled with minimal cost (no per-cell colour, just borders)
  for (let r = 3; r <= 2 + MAX_DATA_ROWS; r++) {
    const rowIdx = r - 2
    num(ws, 1, r, rowIdx, dataCell(C.LABEL_ALT))

    members.forEach((_, i) => {
      const cols         = balanceMemberCols(i)
      const paramCell    = `'${SHEET_PARAMS}'!$B$${5 + i}`
      const paidLocLtr   = colLetter(cols.paidLocal)
      const costMainLtr  = colLetter(cols.costMain)
      const paidMainLtr  = colLetter(cols.paidMain)
      const fStyle       = formulaCell()

      fml(ws, cols.costLocal, r,
        `IF(${paramCell}="",0,IFERROR(VLOOKUP($A${r},${expRange},${cm.costLocal[i]},FALSE),0))`, fStyle)
      fml(ws, cols.paidLocal, r,
        `IF(${paramCell}="",0,IFERROR(VLOOKUP($A${r},${expRange},${cm.paidLocal[i]},FALSE),0))`, fStyle)
      fml(ws, cols.costMain, r,
        `IF(${paramCell}="",0,IFERROR(VLOOKUP($A${r},${expRange},${cm.costMainPerMember[i]},FALSE),0))`, fStyle)
      fml(ws, cols.paidMain, r,
        `IF(${paramCell}="",0,IFERROR(${paidLocLtr}${r}*VLOOKUP($A${r},${expRange},${cm.exchangeRate},FALSE),0))`, fStyle)
      fml(ws, cols.balance, r,
        `${paidMainLtr}${r}-${costMainLtr}${r}`,
        { font: fontDark(true), fill: fill(memberPastel(i)), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT })
    })
  }

  const totalBalanceCols = 1 + 5 * N
  setRef(ws, totalBalanceCols, 2 + MAX_DATA_ROWS)
  ;(ws as Record<string, unknown>)['!merges'] = merges

  // Column widths: row index col + 5 cols per member
  const colWidths = [6, ...Array.from({ length: N * 5 }, () => 16)]
  ;(ws as Record<string, unknown>)['!cols'] = colWidths.map((wch) => ({ wch }))
  ;(ws as Record<string, unknown>)['!rows'] = [{ hpt: 22 }, { hpt: 22 }]

  return ws
}

// ---------------------------------------------------------------------------
// 💸 Balance Summary sheet
// ---------------------------------------------------------------------------
function buildBalanceSummarySheet(space: Space, N: number): WS {
  const ws: WS = {}
  const members = space.members
  const balLastRow = 2 + MAX_DATA_ROWS

  str(ws, 1, 1, 'Member',               hdrDark(C.NAVY))
  str(ws, 2, 1, 'Total cost (main ccy)', hdrDark(C.NAVY2))
  str(ws, 3, 1, 'Total paid (main ccy)', hdrDark(C.GREEN_DARK))
  str(ws, 4, 1, 'Balance',              hdrDark(C.PURPLE))

  members.forEach((_m, i) => {
    const cols = balanceMemberCols(i)
    const r    = 2 + i
    fml(ws, 1, r, `'${SHEET_PARAMS}'!$B$${5 + i}`,                                              dataCell())
    fml(ws, 2, r, `SUM('${SHEET_BALANCE}'!${colLetter(cols.costMain)}3:${colLetter(cols.costMain)}${balLastRow})`, formulaCell())
    fml(ws, 3, r, `SUM('${SHEET_BALANCE}'!${colLetter(cols.paidMain)}3:${colLetter(cols.paidMain)}${balLastRow})`, formulaCell())
    fml(ws, 4, r, `C${r}-B${r}`,
      { font: fontDark(true), fill: fill(memberPastel(i)), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT })
  })

  setRef(ws, 4, 1 + N)
  ;(ws as Record<string, unknown>)['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 18 }]
  ;(ws as Record<string, unknown>)['!rows'] = [{ hpt: 22 }]
  return ws
}

// ---------------------------------------------------------------------------
// 📊 Analysis sheet
// ---------------------------------------------------------------------------
function buildAnalysisSheet(space: Space, N: number, cm: ColumnMap): unknown {
  const ws: WS = {}
  const members = space.members

  // B1: member selector
  str(ws, 1, 1, 'Member:', hdrDark(C.NAVY))
  str(ws, 2, 1, members[0]?.displayName ?? '', dataCell())

  const memberNamesRange = `'${SHEET_PARAMS}'!$B$5:$B$${4 + N}`
  const memberCostRanges = members
    .map((_, i) => {
      const l = colLetter(cm.costMainPerMember[i])
      return `'${SHEET_EXPENSES}'!${l}$3:${l}$${EXPENSES_LAST_ROW}`
    })
    .join(',')
  function sumproductFml(filterCol: string, filterVal: string): string {
    const fRange = `'${SHEET_EXPENSES}'!${filterCol}$3:${filterCol}$${EXPENSES_LAST_ROW}`
    return `SUMPRODUCT((${fRange}="${filterVal}")*N(CHOOSE(MATCH($B$1,${memberNamesRange},0),${memberCostRanges})))`
  }

  let row = 3

  /** One block: a header pair, then one row per value with a live SUMPRODUCT.
   *  Skipped entirely when the dimension has no exported column — a formula
   *  pointing at a column that does not exist resolves to #REF!. */
  function block(title: string, col: number | undefined, values: string[], bg: string) {
    if (col === undefined || values.length === 0) return
    const letter = colLetter(col)
    str(ws, 1, row, title,                 hdrDark(bg))
    str(ws, 2, row, 'Spending (main ccy)', hdrDark(bg))
    row++
    for (const value of values) {
      str(ws, 1, row, value,                          dataCell())
      fml(ws, 2, row, sumproductFml(letter, value),   formulaCell())
      row++
    }
    row++ // blank separator
  }

  // ⚠️ Values come from the space's LISTS, and must be rendered exactly as the
  // Expenses column stores them or the SUMPRODUCT silently sums to zero.
  // country is stored BARE; category is stored WITH its emoji prefix. That
  // asymmetry is real — see audit finding F7.
  block('Country', cm.country, space.countries.map((c) => c.label), C.NAVY2)
  block(
    'Category',
    cm.category,
    space.categories.map((c) => (c.emoji ? `${c.emoji} ${c.label}` : c.label)),
    C.PURPLE,
  )

  setRef(ws, 2, Math.max(row - 1, 4))
  ;(ws as Record<string, unknown>)['!cols'] = [{ wch: 28 }, { wch: 22 }]
  ;(ws as Record<string, unknown>)['!rows'] = [{ hpt: 20 }]
  return ws
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Disabled fields that still hold data
// ---------------------------------------------------------------------------

/** A field that is switched off but still has stored values. */
export interface OrphanedField {
  /** Built-in field name ('country', …) or a CustomFieldDef.id. */
  key: string
  label: string
  /** How many transactions carry a value for it. */
  count: number
  source: 'builtIn' | 'custom'
}

const BUILT_IN_LABELS: Record<OptionalBuiltIn, string> = {
  country: 'Country',
  city: 'City',
  category: 'Category',
  paymentMethod: 'Payment method',
  notes: 'Notes',
}

/**
 * Find disabled fields that still hold values on at least one transaction.
 *
 * The user cannot see these fields in the app, so exporting without them would
 * silently drop data — hence the warning before the file is generated
 * (SPEC §9bis). Returns [] when there is nothing to warn about, which is the
 * overwhelmingly common case.
 */
export function findOrphanedFields(space: Space, transactions: Transaction[]): OrphanedField[] {
  const config = getSpaceConfig(space)
  const out: OrphanedField[] = []

  for (const key of OPTIONAL_BUILT_INS) {
    if (config.builtInFields[key]) continue
    // ⚠️ Test for a present value, not a truthy one: '' is not stored, but
    // filtering by truthiness is the habit that drops `false` and `0` elsewhere.
    const count = transactions.filter((tx) => {
      const v = tx[key]
      return v !== undefined && v !== ''
    }).length
    if (count > 0) out.push({ key, label: BUILT_IN_LABELS[key], count, source: 'builtIn' })
  }

  for (const def of config.customFields) {
    if (def.enabled) continue
    const count = transactions.filter((tx) => {
      const v = tx.custom?.[def.id]
      // `false` is never stored (buildCustomPayload omits it), so an absent key
      // on a boolean field is not orphaned data — nothing would be lost.
      return v !== undefined && v !== ''
    }).length
    if (count > 0) {
      out.push({
        key: def.id,
        label: def.emoji ? `${def.emoji} ${def.label}` : def.label,
        count,
        source: 'custom',
      })
    }
  }

  return out
}

export interface ExportOptions {
  /** Disabled fields the user chose to export anyway, after the warning.
   *  Keys are built-in field names ('country', …) or CustomFieldDef ids. */
  includedDisabledFields?: string[]
  /** Injectable for deterministic tests. */
  now?: Date
}

/**
 * Assemble the workbook without writing it.
 *
 * Split out from exportSpaceToXlsx() so tests can inspect and re-parse the
 * workbook in memory — writeFile() touches the DOM and cannot run in the
 * round-trip tests that are this phase's core deliverable.
 */
export function buildSpaceWorkbook(
  space: Space,
  transactions: Transaction[],
  options: ExportOptions = {},
): XLSXTypes.WorkBook {
  const N            = Math.max(1, space.members.length)
  const mainCurrency = getSpaceMainCurrency(space)
  const config       = getSpaceConfig(space)

  // ONE column map for the whole workbook. The Balance sheet's VLOOKUPs index
  // into the Expenses sheet by column number, so a second, differently-derived
  // map would produce formulas that read the wrong column.
  const cm = columnMapForConfig(N, config, options.includedDisabledFields ?? [])

  // Use xlsx-js-style's book_new so the workbook carries style metadata
  const wb = XLSXStyle.utils.book_new()

  type WB_WS = XLSXTypes.WorkSheet
  XLSXStyle.utils.book_append_sheet(wb, buildParamsSheet(space, mainCurrency, N)         as WB_WS, SHEET_PARAMS)
  XLSXStyle.utils.book_append_sheet(wb, buildExpensesSheet(space, transactions, N, cm)   as WB_WS, SHEET_EXPENSES)
  XLSXStyle.utils.book_append_sheet(wb, buildBalanceSheet(space, N, cm)                  as WB_WS, SHEET_BALANCE)
  XLSXStyle.utils.book_append_sheet(wb, buildBalanceSummarySheet(space, N)               as WB_WS, SHEET_BALANCE_SUMMARY)
  XLSXStyle.utils.book_append_sheet(wb, buildAnalysisSheet(space, N, cm)                 as WB_WS, SHEET_ANALYSIS)

  // Metadata sheet last, then hidden: it is machine-read only, and a visible
  // tab of JSON invites a user to "fix" it.
  XLSXStyle.utils.book_append_sheet(
    wb,
    buildMetaSheet(space, config, mainCurrency, {
      includedDisabledFields: options.includedDisabledFields,
      now: options.now,
    }),
    SHEET_META,
  )
  hideSheet(wb, SHEET_META)

  return wb
}

/** Filename for an exported space. Derived from the space name, with characters
 *  that are illegal in a filename on Windows/macOS replaced. */
export function exportFileName(space: Space, now: Date = new Date()): string {
  const sanitised = space.name.replace(/[\\/:*?"<>|]/g, '-').trim()
  // A name made only of illegal characters sanitises to "---", which is a
  // legal filename but a useless one — fall back to a placeholder instead.
  const safeName = /[^-\s]/.test(sanitised) ? sanitised : 'Space'
  return `GlobeExpenses_${safeName}_${now.toISOString().slice(0, 10)}.xlsx`
}

export async function exportSpaceToXlsx(
  space: Space,
  transactions: Transaction[],
  options: ExportOptions = {},
): Promise<void> {
  const wb = buildSpaceWorkbook(space, transactions, options)
  XLSXStyle.writeFile(wb, exportFileName(space, options.now))
}
