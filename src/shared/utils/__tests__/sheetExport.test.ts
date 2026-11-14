// sheetExport.test.ts — config-driven export columns (Phase 8a, part 2).

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { getSpaceConfig } from '@/spaces/config'
import { columnMapForConfig, colLetter } from '../sheetColumns'
import {
  buildSpaceWorkbook,
  exportFileName,
  findOrphanedFields,
  SHEET_EXPENSES,
} from '../sheetExport'
import {
  CUSTOM_BOOL,
  CUSTOM_SELECT,
  CUSTOM_TEXT,
  customFieldsSpace,
  disabledFieldSpace,
  legacySpace,
  makeSpace,
  soloSpace,
  travelSpace,
} from './sheetFixtures'

/** Serialise and re-read, so assertions are about the FILE, not the in-memory
 *  object — cell values can be normalised by the xlsx encoder. */
function writeRead(wb: XLSX.WorkBook): XLSX.WorkBook {
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { cellDates: true })
}

function cell(ws: XLSX.WorkSheet, col: number, row: number): unknown {
  return (ws as Record<string, { v?: unknown } | undefined>)[`${colLetter(col)}${row}`]?.v
}

/** Every row-2 header in the Expenses sheet, as written. */
function headers(ws: XLSX.WorkSheet, totalCols: number): string[] {
  return Array.from({ length: totalCols }, (_, i) => String(cell(ws, i + 1, 2) ?? ''))
}

describe('Expenses sheet — headers', () => {
  it('emits every built-in header for a legacy space', () => {
    const { space, transactions } = legacySpace()
    const cm = columnMapForConfig(space.members.length, getSpaceConfig(space))
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]

    expect(headers(ws, cm.totalCols)).toEqual(
      expect.arrayContaining(['Country', 'City', 'Category', 'Payment method', 'Notes']),
    )
  })

  // The solo-space acceptance criterion: no country column anywhere.
  it('emits no country or city header for a solo space', () => {
    const { space, transactions } = soloSpace()
    const cm = columnMapForConfig(space.members.length, getSpaceConfig(space))
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]
    const hdrs = headers(ws, cm.totalCols)

    expect(hdrs).not.toContain('Country')
    expect(hdrs).not.toContain('City')
    expect(hdrs).toContain('Category')
  })

  it('labels custom field columns with their label and emoji', () => {
    const { space, transactions } = customFieldsSpace()
    const cm = columnMapForConfig(space.members.length, getSpaceConfig(space))
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]

    expect(cell(ws, cm.custom[CUSTOM_SELECT.id], 2)).toBe('🧭 Trip leg')
    expect(cell(ws, cm.custom[CUSTOM_BOOL.id], 2)).toBe('Reimbursable')
    expect(cell(ws, cm.custom[CUSTOM_TEXT.id], 2)).toBe('Receipt ref')
  })
})

describe('Expenses sheet — custom field values', () => {
  it('writes select values as option labels, booleans as yes/no, text raw', () => {
    const { space, transactions } = customFieldsSpace()
    const cm = columnMapForConfig(space.members.length, getSpaceConfig(space))
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]

    // Data rows start at 3, sorted by date; both fixtures share a date so the
    // txId column disambiguates which row is which.
    const rowOf = (txId: string) => {
      for (let r = 3; r < 20; r++) if (cell(ws, cm.txId, r) === txId) return r
      throw new Error(`row for ${txId} not found`)
    }

    const r1 = rowOf('cf1')
    expect(cell(ws, cm.custom[CUSTOM_SELECT.id], r1)).toBe('Northern leg')
    expect(cell(ws, cm.custom[CUSTOM_BOOL.id], r1)).toBe('yes')
    expect(cell(ws, cm.custom[CUSTOM_TEXT.id], r1)).toBe('R-0042')

    const r2 = rowOf('cf2')
    expect(cell(ws, cm.custom[CUSTOM_SELECT.id], r2)).toBe('Southern leg')
    // No boolean key stored at all — must still read `no`, never blank.
    expect(cell(ws, cm.custom[CUSTOM_BOOL.id], r2)).toBe('no')
  })
})

describe('findOrphanedFields', () => {
  it('returns nothing when every field with data is enabled', () => {
    const { space, transactions } = travelSpace()
    expect(findOrphanedFields(space, transactions)).toEqual([])
  })

  it('returns nothing for a legacy space, whose fields all resolve enabled', () => {
    const { space, transactions } = legacySpace()
    expect(findOrphanedFields(space, transactions)).toEqual([])
  })

  it('counts transactions holding values on a disabled built-in and custom field', () => {
    const { space, transactions } = disabledFieldSpace()
    const found = findOrphanedFields(space, transactions)

    expect(found).toEqual([
      { key: 'city', label: 'City', count: 1, source: 'builtIn' },
      { key: 'cf-old', label: 'Old tag', count: 2, source: 'custom' },
    ])
  })

  it('does not report a disabled field whose values were never set', () => {
    const { space, transactions } = disabledFieldSpace()
    const cleaned = transactions.map((tx) => ({ ...tx, city: undefined, custom: undefined }))
    expect(findOrphanedFields(space, cleaned)).toEqual([])
  })
})

