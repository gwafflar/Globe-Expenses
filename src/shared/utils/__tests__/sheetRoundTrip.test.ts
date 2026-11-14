// sheetRoundTrip.test.ts — export → import losslessness (Phase 8a, part 4).
//
// THE acceptance test for this phase. Each fixture space is exported to a real
// xlsx buffer, read back through parseSheetFile(), and compared field by field
// against the transactions that went in.

import { describe, it, expect } from 'vitest'
import XLSXStyleRaw from 'xlsx-js-style'
import type * as XLSXTypes from 'xlsx'
import type { Space } from '@/spaces/types'
import type { Transaction } from '@/transactions/types'
import { getSpaceConfig } from '@/spaces/config'
import { buildSpaceWorkbook, type ExportOptions } from '../sheetExport'
import {
  parseSheetFile,
  selectImportPath,
  resolveCustomForSpace,
  type ParsedSheetRow,
  type ParseResult,
} from '../sheetImport'
import { SHEET_META } from '../sheetMeta'
import {
  CUSTOM_BOOL,
  CUSTOM_SELECT,
  CUSTOM_TEXT,
  DISABLED_CUSTOM,
  customFieldsSpace,
  disabledFieldSpace,
  legacySpace,
  soloSpace,
  travelSpace,
} from './sheetFixtures'

const XLSXStyle = XLSXStyleRaw as unknown as typeof XLSXTypes

