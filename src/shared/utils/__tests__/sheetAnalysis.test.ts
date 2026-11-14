// sheetAnalysis.test.ts — the generated Analysis sheet (Phase 8a, part 3).

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import type { SpaceConfig } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import { columnMapForConfig, colLetter } from '../sheetColumns'
import { useLanguageStore } from '@/i18n'
import {
  buildSpaceWorkbook,
  SHEET_ANALYSIS,
  SHEET_BALANCE_SUMMARY,
  SHEET_EXPENSES,
} from '../sheetExport'
import {
  CUSTOM_SELECT,
  customFieldsSpace,
  legacySpace,
  makeTx,
  soloSpace,
  travelSpace,
} from './sheetFixtures'

function writeRead(wb: XLSX.WorkBook): XLSX.WorkBook {
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { cellDates: true })
}

function analysisOf(space: Parameters<typeof buildSpaceWorkbook>[0], txs: Parameters<typeof buildSpaceWorkbook>[1]) {
  return writeRead(buildSpaceWorkbook(space, txs)).Sheets[SHEET_ANALYSIS]
}

/** Every formula in the sheet, as strings. */
function formulas(ws: XLSX.WorkSheet | undefined): string[] {
  if (!ws) return []
  return Object.entries(ws as Record<string, { f?: string }>)
    .filter(([k]) => !k.startsWith('!'))
    .map(([, cell]) => cell.f)
    .filter((f): f is string => typeof f === 'string')
}

/** The cached values of every formula cell in a sheet. */
function valuesOfFormulaCells(ws: XLSX.WorkSheet | undefined): unknown[] {
  if (!ws) return []
  return Object.entries(ws as Record<string, { f?: string; v?: unknown }>)
    .filter(([k, cell]) => !k.startsWith('!') && typeof cell.f === 'string')
    .map(([, cell]) => cell.v)
}

function cellValue(ws: XLSX.WorkSheet, address: string): unknown {
  return (ws as Record<string, { v?: unknown } | undefined>)[address]?.v
}

/** The row number whose column A holds `label`. */
function rowOfLabel(ws: XLSX.WorkSheet, label: string): number {
  for (let r = 1; r <= 200; r++) {
    if (cellValue(ws, `A${r}`) === label) return r
  }
  throw new Error(`label ${label} not found in column A`)
}

/** Every text cell in column A, top to bottom. */
function columnA(ws: XLSX.WorkSheet | undefined, maxRow = 60): string[] {
  if (!ws) return []
  const out: string[] = []
  for (let r = 1; r <= maxRow; r++) {
    const v = (ws as Record<string, { v?: unknown } | undefined>)[`A${r}`]?.v
    if (v !== undefined && v !== '') out.push(String(v))
  }
  return out
}

describe('Analysis sheet — generated from dashboard cards', () => {
  it('emits a block per card for a legacy space (default category + country cards)', () => {
    const { space, transactions } = legacySpace()
    const ws = analysisOf(space, transactions)
    const labels = columnA(ws)

    expect(labels).toContain('By category')
    expect(labels).toContain('By country')
    // Values come from the transactions, ranked by spend.
    expect(labels).toContain('🍽️ Food')
    expect(labels).toContain('Japan')
  })

  it('references country BARE and category WITH its emoji, matching how each is stored', () => {
    const { space, transactions } = legacySpace()
    const cm = columnMapForConfig(space.members.length, getSpaceConfig(space))
    const fs = formulas(analysisOf(space, transactions))

    const countryLetter = colLetter(cm.country!)
    const categoryLetter = colLetter(cm.category!)

    // The F7 regression: the old sheet filtered on "🇯🇵 Japan" while the column
    // holds "Japan", so every country summed silently to zero.
    expect(fs.some((f) => f.includes(`${countryLetter}$3`) && f.includes('="Japan"'))).toBe(true)
    expect(fs.some((f) => f.includes('="🇯🇵 Japan"'))).toBe(false)
    expect(fs.some((f) => f.includes(`${categoryLetter}$3`) && f.includes('="🍽️ Food"'))).toBe(true)
  })

  it('keeps the formulas live rather than pasting computed values', () => {
    const { space, transactions } = travelSpace()
    const fs = formulas(analysisOf(space, transactions))
    expect(fs.length).toBeGreaterThan(0)
    expect(fs.every((f) => f.startsWith('SUMPRODUCT('))).toBe(true)
  })

  it('stays English when the UI is in French (Spec decision #102)', () => {
    const { space, transactions } = legacySpace()
    useLanguageStore.getState().setPreference('fr')
    try {
      const labels = columnA(analysisOf(space, transactions))
      expect(labels).toContain('By category')
      expect(labels).toContain('By country')
      expect(labels.some((l) => /catégorie|Par /.test(l))).toBe(false)
    } finally {
      useLanguageStore.getState().setPreference('auto') // other tests expect English
    }
  })

  it('emits no #REF! anywhere', () => {
    for (const fixture of [legacySpace, travelSpace, soloSpace, customFieldsSpace]) {
      const { space, transactions } = fixture()
      const fs = formulas(analysisOf(space, transactions))
      expect(fs.some((f) => f.includes('#REF'))).toBe(false)
    }
  })
})