describe('export with included disabled fields', () => {
  it('emits their columns and keeps the config marking them disabled', () => {
    const { space, transactions } = disabledFieldSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space), ['city', 'cf-old'])
    const wb = writeRead(buildSpaceWorkbook(space, transactions, {
      includedDisabledFields: ['city', 'cf-old'],
    }))
    const ws = wb.Sheets[SHEET_EXPENSES]

    expect(cell(ws, cm.city!, 2)).toBe('City')
    expect(cell(ws, cm.custom['cf-old'], 2)).toBe('Old tag')

    const rowOf = (txId: string) => {
      for (let r = 3; r < 20; r++) if (cell(ws, cm.txId, r) === txId) return r
      throw new Error(`row for ${txId} not found`)
    }
    expect(cell(ws, cm.city!, rowOf('d1'))).toBe('Rome')
    expect(cell(ws, cm.custom['cf-old'], rowOf('d1'))).toBe('Alpha')
    expect(cell(ws, cm.custom['cf-old'], rowOf('d2'))).toBe('Beta')
  })

  it('omits their columns when the user exports without them', () => {
    const { space, transactions } = disabledFieldSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space))
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]

    expect(headers(ws, cm.totalCols)).not.toContain('City')
    expect(headers(ws, cm.totalCols)).not.toContain('Old tag')
  })
})

describe('no export path assumes a built-in field exists', () => {
  /** A space with every optional built-in switched off — the hardest case for
   *  code that grew up assuming country/category were always there. */
  function barestSpace() {
    const { space, transactions } = soloSpace()
    space.config = {
      ...space.config!,
      builtInFields: {
        country: false, city: false, category: false, paymentMethod: false, notes: false,
      },
      features: { wallets: false, multiCurrency: false },
      dashboardCards: [],
    }
    return { space, transactions }
  }

  it('exports without throwing and without those columns', () => {
    const { space, transactions } = barestSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space))
    const wb = writeRead(buildSpaceWorkbook(space, transactions))
    const ws = wb.Sheets[SHEET_EXPENSES]

    const hdrs = headers(ws, cm.totalCols)
    for (const gone of ['Country', 'City', 'Category', 'Payment method', 'Notes']) {
      expect(hdrs).not.toContain(gone)
    }
    // The core columns are all still there.
    expect(hdrs).toEqual(expect.arrayContaining(['Date', 'Description', 'Amount (local)', 'Currency']))
  })

  it('produces no #REF! in any sheet', () => {
    const { space, transactions } = barestSpace()
    const wb = writeRead(buildSpaceWorkbook(space, transactions))

    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name] as Record<string, { f?: string; v?: unknown }>
      for (const [key, cell] of Object.entries(ws)) {
        if (key.startsWith('!')) continue
        expect(cell.f ?? '').not.toContain('#REF')
        expect(String(cell.v ?? '')).not.toContain('#REF')
      }
    }
  })

  it('still round-trips its transactions', async () => {
    const { space, transactions } = barestSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space))
    const ws = writeRead(buildSpaceWorkbook(space, transactions)).Sheets[SHEET_EXPENSES]

    // Amounts and descriptions survive even with every optional field gone.
    expect(cell(ws, cm.name, 3)).toBe(transactions[0].name)
    expect(cell(ws, cm.amountLocal, 3)).toBeCloseTo(transactions[0].totalAmount, 4)
  })
})

describe('exportFileName', () => {
  it('derives the filename from the space name', () => {
    const space = makeSpace({ name: 'Japan 2026' })
    expect(exportFileName(space, new Date('2026-08-09T10:00:00Z')))
      .toBe('GlobeExpenses_Japan 2026_2026-08-09.xlsx')
  })

  it('replaces characters that are illegal in a filename', () => {
    const space = makeSpace({ name: 'Trip: A/B "test"?' })
    const name = exportFileName(space, new Date('2026-08-09T10:00:00Z'))
    expect(name).toBe('GlobeExpenses_Trip- A-B -test--_2026-08-09.xlsx')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
  })

  it('falls back to a placeholder when the name is only illegal characters', () => {
    const space = makeSpace({ name: '///' })
    expect(exportFileName(space, new Date('2026-08-09T10:00:00Z')))
      .toBe('GlobeExpenses_Space_2026-08-09.xlsx')
  })
})
