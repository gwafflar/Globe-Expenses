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
import type { CustomFieldDef, Space, SpaceConfig, SpaceMember } from '@/spaces/types'
import { getSpaceMainCurrency } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import type { Transaction } from '@/transactions/types'
import { EXCHANGE_RATES } from '@/shared/utils/exchangeRates'
import {
  colLetter,
  columnForDimension,
  columnMapForConfig,
  customCellValue,
  dimensionCellText,
  OPTIONAL_BUILT_INS,
  type ColumnMap,
  type OptionalBuiltIn,
} from '@/shared/utils/sheetColumns'
import {
  breakdownDimensions,
  cardTitle,
  resolveDashboardCards,
  visibleDashboardCards,
} from '@/spaces/utils/dashboardCards'
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
/**
 * Numeric formula cell, with its value computed here and cached.
 *
 * ⚠️ The cached `v` is REQUIRED and must be CORRECT, for two separate reasons:
 *
 *  1. SheetJS 0.18.5 skips any cell whose `v` is undefined when serialising —
 *     formula and all. Writing `{ t:'n', f }` alone produced files with the
 *     formula silently missing.
 *  2. Not every consumer recalculates on open. Excel and LibreOffice honour
 *     the workbook's fullCalcOnLoad flag, but Google Sheets and lightweight
 *     viewers may simply render the cached value. A placeholder of 0 would
 *     show them a grid of zeros — worse than the blank cells this replaced.
 *
 * So the caller passes the value it would compute anyway. fullCalcOnLoad stays
 * on top of this, to keep the sheet live once the user edits the data.
 */
function fml(ws: WS, col: number, row: number, formula: string, value: number, s?: S) {
  const v = Number.isFinite(value) ? value : 0
  ws[addr(col, row)] = s ? { t: 'n', v, f: formula, s } : { t: 'n', v, f: formula }
}