/** Export a space to a File, exactly as the download would produce. */
function exportToFile(space: Space, transactions: Transaction[], options: ExportOptions = {}): File {
  const wb = buildSpaceWorkbook(space, transactions, options)
  const buf = XLSXStyle.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'export.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

async function roundTrip(space: Space, transactions: Transaction[], options: ExportOptions = {}) {
  return parseSheetFile(exportToFile(space, transactions, options))
}

/** Find the parsed row that came from a given transaction. */
function rowFor(result: ParseResult, txId: string): ParsedSheetRow {
  const row = result.rows.find((r) => r.txId === txId)
  if (!row) throw new Error(`no parsed row for ${txId}`)
  return row
}

const FIXTURES = [
  ['legacy', legacySpace],
  ['travel', travelSpace],
  ['custom fields', customFieldsSpace],
  ['solo', soloSpace],
] as const

// ---------------------------------------------------------------------------
// Core round-trip
// ---------------------------------------------------------------------------

describe('round-trip — every fixture space', () => {
  it.each(FIXTURES)('%s: preserves every transaction', async (_name, fixture) => {
    const { space, transactions } = fixture()
    const result = await roundTrip(space, transactions)

    expect(result.rows).toHaveLength(transactions.length)
    expect(result.meta).not.toBeNull()

    for (const tx of transactions) {
      const row = rowFor(result, tx.txId)
      expect(row.name).toBe(tx.name)
      expect(row.date).toBe(tx.date)
      expect(row.totalAmount).toBeCloseTo(tx.totalAmount, 6)
      expect(row.currency).toBe(tx.currency)
      expect(row.exchangeRate).toBeCloseTo(tx.exchangeRate, 8)
    }
  })

  it.each(FIXTURES)('%s: preserves splits per member', async (_name, fixture) => {
    const { space, transactions } = fixture()
    const result = await roundTrip(space, transactions)

    for (const tx of transactions) {
      const row = rowFor(result, tx.txId)
      space.members.forEach((m, i) => {
        const expectedCost = tx.beneficiaries.find((b) => b.travelMemberId === m.travelMemberId)?.amount
        const expectedPaid = tx.paidBy.find((p) => p.travelMemberId === m.travelMemberId)?.amount
        // The parser reports 0 amounts as undefined, so compare on that basis.
        expect(row.costPerSlot[i] ?? 0).toBeCloseTo(expectedCost ?? 0, 6)
        expect(row.paidPerSlot[i] ?? 0).toBeCloseTo(expectedPaid ?? 0, 6)
      })
    }
  })

  it.each(FIXTURES)('%s: preserves the enabled built-in fields', async (_name, fixture) => {
    const { space, transactions } = fixture()
    const config = getSpaceConfig(space)
    const result = await roundTrip(space, transactions)

    for (const tx of transactions) {
      const row = rowFor(result, tx.txId)
      // A disabled field has no column, so its value is legitimately absent.
      if (config.builtInFields.country)       expect(row.country).toBe(tx.country)
      if (config.builtInFields.city)          expect(row.city).toBe(tx.city)
      if (config.builtInFields.category)      expect(row.category).toBe(tx.category)
      if (config.builtInFields.paymentMethod) expect(row.paymentMethod).toBe(tx.paymentMethod)
      if (config.builtInFields.notes)         expect(row.notes).toBe(tx.notes)
    }
  })
})

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

describe('round-trip — dates', () => {
  // ⚠️ Regression guard. The Excel epoch (1899-12-30) predates standardised
  // time zones, so the offset to a modern local midnight is not a whole number
  // of days — in Europe/Paris the epoch sits on LMT (+00:09:21). SheetJS
  // reconstructed 10-06-2026 as 09-06-2026 23:59:39, losing a day on EVERY
  // transaction of every re-imported file.
  it('survives the export → import cycle without shifting a day', async () => {
    const { space, transactions } = travelSpace()
    const result = await roundTrip(space, transactions)

    for (const tx of transactions) {
      expect(rowFor(result, tx.txId).date).toBe(tx.date)
    }
  })

  it('holds across dates on both sides of a DST boundary', async () => {
    const { space } = soloSpace()
    // Late Dec (CET, +1) and mid-Jul (CEST, +2) — plus the DST changeover days.
    const dates = ['01-01-2026', '28-03-2026', '29-03-2026', '15-07-2026', '25-10-2026', '31-12-2026']
    const txs = dates.map((date, i) => ({
      ...soloSpace().transactions[0],
      txId: `dt${i}`,
      date,
      name: `Item ${i}`,
    }))

    const result = await roundTrip(space, txs)
    for (const tx of txs) {
      expect(rowFor(result, tx.txId).date).toBe(tx.date)
    }
  })
})

// ---------------------------------------------------------------------------
// Custom fields — the case option ids exist for
// ---------------------------------------------------------------------------

describe('round-trip — custom field values', () => {
  it('restores select values as OPTION IDS, not labels', async () => {
    const { space, transactions } = customFieldsSpace()
    const result = await roundTrip(space, transactions)

    // The cell holds "Northern leg"; what comes back must be the id.
    expect(rowFor(result, 'cf1').custom?.[CUSTOM_SELECT.id]).toBe('opt-north')
    expect(rowFor(result, 'cf2').custom?.[CUSTOM_SELECT.id]).toBe('opt-south')
  })

  it('restores text values verbatim', async () => {
    const { space, transactions } = customFieldsSpace()
    const result = await roundTrip(space, transactions)
    expect(rowFor(result, 'cf1').custom?.[CUSTOM_TEXT.id]).toBe('R-0042')
    expect(rowFor(result, 'cf2').custom?.[CUSTOM_TEXT.id]).toBe('R-0043')
  })

  it('restores booleans, omitting false exactly as the app stores it', async () => {
    const { space, transactions } = customFieldsSpace()
    const result = await roundTrip(space, transactions)

    expect(rowFor(result, 'cf1').custom?.[CUSTOM_BOOL.id]).toBe(true)
    // cf2 had no key at all; the cell reads "no" and must come back as absent,
    // not as `false` — otherwise imported docs differ from app-created ones.
    expect(rowFor(result, 'cf2').custom).not.toHaveProperty(CUSTOM_BOOL.id)
  })

  it('produces a custom map deep-equal to the original', async () => {
    const { space, transactions } = customFieldsSpace()
    const result = await roundTrip(space, transactions)
    const targetFields = getSpaceConfig(space).customFields

    for (const tx of transactions) {
      const row = rowFor(result, tx.txId)
      expect(resolveCustomForSpace(row.custom, targetFields)).toEqual(tx.custom)
    }
  })
})

// ---------------------------------------------------------------------------
// Disabled fields exported "anyway"
// ---------------------------------------------------------------------------

describe('round-trip — disabled fields included anyway', () => {
  const included = ['city', DISABLED_CUSTOM.id]

  it('restores the values', async () => {
    const { space, transactions } = disabledFieldSpace()
    const result = await roundTrip(space, transactions, { includedDisabledFields: included })

    expect(rowFor(result, 'd1').city).toBe('Rome')
    expect(rowFor(result, 'd1').custom?.[DISABLED_CUSTOM.id]).toBe('opt-a')
    expect(rowFor(result, 'd2').custom?.[DISABLED_CUSTOM.id]).toBe('opt-b')
  })

  it('restores the disabled STATE from the metadata sheet', async () => {
    const { space, transactions } = disabledFieldSpace()
    const result = await roundTrip(space, transactions, { includedDisabledFields: included })

    expect(result.meta?.config.builtInFields.city).toBe(false)
    expect(result.meta?.config.customFields.find((f) => f.id === DISABLED_CUSTOM.id)?.enabled).toBe(false)
    expect(result.meta?.includedDisabledFields).toEqual(included)
  })

  it('drops the values when the user exported without them', async () => {
    const { space, transactions } = disabledFieldSpace()
    const result = await roundTrip(space, transactions)

    expect(rowFor(result, 'd1').city).toBeUndefined()
    expect(rowFor(result, 'd1').custom).not.toHaveProperty(DISABLED_CUSTOM.id)
  })
})

// ---------------------------------------------------------------------------
// Path selection
// ---------------------------------------------------------------------------

describe('selectImportPath', () => {
  it('takes the lossless path back into the same space', async () => {
    const { space, transactions } = travelSpace()
    const result = await roundTrip(space, transactions)
    const path = selectImportPath(result, space)

    expect(path.kind).toBe('lossless')
    if (path.kind !== 'lossless') return
    // Slots resolve to the original member ids without any name matching.
    expect(Object.values(path.slotToTravelMemberId)).toEqual(
      expect.arrayContaining(['m1', 'm2', 'm3']),
    )
  })

  it('still takes the lossless path after the space is renamed', async () => {
    const { space, transactions } = travelSpace()
    const result = await roundTrip(space, transactions)
    // Ids are what identify the space, not its name.
    expect(selectImportPath(result, { ...space, name: 'Renamed' }).kind).toBe('lossless')
  })

  it('falls back to foreignSpace when the member ids are unknown', async () => {
    const { space, transactions } = travelSpace()
    const result = await roundTrip(space, transactions)

    const other = { ...space, members: space.members.map((m, i) => ({ ...m, travelMemberId: `other-${i}` })) }
    expect(selectImportPath(result, other).kind).toBe('foreignSpace')
  })

  // A partial id match is treated as foreign: importing half the splits by id
  // and silently leaving the rest unassigned is worse than asking.
  it('falls back to foreignSpace when only some member ids match', async () => {
    const { space, transactions } = travelSpace()
    const result = await roundTrip(space, transactions)

    const partial = { ...space, members: [space.members[0], { ...space.members[1], travelMemberId: 'gone' }] }
    expect(selectImportPath(result, partial).kind).toBe('foreignSpace')
  })

  it('falls back to foreignFile when the metadata sheet is gone', async () => {
    const { space, transactions } = travelSpace()
    const wb = buildSpaceWorkbook(space, transactions)

    // Delete the metadata sheet, as a user editing the file might.
    wb.SheetNames = wb.SheetNames.filter((n) => n !== SHEET_META)
    delete wb.Sheets[SHEET_META]

    const buf = XLSXStyle.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const result = await parseSheetFile(new File([buf], 'foreign.xlsx'))

    expect(result.meta).toBeNull()
    expect(selectImportPath(result, space).kind).toBe('foreignFile')
    // The visible sheets still parse — a missing metadata sheet degrades the
    // experience, it does not break the import.
    expect(result.rows).toHaveLength(transactions.length)
  })
})

// ---------------------------------------------------------------------------
// resolveCustomForSpace
// ---------------------------------------------------------------------------

describe('resolveCustomForSpace', () => {
  const fields = [CUSTOM_SELECT, CUSTOM_BOOL, CUSTOM_TEXT]

  it('keeps values whose field and option still exist', () => {
    expect(resolveCustomForSpace({ [CUSTOM_SELECT.id]: 'opt-north' }, fields))
      .toEqual({ [CUSTOM_SELECT.id]: 'opt-north' })
  })

  it('drops a value whose field does not exist in the target space', () => {
    expect(resolveCustomForSpace({ 'cf-unknown': 'x' }, fields)).toBeUndefined()
  })

  it('drops a select value whose option was deleted', () => {
    expect(resolveCustomForSpace({ [CUSTOM_SELECT.id]: 'opt-gone' }, fields)).toBeUndefined()
  })

  it('never writes false for a boolean', () => {
    expect(resolveCustomForSpace({ [CUSTOM_BOOL.id]: false }, fields)).toBeUndefined()
  })

  it('returns undefined rather than an empty object', () => {
    expect(resolveCustomForSpace({}, fields)).toBeUndefined()
    expect(resolveCustomForSpace(undefined, fields)).toBeUndefined()
  })
})
