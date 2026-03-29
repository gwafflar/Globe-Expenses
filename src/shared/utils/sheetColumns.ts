// sheetColumns.ts — shared column layout for GlobeExpenses Standard Sheet.
//
// The Expenses tab has a DYNAMIC column layout that scales with the number of
// travel members (N). Fixed cols A–L are always present; then N cost-local cols,
// N paid-local cols, 2 detail cols, N cost-main cols, and 3 check cols.
//
// This module is imported by BOTH sheetExport.ts and sheetImport.ts so the
// column layout is computed exactly once from N and stays consistent.

export interface ColumnMap {
  // Fixed columns (1-based col numbers, col A = 1)
  rowIndex: number      // col A  — sequential row index (1, 2, 3…)
  date: number          // col B  — date "DD/MM/YYYY"
  country: number       // col C
  city: number          // col D
  category: number      // col E
  name: number          // col F  — Transaction.name (description)
  amountLocal: number   // col G  — totalAmount
  currency: number      // col H  — ISO 4217 code
  exchangeRate: number  // col I  — exchange rate locked at transaction creation time
  costMain: number      // col J  — totalAmountMain (=G*I formula on export)
  splitLabel: number    // col K  — derived split label
  paidByLabel: number   // col L  — derived paid-by label

  // Dynamic columns — arrays of length N (one entry per travel member)
  costLocal: number[]           // cols 13…12+N   — beneficiaries[i].amount
  paidLocal: number[]           // cols 13+N…12+2N — paidBy[i].amount

  // More fixed cols (position depends on N)
  paymentMethod: number         // col 13+2N
  notes: number                 // col 14+2N

  // Dynamic — cost in main ccy per member (formula on export)
  costMainPerMember: number[]   // cols 15+2N…14+3N

  // Check columns (formulas on export, ignored on import)
  checkCost: number             // col 15+3N
  checkPaid: number             // col 16+3N
  allGood: number               // col 17+3N

  // Hidden column: Firestore transaction ID (for round-trip re-import dedup)
  txId: number                  // col 18+3N — hidden on export, read on import

  totalCols: number             // = txId (total width of the sheet)
}

/**
 * Computes the full column layout for a given number of travel members.
 * All column numbers are 1-based (col A = 1, col B = 2, …).
 *
 * Example with N=2:
 *   costLocal  = [13, 14]   → cols M, N
 *   paidLocal  = [15, 16]   → cols O, P
 *   paymentMethod = 17      → col Q
 *   notes         = 18      → col R
 *   costMainPerMember = [19, 20] → cols S, T
 *   checkCost = 21, checkPaid = 22, allGood = 23 → cols U, V, W
 *   txId = 24               → col X (hidden)
 */
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

export function buildColumnMap(nMembers: number): ColumnMap {
  // Guard: minimum 1 member so arrays are never empty
  const n = Math.max(1, nMembers)

  const costLocal         = Array.from({ length: n }, (_, i) => 13 + i)
  const paidLocal         = Array.from({ length: n }, (_, i) => 13 + n + i)
  const paymentMethod     = 13 + 2 * n
  const notes             = 14 + 2 * n
  const costMainPerMember = Array.from({ length: n }, (_, i) => 15 + 2 * n + i)
  const checkCost         = 15 + 3 * n
  const checkPaid         = 16 + 3 * n
  const allGood           = 17 + 3 * n
  const txId              = 18 + 3 * n

  return {
    rowIndex: 1,
    date: 2,
    country: 3,
    city: 4,
    category: 5,
    name: 6,
    amountLocal: 7,
    currency: 8,
    exchangeRate: 9,
    costMain: 10,
    splitLabel: 11,
    paidByLabel: 12,
    costLocal,
    paidLocal,
    paymentMethod,
    notes,
    costMainPerMember,
    checkCost,
    checkPaid,
    allGood,
    txId,
    totalCols: txId,
  }
}