describe('formula serialisation', () => {
  // ⚠️ Regression guard. SheetJS 0.18.5 SKIPS any cell whose `v` is undefined,
  // formula included — so a formula cell written without a cached value never
  // reaches the file at all. Every formula in the workbook depended on this.
  it('preserves formulas through a real write/read cycle', () => {
    const { space, transactions } = travelSpace()
    const wb = writeRead(buildSpaceWorkbook(space, transactions))

    for (const sheetName of [SHEET_ANALYSIS, SHEET_EXPENSES]) {
      expect(formulas(wb.Sheets[sheetName]).length).toBeGreaterThan(0)
    }
  })

  it('asks Excel to recalculate on load', () => {
    const { space, transactions } = travelSpace()
    const wb = buildSpaceWorkbook(space, transactions)
    expect((wb.Workbook as { CalcPr?: { fullCalcOnLoad?: boolean } }).CalcPr?.fullCalcOnLoad).toBe(true)
  })

  // fullCalcOnLoad is honoured by Excel and LibreOffice, but a viewer that
  // only renders cached values (Google Sheets, quick-look tools) must still
  // show the RIGHT numbers — not a grid of zeros.
  it('caches the correct value in every formula cell, not a placeholder', () => {
    const { space, transactions } = travelSpace()
    const wb = writeRead(buildSpaceWorkbook(space, transactions))

    const analysisValues = valuesOfFormulaCells(wb.Sheets[SHEET_ANALYSIS])
    expect(analysisValues.length).toBeGreaterThan(0)
    expect(analysisValues.some((v) => typeof v === 'number' && v !== 0)).toBe(true)
  })

  it('caches Analysis totals matching the first member’s actual spend', () => {
    const { space, transactions } = travelSpace()
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_ANALYSIS]

    // Alice (members[0]) is the default in B1. Her share of the two Food
    // transactions: 60/3 = 20 and 9/3 = 3, both at rate 1.
    const foodRow = rowOfLabel(ws, '🍽️ Food')
    expect(cellValue(ws, `B${foodRow}`)).toBeCloseTo(23, 5)

    // Lodging: 90 GBP split three ways at rate 1.17 → 30 * 1.17 = 35.1
    const lodgingRow = rowOfLabel(ws, '🏨 Lodging')
    expect(cellValue(ws, `B${lodgingRow}`)).toBeCloseTo(35.1, 5)
  })

  it('caches Balance Summary totals matching each member’s actual spend', () => {
    const { space, transactions } = travelSpace()
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_BALANCE_SUMMARY]

    // Alice: cost 20 + 30*1.17 + 3 = 58.1, paid 60.
    expect(cellValue(ws, 'B2')).toBeCloseTo(58.1, 5)
    expect(cellValue(ws, 'C2')).toBeCloseTo(60, 5)
    expect(cellValue(ws, 'D2')).toBeCloseTo(1.9, 5)
  })

  it('caches the check columns as their computed marks', () => {
    const { space, transactions } = travelSpace()
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]
    const cm = columnMapForConfig(space.members.length, getSpaceConfig(space))
    // Every fixture transaction splits exactly, so all three checks pass.
    expect(cellValue(ws, `${colLetter(cm.checkCost)}3`)).toBe('✔️')
    expect(cellValue(ws, `${colLetter(cm.checkPaid)}3`)).toBe('✔️')
    expect(cellValue(ws, `${colLetter(cm.allGood)}3`)).toBe('✅')
  })
})

describe('Analysis sheet — truncation disclosure', () => {
  it('discloses how many values were left out when a block is capped', () => {
    const { space } = soloSpace()
    // 70 distinct categories, more than the 60-row cap.
    const many = Array.from({ length: 70 }, (_, i) =>
      makeTx({
        txId: `t${i}`,
        name: `Item ${i}`,
        totalAmount: 100 - i,
        totalAmountMain: 100 - i,
        category: `Cat ${i}`,
        paidBy: [{ travelMemberId: 'm1', amount: 100 - i }],
        beneficiaries: [{ travelMemberId: 'm1', amount: 100 - i }],
      }),
    )

    const labels = columnA(writeRead(buildSpaceWorkbook(space, many)).Sheets[SHEET_ANALYSIS], 200)
    expect(labels).toContain('Top 60 of 70 by spend — 10 more not shown')
    // Ranked by spend, so the largest survive and the smallest are cut.
    expect(labels).toContain('Cat 0')
    expect(labels).not.toContain('Cat 69')
  })

  it('adds no note when nothing was truncated', () => {
    const { space, transactions } = soloSpace()
    const labels = columnA(writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_ANALYSIS])
    expect(labels.some((l) => l.includes('not shown'))).toBe(false)
  })
})

