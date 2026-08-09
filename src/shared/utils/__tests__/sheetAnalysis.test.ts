// sheetAnalysis.test.ts — the generated Analysis sheet (Phase 8a, part 3).

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import type { SpaceConfig } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import { columnMapForConfig, colLetter } from '../sheetColumns'
import { buildSpaceWorkbook, SHEET_ANALYSIS, SHEET_EXPENSES } from '../sheetExport'
import {
  CUSTOM_SELECT,
  customFieldsSpace,
  legacySpace,
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

  it('asks Excel to recalculate on load, so the placeholder values are never shown', () => {
    const { space, transactions } = travelSpace()
    const wb = buildSpaceWorkbook(space, transactions)
    expect((wb.Workbook as { CalcPr?: { fullCalcOnLoad?: boolean } }).CalcPr?.fullCalcOnLoad).toBe(true)
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