/** String-valued formula cell (the ✔/❌ check columns). Same caching rule. */
function fmlStr(ws: WS, col: number, row: number, formula: string, value: string, s?: S) {
  ws[addr(col, row)] = s ? { t: 'str', v: value, f: formula, s } : { t: 'str', v: value, f: formula }
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

/** Milliseconds in a day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Convert a "DD-MM-YYYY" transaction date to an Excel date serial.
 *
 * ⚠️ Computed entirely in UTC. The Excel epoch (1899-12-30) predates
 * standardised time zones, so the offset between it and a modern LOCAL
 * midnight is not a whole number of days — Europe/Paris was on LMT (+00:09:21)
 * in 1899, and Pacific/Kiritimati was on −10:40 while today it is +14:00, a
 * difference of more than a day. Doing this arithmetic on local Dates made the
 * serial depend on the exporting machine's time zone; in UTC it is exact
 * integer arithmetic with nothing to round.
 *
 * Excel's epoch is 1899-12-30 rather than 1900-01-01 because of the
 * intentional 1900-leap-year bug it inherited from Lotus 1-2-3.
 */
export function fsDateToSerial(d: string): number {
  const [dd, mm, yyyy] = d.split('-').map(Number)
  return (Date.UTC(yyyy, mm - 1, dd) - Date.UTC(1899, 11, 30)) / MS_PER_DAY
}

/**
 * Write a date cell with proper Excel serial + DD/MM/YYYY numFmt.
 * SheetJS (with cellDates:true) will re-read this as a JS Date object.
 */
function dat(ws: WS, col: number, row: number, dateStr: string, s?: S) {
  const cell: WS[string] = {
    t: 'n',
    v: fsDateToSerial(dateStr),
    z: 'DD/MM/YYYY',
  }
  if (s) cell.s = { ...s, numFmt: 'DD/MM/YYYY' }
  ws[addr(col, row)] = cell
}

// ---------------------------------------------------------------------------
// Cached formula values
// ---------------------------------------------------------------------------
//
// Every formula the workbook writes also has its result computed here, so the
// file is correct even in a viewer that never recalculates. These mirror the
// formulas exactly; a change to one requires the same change to the other.

/** The amount a member is liable for, in local currency. */
function memberCostLocal(tx: Transaction, travelMemberId: string): number {
  return tx.beneficiaries.find((b) => b.travelMemberId === travelMemberId)?.amount ?? 0
}

/** The amount a member actually paid, in local currency. */
function memberPaidLocal(tx: Transaction, travelMemberId: string): number {
  return tx.paidBy.find((p) => p.travelMemberId === travelMemberId)?.amount ?? 0
}

/** Mirrors the Expenses sheet's per-member cost-in-main-currency formula. */
function memberCostMain(tx: Transaction, travelMemberId: string): number {
  return memberCostLocal(tx, travelMemberId) * tx.exchangeRate
}

/** Mirrors the ✔ check formulas: splits must sum to the transaction total. */
function checkMark(sum: number, total: number): string {
  return Math.round((sum - total) * 10000) / 10000 === 0 ? '✔️' : '❌'
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
  /** Date-sorted by the caller. */
  sorted: Transaction[],
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
  // Already date-sorted by the caller — see the note in buildSpaceWorkbook().
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
      tx.totalAmount * tx.exchangeRate,
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
    members.forEach((m, i) => {
      const paramCell = `'${SHEET_PARAMS}'!$B$${5 + i}`
      const cLoc      = colLetter(cm.costLocal[i])
      // Use member pastel with blue-ish text to signal "computed"
      const fStyle: S = { font: fontBlue(), fill: fill(memberPastel(i)), border: thinBorder(C.BORDER_LIGHT), alignment: LEFT }
      fml(ws, cm.costMainPerMember[i], r,
        `IF(${paramCell}="",0,IFERROR(${cLoc}${r}*${exchLetter}${r},0))`,
        memberCostMain(tx, m.travelMemberId),
        fStyle)
    })

    // Check formulas (light blue formula style)
    const costRange = `${colLetter(cm.costLocal[0])}${r}:${colLetter(cm.costLocal[N - 1])}${r}`
    const paidRange = `${colLetter(cm.paidLocal[0])}${r}:${colLetter(cm.paidLocal[N - 1])}${r}`
    const ckStyle   = formulaCell()

    // Cached values mirror the formulas: sum the per-member columns as WRITTEN
    // (only this space's members have columns), not the raw split arrays.
    const costSum = members.reduce((s, m) => s + memberCostLocal(tx, m.travelMemberId), 0)
    const paidSum = members.reduce((s, m) => s + memberPaidLocal(tx, m.travelMemberId), 0)
    const costOk  = checkMark(costSum, tx.totalAmount)
    const paidOk  = checkMark(paidSum, tx.totalAmount)

    fmlStr(ws, cm.checkCost, r,
      `IF(${amtLetter}${r}="","",IF(ROUND(SUM(${costRange})-${amtLetter}${r},4)=0,"✔️","❌"))`,
      costOk, ckStyle)
    fmlStr(ws, cm.checkPaid, r,
      `IF(${amtLetter}${r}="","",IF(ROUND(SUM(${paidRange})-${amtLetter}${r},4)=0,"✔️","❌"))`,
      paidOk, ckStyle)
    fmlStr(ws, cm.allGood, r,
      `IF(${amtLetter}${r}="","",IF(AND(${colLetter(cm.checkCost)}${r}="✔️",${colLetter(cm.checkPaid)}${r}="✔️"),"✅","❌"))`,
      costOk === '✔️' && paidOk === '✔️' ? '✅' : '❌', ckStyle)

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
  /** The SAME date-sorted list the Expenses sheet wrote. The VLOOKUPs below key
   *  on the Expenses row index, so a differently ordered list would cache
   *  values against the wrong rows. */
  sorted: Transaction[],
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

    // The Expenses row this VLOOKUP resolves to, or undefined past the data —
    // where every formula yields 0 because the lookup fails into IFERROR.
    const tx = sorted[rowIdx - 1]

    members.forEach((m, i) => {
      const cols         = balanceMemberCols(i)
      const paramCell    = `'${SHEET_PARAMS}'!$B$${5 + i}`
      const paidLocLtr   = colLetter(cols.paidLocal)
      const costMainLtr  = colLetter(cols.costMain)
      const paidMainLtr  = colLetter(cols.paidMain)
      const fStyle       = formulaCell()

      const costLocalV = tx ? memberCostLocal(tx, m.travelMemberId) : 0
      const paidLocalV = tx ? memberPaidLocal(tx, m.travelMemberId) : 0
      const costMainV  = tx ? memberCostMain(tx, m.travelMemberId) : 0
      const paidMainV  = tx ? paidLocalV * tx.exchangeRate : 0

      fml(ws, cols.costLocal, r,
        `IF(${paramCell}="",0,IFERROR(VLOOKUP($A${r},${expRange},${cm.costLocal[i]},FALSE),0))`,
        costLocalV, fStyle)
      fml(ws, cols.paidLocal, r,
        `IF(${paramCell}="",0,IFERROR(VLOOKUP($A${r},${expRange},${cm.paidLocal[i]},FALSE),0))`,
        paidLocalV, fStyle)
      fml(ws, cols.costMain, r,
        `IF(${paramCell}="",0,IFERROR(VLOOKUP($A${r},${expRange},${cm.costMainPerMember[i]},FALSE),0))`,
        costMainV, fStyle)
      fml(ws, cols.paidMain, r,
        `IF(${paramCell}="",0,IFERROR(${paidLocLtr}${r}*VLOOKUP($A${r},${expRange},${cm.exchangeRate},FALSE),0))`,
        paidMainV, fStyle)
      fml(ws, cols.balance, r,
        `${paidMainLtr}${r}-${costMainLtr}${r}`,
        paidMainV - costMainV,
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
function buildBalanceSummarySheet(space: Space, N: number, transactions: Transaction[]): WS {
  const ws: WS = {}
  const members = space.members
  const balLastRow = 2 + MAX_DATA_ROWS

  str(ws, 1, 1, 'Member',               hdrDark(C.NAVY))
  str(ws, 2, 1, 'Total cost (main ccy)', hdrDark(C.NAVY2))
  str(ws, 3, 1, 'Total paid (main ccy)', hdrDark(C.GREEN_DARK))
  str(ws, 4, 1, 'Balance',              hdrDark(C.PURPLE))

  members.forEach((m, i) => {
    const cols = balanceMemberCols(i)
    const r    = 2 + i

    const costTotal = transactions.reduce((s, tx) => s + memberCostMain(tx, m.travelMemberId), 0)
    const paidTotal = transactions.reduce(
      (s, tx) => s + memberPaidLocal(tx, m.travelMemberId) * tx.exchangeRate, 0,
    )

    // The member name is a formula pointing at the Parameters sheet, so
    // renaming there updates this — its cached value is the name itself.
    fmlStr(ws, 1, r, `'${SHEET_PARAMS}'!$B$${5 + i}`, m.displayName, dataCell())
    fml(ws, 2, r, `SUM('${SHEET_BALANCE}'!${colLetter(cols.costMain)}3:${colLetter(cols.costMain)}${balLastRow})`,
      costTotal, formulaCell())
    fml(ws, 3, r, `SUM('${SHEET_BALANCE}'!${colLetter(cols.paidMain)}3:${colLetter(cols.paidMain)}${balLastRow})`,
      paidTotal, formulaCell())
    fml(ws, 4, r, `C${r}-B${r}`,
      paidTotal - costTotal,
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

/** Row label for a transaction with no value on a dimension. Matches empty
 *  cells via `=""`, which also matches the unused rows below the data — those
 *  contribute 0 because their cost cells are empty too, so the total is right. */
const NONE_LABEL = '(none)'

/** Caps on generated block size. The dashboard's own top-N (5 rows, 8 sections)
 *  is a small-screen affordance; a spreadsheet can afford far more, but a
 *  dimension with 300 distinct values must still not generate a 300-row block
 *  or a 300×300 grid. Values are ranked by spend, so a cap keeps the largest. */
const MAX_1D_ROWS = 60
const MAX_PIVOT_ROWS = 25
const MAX_PIVOT_COLS = 15

/** Distinct values of one dimension across the exported transactions, ranked by
 *  total spend descending — the same ordering the dashboard card uses, so the
 *  sheet reads like the app. `hasBlank` drives the optional "(none)" entry. */
function rankedDimensionValues(
  transactions: Transaction[],
  key: string,
  customFields: CustomFieldDef[],
  limit: number,
): { values: string[]; hasBlank: boolean; distinct: number } {
  const totals = new Map<string, number>()
  let hasBlank = false

  for (const tx of transactions) {
    const text = dimensionCellText(tx, key, customFields)
    if (text === '') {
      hasBlank = true
      continue
    }
    totals.set(text, (totals.get(text) ?? 0) + Math.abs(tx.totalAmountMain ?? 0))
  }

  const values = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value)

  return { values, hasBlank, distinct: totals.size }
}

/** Note appended to a block whose values were capped.
 *
 *  A spreadsheet implies completeness in a way a phone card does not: someone
 *  reconciling a total against 60 listed countries when there were 78 would
 *  find a gap they cannot explain. Costs one row, prevents that. */
function truncationNote(shown: number, distinct: number): string | null {
  return distinct > shown ? `Top ${shown} of ${distinct} by spend — ${distinct - shown} more not shown` : null
}

/** Escape a value for use inside an Excel string literal in a formula. */
function fmlString(v: string): string {
  return v.replace(/"/g, '""')
}

/**
 * 📊 Analysis sheet — GENERATED from config.dashboardCards (SPEC §9bis).
 *
 * The old sheet hard-coded a country block and a category block because the app
 * began as a travel app. The user has already declared which breakdowns matter
 * by building dashboard cards, so those are reused rather than adding a second
 * place to configure the same thing.
 *
 *   - 1D card  → a single-axis block, one row per value.
 *   - 2D pivot → a cross-tab, primary down and secondary across.
 *   - a card whose dimension has no exported column is SKIPPED, not emitted
 *     broken. That is the disabled-field case that used to yield #REF!.
 *   - no cards survive → returns null and the sheet is omitted entirely.
 *
 * Formulas stay live (real SUMPRODUCT over the Expenses sheet) rather than
 * pasted values: the point of this sheet is that it recalculates when the user
 * edits the data. Every cell reference is derived from the column map, never
 * from a fixed letter.
 */
function buildAnalysisSheet(
  space: Space,
  N: number,
  cm: ColumnMap,
  config: SpaceConfig,
  transactions: Transaction[],
): unknown | null {
  // Which cards the dashboard would show, then which of those have columns here.
  const dimensions = breakdownDimensions(space, config)
  const visible = visibleDashboardCards(resolveDashboardCards(config), dimensions)
  const cards = visible
    .map(({ card, dims }) => ({
      card,
      dims,
      cols: dims.map((d) => columnForDimension(cm, d.key)),
    }))
    .filter((entry): entry is typeof entry & { cols: number[] } =>
      entry.cols.every((c): c is number => c !== undefined),
    )

  if (cards.length === 0) return null

  const ws: WS = {}
  const members = space.members

  // B1: member selector — every formula below is scoped to whoever is named here.
  str(ws, 1, 1, 'Member:', hdrDark(C.NAVY))
  str(ws, 2, 1, members[0]?.displayName ?? '', dataCell())

  const memberNamesRange = `'${SHEET_PARAMS}'!$B$5:$B$${4 + N}`
  const memberCostRanges = members
    .map((_, i) => {
      const l = colLetter(cm.costMainPerMember[i])
      return `'${SHEET_EXPENSES}'!${l}$3:${l}$${EXPENSES_LAST_ROW}`
    })
    .join(',')
  const memberCost = `N(CHOOSE(MATCH($B$1,${memberNamesRange},0),${memberCostRanges}))`

  /** The comparison term for one dimension column against one value. */
  const term = (col: number, value: string) => {
    const letter = colLetter(col)
    const range = `'${SHEET_EXPENSES}'!${letter}$3:${letter}$${EXPENSES_LAST_ROW}`
    return `(${range}="${fmlString(value === NONE_LABEL ? '' : value)}")`
  }

  /** SUMPRODUCT over one or two dimension filters, scoped to the B1 member. */
  const sumproduct = (filters: { col: number; value: string }[]) =>
    `SUMPRODUCT(${filters.map((f) => term(f.col, f.value)).join('*')}*${memberCost})`

  // Cached value mirroring that SUMPRODUCT, for the member the selector starts
  // on. Scoped to members[0] because that is what B1 holds on open.
  const defaultMemberId = members[0]?.travelMemberId
  const sumproductValue = (filters: { key: string; value: string }[]) => {
    if (!defaultMemberId) return 0
    return transactions.reduce((sum, tx) => {
      const matches = filters.every(({ key, value }) => {
        const text = dimensionCellText(tx, key, cm.customFields)
        return value === NONE_LABEL ? text === '' : text === value
      })
      return matches ? sum + memberCostMain(tx, defaultMemberId) : sum
    }, 0)
  }

  let row = 3
  let widestCol = 2

  for (const { card, dims, cols } of cards) {
    const title = cardTitle(card, dims)

    if (dims.length === 1) {
      // ── 1D block ──────────────────────────────────────────────────────────
      const { values, hasBlank, distinct } = rankedDimensionValues(
        transactions, dims[0].key, cm.customFields, MAX_1D_ROWS,
      )
      const rows = hasBlank ? [...values, NONE_LABEL] : values
      if (rows.length === 0) continue

      str(ws, 1, row, title,                 hdrDark(C.NAVY2))
      str(ws, 2, row, 'Spending (main ccy)', hdrDark(C.NAVY2))
      row++
      for (const value of rows) {
        str(ws, 1, row, value, dataCell())
        fml(ws, 2, row,
          sumproduct([{ col: cols[0], value }]),
          sumproductValue([{ key: dims[0].key, value }]),
          formulaCell())
        row++
      }

      const note = truncationNote(values.length, distinct)
      if (note) { str(ws, 1, row, note, formulaCell()); row++ }
    } else {
      // ── 2D cross-tab ──────────────────────────────────────────────────────
      const primary   = rankedDimensionValues(transactions, dims[0].key, cm.customFields, MAX_PIVOT_ROWS)
      const secondary = rankedDimensionValues(transactions, dims[1].key, cm.customFields, MAX_PIVOT_COLS)
      const rowVals = primary.hasBlank   ? [...primary.values, NONE_LABEL]   : primary.values
      const colVals = secondary.hasBlank ? [...secondary.values, NONE_LABEL] : secondary.values
      if (rowVals.length === 0 || colVals.length === 0) continue

      // Header row: the card title in the corner, secondary values across.
      str(ws, 1, row, title, hdrDark(C.PURPLE))
      colVals.forEach((value, i) => str(ws, 2 + i, row, value, hdrDark(C.PURPLE)))
      widestCol = Math.max(widestCol, 1 + colVals.length)
      row++

      for (const rowVal of rowVals) {
        str(ws, 1, row, rowVal, dataCell())
        colVals.forEach((colVal, i) => {
          fml(
            ws, 2 + i, row,
            sumproduct([{ col: cols[0], value: rowVal }, { col: cols[1], value: colVal }]),
            sumproductValue([
              { key: dims[0].key, value: rowVal },
              { key: dims[1].key, value: colVal },
            ]),
            formulaCell(),
          )
        })
        row++
      }

      // Both axes can be capped independently, so both are disclosed.
      const rowNote = truncationNote(primary.values.length, primary.distinct)
      if (rowNote) { str(ws, 1, row, rowNote, formulaCell()); row++ }
      const colNote = truncationNote(secondary.values.length, secondary.distinct)
      if (colNote) { str(ws, 1, row, `${dims[1].label}: ${colNote}`, formulaCell()); row++ }
    }

    row++ // blank separator between cards
  }

  setRef(ws, widestCol, Math.max(row - 1, 4))
  ;(ws as Record<string, unknown>)['!cols'] = [
    { wch: 28 },
    ...Array.from({ length: Math.max(1, widestCol - 1) }, () => ({ wch: 22 })),
  ]
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
  // Sorted ONCE here: the Expenses sheet writes rows in this order and the
  // Balance sheet's VLOOKUPs key on that row index, so both must see the same
  // ordering or the cached values land against the wrong rows.
  const sorted = [...transactions].sort(
    (a, b) => parseFsDate(a.date).getTime() - parseFsDate(b.date).getTime(),
  )

  XLSXStyle.utils.book_append_sheet(wb, buildParamsSheet(space, mainCurrency, N)         as WB_WS, SHEET_PARAMS)
  XLSXStyle.utils.book_append_sheet(wb, buildExpensesSheet(space, sorted, N, cm)         as WB_WS, SHEET_EXPENSES)
  XLSXStyle.utils.book_append_sheet(wb, buildBalanceSheet(space, N, cm, sorted)          as WB_WS, SHEET_BALANCE)
  XLSXStyle.utils.book_append_sheet(wb, buildBalanceSummarySheet(space, N, sorted)       as WB_WS, SHEET_BALANCE_SUMMARY)

  // Omitted entirely when no dashboard card survives — an empty Analysis tab is
  // worse than no tab, and the old one emitted #REF! in exactly this case.
  const analysis = buildAnalysisSheet(space, N, cm, config, transactions)
  if (analysis) XLSXStyle.utils.book_append_sheet(wb, analysis as WB_WS, SHEET_ANALYSIS)

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

  // Every formula cell carries a placeholder cached value of 0 (see fml()).
  // fullCalcOnLoad tells Excel and LibreOffice to recompute the whole workbook
  // on open, so the user never sees those placeholders — and the sheet stays
  // live when they edit the data, which is the point of the Analysis tab.
  // CalcPr is written by SheetJS but missing from its bundled WBProps type,
  // hence the narrow cast rather than a loosened workbook type.
  wb.Workbook ??= {}
  ;(wb.Workbook as { CalcPr?: { fullCalcOnLoad?: boolean } }).CalcPr = { fullCalcOnLoad: true }

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
