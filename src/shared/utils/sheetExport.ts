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
import { buildColumnMap, colLetter } from '@/shared/utils/sheetColumns'
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
): unknown {
  const cm = buildColumnMap(N)
  const ws: WS = {}
  const members = space.members
  const amtLetter  = colLetter(cm.amountLocal) // col G

  // ── Row 1: section group headers ─────────────────────────────────────────
  str(ws, cm.rowIndex,           1, '#',                hdrDark(C.NAVY))
  str(ws, cm.date,               1, 'FILL IN',          hdrDark(C.NAVY))
  str(ws, cm.costLocal[0],       1, 'COST (local)',      hdrDark(C.NAVY2))
  str(ws, cm.paidLocal[0],       1, 'PAID (local)',      hdrDark(C.GREEN_DARK))
  str(ws, cm.paymentMethod,      1, 'DETAILS',          hdrDark(C.NAVY))
  str(ws, cm.costMainPerMember[0], 1, 'COST (main ccy)', hdrDark(C.PURPLE))
  str(ws, cm.checkCost,          1, 'CHECKS',           hdrDark(C.BROWN))

  // Fill the merged cells with the same header style (SheetJS merges need content)
  for (let c = cm.date + 1; c <= cm.paidByLabel; c++) sty(ws, c, 1, hdrDark(C.NAVY))
  for (let c = cm.costLocal[0] + 1; c <= cm.costLocal[N - 1]; c++) sty(ws, c, 1, hdrDark(C.NAVY2))
  for (let c = cm.paidLocal[0] + 1; c <= cm.paidLocal[N - 1]; c++) sty(ws, c, 1, hdrDark(C.GREEN_DARK))
  sty(ws, cm.notes, 1, hdrDark(C.NAVY))
  for (let c = cm.costMainPerMember[0] + 1; c <= cm.costMainPerMember[N - 1]; c++) sty(ws, c, 1, hdrDark(C.PURPLE))
  sty(ws, cm.checkPaid, 1, hdrDark(C.BROWN))
  sty(ws, cm.allGood,   1, hdrDark(C.BROWN))

  // ── Row 2: column headers ─────────────────────────────────────────────────
  str(ws, cm.rowIndex,     2, '#',                    hdrDark(C.NAVY))
  str(ws, cm.date,         2, 'Date',                 hdrDark(C.NAVY))
  str(ws, cm.country,      2, 'Country',              hdrDark(C.NAVY))
  str(ws, cm.city,         2, 'City',                 hdrDark(C.NAVY))
  str(ws, cm.category,     2, 'Category',             hdrDark(C.NAVY))
  str(ws, cm.name,         2, 'Description',          hdrDark(C.NAVY))
  str(ws, cm.amountLocal,  2, 'Amount (local)',        hdrDark(C.NAVY))
  str(ws, cm.currency,     2, 'Currency',             hdrDark(C.NAVY))
  str(ws, cm.exchangeRate, 2, 'Exch. rate',           hdrDark(C.NAVY))
  str(ws, cm.costMain,     2, `Cost (${space.currencies[0] ?? 'main'})`, hdrDark(C.NAVY2))
  str(ws, cm.splitLabel,   2, 'Split',                hdrDark(C.NAVY))
  str(ws, cm.paidByLabel,  2, 'Paid by',              hdrDark(C.NAVY))
  str(ws, cm.paymentMethod, 2, 'Payment method',      hdrDark(C.NAVY))
  str(ws, cm.notes,        2, 'Notes',                hdrDark(C.NAVY))
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

  // Merge definitions (0-indexed r, c)
  const merges = [
    { s: { r: 0, c: cm.date - 1      }, e: { r: 0, c: cm.paidByLabel - 1 } },
    { s: { r: 0, c: cm.costLocal[0] - 1  }, e: { r: 0, c: cm.costLocal[N - 1] - 1 } },
    { s: { r: 0, c: cm.paidLocal[0] - 1  }, e: { r: 0, c: cm.paidLocal[N - 1] - 1 } },
    { s: { r: 0, c: cm.paymentMethod - 1 }, e: { r: 0, c: cm.notes - 1 } },
    { s: { r: 0, c: cm.costMainPerMember[0] - 1 }, e: { r: 0, c: cm.costMainPerMember[N - 1] - 1 } },
    { s: { r: 0, c: cm.checkCost - 1 }, e: { r: 0, c: cm.allGood - 1 } },
  ]

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
    if (tx.country) str(ws, cm.country,  r, tx.country,       dataCell())
    else            sty(ws, cm.country,  r,                   dataCell())
    if (tx.city)    str(ws, cm.city,     r, tx.city,          dataCell())
    else            sty(ws, cm.city,     r,                   dataCell())
    if (tx.category) str(ws, cm.category, r, tx.category,     dataCell())
    else             sty(ws, cm.category, r,                  dataCell())
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
    if (tx.paymentMethod) str(ws, cm.paymentMethod, r, tx.paymentMethod, dataCell())
    else                  sty(ws, cm.paymentMethod, r,                   dataCell())
    if (tx.notes) str(ws, cm.notes, r, tx.notes, dataCell())
    else          sty(ws, cm.notes, r,            dataCell())

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

  // Column widths (match template)
  const colWidths: number[] = [
    5,   // A  #
    12,  // B  Date
    20,  // C  Country
    16,  // D  City
    18,  // E  Category
    30,  // F  Description
    14,  // G  Amount
    10,  // H  Currency
    12,  // I  Exch. rate
    14,  // J  Cost main total
    14,  // K  Split label
    16,  // L  Paid by label
  ]
  // N cost-local, N paid-local, paymentMethod, notes, N cost-main, 3 checks
  for (let i = 0; i < N; i++)  colWidths.push(14)
  for (let i = 0; i < N; i++)  colWidths.push(14)
  colWidths.push(18, 25)       // payment method, notes
  for (let i = 0; i < N; i++)  colWidths.push(14)
  colWidths.push(10, 10, 9)    // checks
  colWidths.push(0)            // txId — hidden column (width 0)

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
  _ratesDataStart: number,
  _ratesDataEnd: number,
): unknown {
  const cm = buildColumnMap(N)
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
function buildAnalysisSheet(space: Space, N: number): unknown {
  const cm = buildColumnMap(N)
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
  const countryLetter  = colLetter(cm.country)
  const categoryLetter = colLetter(cm.category)

  function sumproductFml(filterCol: string, filterVal: string): string {
    const fRange = `'${SHEET_EXPENSES}'!${filterCol}$3:${filterCol}$${EXPENSES_LAST_ROW}`
    return `SUMPRODUCT((${fRange}="${filterVal}")*N(CHOOSE(MATCH($B$1,${memberNamesRange},0),${memberCostRanges})))`
  }

  let row = 3

  // Countries block
  str(ws, 1, row, 'Country',              hdrDark(C.NAVY2))
  str(ws, 2, row, 'Spending (main ccy)',  hdrDark(C.NAVY2))
  row++
  space.countries.forEach((c) => {
    const display = (c.emoji ? c.emoji + ' ' : '') + c.label
    str(ws, 1, row, display,                dataCell())
    fml(ws, 2, row, sumproductFml(countryLetter, display), formulaCell())
    row++
  })

  row++ // blank separator

  // Categories block
  str(ws, 1, row, 'Category',             hdrDark(C.PURPLE))
  str(ws, 2, row, 'Spending (main ccy)',  hdrDark(C.PURPLE))
  row++
  space.categories.forEach((c) => {
    const display = (c.emoji ? c.emoji + ' ' : '') + c.label
    str(ws, 1, row, display,               dataCell())
    fml(ws, 2, row, sumproductFml(categoryLetter, display), formulaCell())
    row++
  })

  setRef(ws, 2, Math.max(row - 1, 4))
  ;(ws as Record<string, unknown>)['!cols'] = [{ wch: 28 }, { wch: 22 }]
  ;(ws as Record<string, unknown>)['!rows'] = [{ hpt: 20 }]
  return ws
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
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
  const allCodes = new Set([...Object.keys(EXCHANGE_RATES), ...Object.keys(space.defaultRates ?? {})])
  const numCurrencies = allCodes.size
  const ratesDataStart = N + 8
  const ratesDataEnd   = ratesDataStart + numCurrencies - 1

  // Use xlsx-js-style's book_new so the workbook carries style metadata
  const wb = XLSXStyle.utils.book_new()

  type WB_WS = XLSXTypes.WorkSheet
  XLSXStyle.utils.book_append_sheet(wb, buildParamsSheet(space, mainCurrency, N)                           as WB_WS, SHEET_PARAMS)
  XLSXStyle.utils.book_append_sheet(wb, buildExpensesSheet(space, transactions, N) as WB_WS, SHEET_EXPENSES)
  XLSXStyle.utils.book_append_sheet(wb, buildBalanceSheet(space, N, ratesDataStart, ratesDataEnd)          as WB_WS, SHEET_BALANCE)
  XLSXStyle.utils.book_append_sheet(wb, buildBalanceSummarySheet(space, N)                                 as WB_WS, SHEET_BALANCE_SUMMARY)
  XLSXStyle.utils.book_append_sheet(wb, buildAnalysisSheet(space, N)                                       as WB_WS, SHEET_ANALYSIS)

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
  const safeName = space.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Space'
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
