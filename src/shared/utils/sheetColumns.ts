// sheetColumns.ts — shared column layout for GlobeExpenses Standard Sheet.
//
// The Expenses tab has a DYNAMIC column layout that scales with the number of
// travel members (N). Fixed cols A–K are always present; then N cost-local cols,
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
  costMain: number      // col I  — totalAmountMain (VLOOKUP formula on export)
  splitLabel: number    // col J  — derived split label
  paidByLabel: number   // col K  — derived paid-by label

  // Dynamic columns — arrays of length N (one entry per travel member)
  costLocal: number[]           // cols 12…11+N   — beneficiaries[i].amount
  paidLocal: number[]           // cols 12+N…11+2N — paidBy[i].amount

  // More fixed cols (position depends on N)
  paymentMethod: number         // col 12+2N
  notes: number                 // col 13+2N

  // Dynamic — cost in main ccy per member (VLOOKUP formula on export)
  costMainPerMember: number[]   // cols 14+2N…13+3N

  // Check columns (formulas on export, ignored on import)
  checkCost: number             // col 14+3N
  checkPaid: number             // col 15+3N
  allGood: number               // col 16+3N

  totalCols: number             // = allGood (total width of the sheet)
}

/**
 * Computes the full column layout for a given number of travel members.
 * All column numbers are 1-based (col A = 1, col B = 2, …).
 *
 * Example with N=2:
 *   costLocal  = [12, 13]   → cols L, M
 *   paidLocal  = [14, 15]   → cols N, O
 *   paymentMethod = 16      → col P
 *   notes         = 17      → col Q
 *   costMainPerMember = [18, 19] → cols R, S
 *   checkCost = 20, checkPaid = 21, allGood = 22 → cols T, U, V
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

  const costLocal         = Array.from({ length: n }, (_, i) => 12 + i)
  const paidLocal         = Array.from({ length: n }, (_, i) => 12 + n + i)
  const paymentMethod     = 12 + 2 * n
  const notes             = 13 + 2 * n
  const costMainPerMember = Array.from({ length: n }, (_, i) => 14 + 2 * n + i)
  const checkCost         = 14 + 3 * n
  const checkPaid         = 15 + 3 * n
  const allGood           = 16 + 3 * n

  return {
    rowIndex: 1,
    date: 2,
    country: 3,
    city: 4,
    category: 5,
    name: 6,
    amountLocal: 7,
    currency: 8,
    costMain: 9,
    splitLabel: 10,
    paidByLabel: 11,
    costLocal,
    paidLocal,
    paymentMethod,
    notes,
    costMainPerMember,
    checkCost,
    checkPaid,
    allGood,
    totalCols: allGood,
  }
}