describe('Analysis sheet — disabled dimensions', () => {
  // The solo acceptance criterion: no country column, and no country block.
  it('skips a card whose dimension has no exported column', () => {
    const { space, transactions } = soloSpace()
    // Add a country card to a space where country is disabled.
    space.config = {
      ...space.config!,
      dashboardCards: [
        { id: 'card-cat', dimensions: ['category'] },
        { id: 'card-country', dimensions: ['country'] },
      ],
    }

    const ws = analysisOf(space, transactions)
    const labels = columnA(ws)
    expect(labels).toContain('By category')
    expect(labels).not.toContain('By country')
    expect(formulas(ws).some((f) => f.includes('#REF'))).toBe(false)
  })

  // The regression the prompt calls out as most likely to slip through.
  it('references the right column when a preceding field is disabled and letters shift', () => {
    const { space, transactions } = travelSpace()

    // Disable country: category moves from column E to column D.
    const withCountry = columnMapForConfig(3, getSpaceConfig(space))
    space.config = {
      ...space.config!,
      builtInFields: { ...space.config!.builtInFields, country: false },
      dashboardCards: [{ id: 'card-cat', dimensions: ['category'] }],
    }
    const withoutCountry = columnMapForConfig(3, getSpaceConfig(space))

    expect(withCountry.category).toBe(5)
    expect(withoutCountry.category).toBe(4)

    const fs = formulas(analysisOf(space, transactions))
    const expected = colLetter(withoutCountry.category!)
    expect(fs.some((f) => f.includes(`${expected}$3:${expected}$`))).toBe(true)
    // Must NOT still be pointing at the old letter.
    const stale = colLetter(withCountry.category!)
    expect(fs.some((f) => f.includes(`${stale}$3:${stale}$`))).toBe(false)
  })

  it('omits the sheet entirely when no card survives', () => {
    const { space, transactions } = soloSpace()
    space.config = { ...space.config!, dashboardCards: [] } satisfies SpaceConfig

    const wb = writeRead(buildSpaceWorkbook(space, transactions))
    expect(wb.SheetNames).not.toContain(SHEET_ANALYSIS)
    // The rest of the workbook is unaffected.
    expect(wb.SheetNames).toContain(SHEET_EXPENSES)
  })
})

describe('Analysis sheet — custom field dimensions', () => {
  it('filters a custom select on its option LABEL, matching the exported column', () => {
    const { space, transactions } = customFieldsSpace()
    const cm = columnMapForConfig(2, getSpaceConfig(space))
    const ws = analysisOf(space, transactions)

    expect(columnA(ws)).toContain('By trip leg')
    // The column holds labels (option ids live in the metadata sheet), so the
    // formula must filter on the label too.
    const letter = colLetter(cm.custom[CUSTOM_SELECT.id])
    const fs = formulas(ws)
    expect(fs.some((f) => f.includes(`${letter}$3`) && f.includes('="Northern leg"'))).toBe(true)
    expect(fs.some((f) => f.includes('="opt-north"'))).toBe(false)
  })

  it('emits a 2D pivot as a cross-tab with two filter terms per cell', () => {
    const { space, transactions } = customFieldsSpace()
    const cm = columnMapForConfig(2, getSpaceConfig(space))
    const ws = analysisOf(space, transactions)

    expect(columnA(ws)).toContain('Category × trip leg')

    const catLetter = colLetter(cm.category!)
    const legLetter = colLetter(cm.custom[CUSTOM_SELECT.id])
    const pivotCells = formulas(ws).filter(
      (f) => f.includes(`${catLetter}$3`) && f.includes(`${legLetter}$3`),
    )
    expect(pivotCells.length).toBeGreaterThan(0)
    // Both dimensions ANDed by multiplication, then scoped to the B1 member.
    expect(pivotCells[0]).toMatch(/^SUMPRODUCT\(\(.+\)\*\(.+\)\*N\(CHOOSE\(/)
  })
})

describe('Analysis sheet — missing values', () => {
  it('adds a (none) row filtering on empty when some transactions lack a value', () => {
    const { space, transactions } = customFieldsSpace()
    // cf2 has no city; make the card set include city so a blank appears.
    space.config = {
      ...space.config!,
      dashboardCards: [{ id: 'card-city', dimensions: ['city'] }],
    }
    const ws = analysisOf(space, transactions)

    expect(columnA(ws)).toContain('(none)')
    expect(formulas(ws).some((f) => f.includes('=""'))).toBe(true)
  })

  it('adds no (none) row when every transaction has a value', () => {
    const { space, transactions } = soloSpace()
    const ws = analysisOf(space, transactions)
    expect(columnA(ws)).not.toContain('(none)')
  })
})
