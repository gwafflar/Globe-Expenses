// foreignSheet.test.ts — importing a spreadsheet that is not one of our exports
// (Phase 8b, part 5).

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { getSpaceConfig } from '@/spaces/config'
import type { ForeignColumn } from '../foreignSheet'
import {
  autoMatchColumns,
  buildForeignRows,
  collectPendingOptions,
  inferColumnType,
  matchOption,
  readForeignSheet,
  resolveNewFields,
  summariseSelectColumn,
  validateMapping,
  withCreatedListItems,
  withCreatedOptions,
  MAX_NEW_FIELDS,
  type ColumnMapping,
  type SelectDecisions,
} from '../foreignSheet'
import {
  CUSTOM_SELECT,
  customFieldsSpace,
  labeled,
  soloSpace,
  travelSpace,
} from './sheetFixtures'

/** Build a workbook from a grid, as a hand-made foreign sheet. */
function workbookOf(grid: unknown[][], name = 'Sheet1'): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), name)
  return wb
}

function column(overrides: Partial<ForeignColumn> = {}): ForeignColumn {
  return {
    index: 1,
    header: 'Col',
    nonEmptyCount: 0,
    distinctValues: [],
    distinctTruncated: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

describe('readForeignSheet', () => {
  it('reads headers from row 1 of a plain sheet', () => {
    const wb = workbookOf([
      ['Date', 'Description', 'Amount'],
      ['01/02/2026', 'Coffee', 3.5],
      ['02/02/2026', 'Lunch', 12],
    ])
    const sheet = readForeignSheet(wb)

    expect(sheet.headerRow).toBe(1)
    expect(sheet.columns.map((c) => c.header)).toEqual(['Date', 'Description', 'Amount'])
    expect(sheet.rows).toHaveLength(2)
  })

  it('finds the header row under a banner row', () => {
    // Our own export puts a merged banner on row 1 and real headers on row 2.
    const wb = workbookOf([
      ['FILL IN', null, null],
      ['Date', 'Description', 'Amount'],
      ['01/02/2026', 'Coffee', 3.5],
    ])
    const sheet = readForeignSheet(wb)
    expect(sheet.headerRow).toBe(2)
    expect(sheet.columns.map((c) => c.header)).toEqual(['Date', 'Description', 'Amount'])
  })

  it('counts non-empty rows and distinct values per column', () => {
    const wb = workbookOf([
      ['Category'],
      ['Food'],
      ['Food'],
      [''],
      ['Travel'],
    ])
    const [col] = readForeignSheet(wb).columns
    expect(col.nonEmptyCount).toBe(3)
    expect(col.distinctValues).toEqual(['Food', 'Travel'])
    expect(col.distinctTruncated).toBe(false)
  })

  it('drops trailing empty unnamed columns', () => {
    const wb = workbookOf([
      ['Date', 'Amount', null, null],
      ['01/02/2026', 5, null, null],
    ])
    expect(readForeignSheet(wb).columns.map((c) => c.header)).toEqual(['Date', 'Amount'])
  })

  it('hides sheets whose name starts with an underscore', () => {
    const wb = workbookOf([['Date']], 'Data')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), '_globeexpenses')
    expect(readForeignSheet(wb).sheetNames).toEqual(['Data'])
  })
})

// ---------------------------------------------------------------------------
// Auto-matching
// ---------------------------------------------------------------------------

describe('autoMatchColumns', () => {
  const { space } = travelSpace()
  const config = getSpaceConfig(space)

  function match(headers: string[]): ColumnMapping {
    const columns = headers.map((header, i) => column({ index: i + 1, header }))
    return autoMatchColumns(columns, space, config)
  }

  it('matches core and built-in headers case-insensitively', () => {
    const m = match(['DATE', 'description', 'Amount', 'Currency', 'Country', 'Category'])
    expect(m[1]).toEqual({ kind: 'core', field: 'date' })
    expect(m[2]).toEqual({ kind: 'core', field: 'name' })
    expect(m[3]).toEqual({ kind: 'core', field: 'totalAmount' })
    expect(m[4]).toEqual({ kind: 'core', field: 'currency' })
    expect(m[5]).toEqual({ kind: 'builtIn', field: 'country' })
    expect(m[6]).toEqual({ kind: 'builtIn', field: 'category' })
  })

  it('matches common synonyms', () => {
    const m = match(['When', 'Memo', 'Price', 'Town', 'Paid with', 'Comments'])
    expect(m[1]).toEqual({ kind: 'core', field: 'date' })
    expect(m[2]).toEqual({ kind: 'core', field: 'name' })
    expect(m[3]).toEqual({ kind: 'core', field: 'totalAmount' })
    expect(m[4]).toEqual({ kind: 'builtIn', field: 'city' })
    expect(m[5]).toEqual({ kind: 'builtIn', field: 'paymentMethod' })
    expect(m[6]).toEqual({ kind: 'builtIn', field: 'notes' })
  })

  it('ignores headers it does not recognise', () => {
    expect(match(['Sprocket count'])[1]).toEqual({ kind: 'ignore' })
  })

  // Two "Amount" columns must not both win: silently letting the last one
  // overwrite the first is exactly the kind of quiet wrongness to avoid.
  it('claims each target at most once', () => {
    const m = match(['Amount', 'Amount'])
    expect(m[1]).toEqual({ kind: 'core', field: 'totalAmount' })
    expect(m[2]).toEqual({ kind: 'ignore' })
  })

  it('matches per-member split columns from our own export headers', () => {
    const m = match(['Cost Alice (local)', 'Paid Alice (local)'])
    expect(m[1]).toEqual({ kind: 'memberCost', travelMemberId: 'm1' })
    expect(m[2]).toEqual({ kind: 'memberPaid', travelMemberId: 'm1' })
  })

  it('strips an emoji prefix before matching', () => {
    expect(match(['🏷️ Category'])[1]).toEqual({ kind: 'builtIn', field: 'category' })
  })

  it('prefers a custom field over a built-in of the same name', () => {
    const custom = customFieldsSpace()
    const cfg = {
      ...getSpaceConfig(custom.space),
      customFields: [{ id: 'cf-x', label: 'Category', type: 'select' as const, options: [], enabled: true }],
    }
    const m = autoMatchColumns([column({ header: 'Category' })], custom.space, cfg)
    expect(m[1]).toEqual({ kind: 'custom', fieldId: 'cf-x' })
  })

  it('does not match a built-in that is disabled in this space', () => {
    const solo = soloSpace()
    const m = autoMatchColumns([column({ header: 'Country' })], solo.space, getSpaceConfig(solo.space))
    expect(m[1]).toEqual({ kind: 'ignore' })
  })
})

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

describe('inferColumnType', () => {
  it('infers boolean from a yes/no column', () => {
    const result = inferColumnType(column({ nonEmptyCount: 40, distinctValues: ['yes', 'no'] }))
    expect(result.type).toBe('boolean')
  })

  it('infers boolean from true/false and 1/0', () => {
    expect(inferColumnType(column({ nonEmptyCount: 10, distinctValues: ['true', 'false'] })).type).toBe('boolean')
    expect(inferColumnType(column({ nonEmptyCount: 10, distinctValues: ['1', '0'] })).type).toBe('boolean')
  })

  it('infers select from 12 distinct values in 340 rows, with evidence', () => {
    const distinctValues = Array.from({ length: 12 }, (_, i) => `Value ${i}`)
    const result = inferColumnType(column({ nonEmptyCount: 340, distinctValues }))
    expect(result.type).toBe('select')
    expect(result.evidence).toBe('12 distinct values in 340 rows')
    expect(result.suggestedOptions).toEqual(distinctValues)
  })

  it('infers text from a mostly-unique column', () => {
    const distinctValues = Array.from({ length: 90 }, (_, i) => `Ref ${i}`)
    const result = inferColumnType(column({ nonEmptyCount: 100, distinctValues }))
    expect(result.type).toBe('text')
    expect(result.evidence).toContain('Mostly unique')
  })

  // 15 distinct in 20 rows is 75% — above the 50% ceiling, so text.
  it('rejects select when distinct values exceed half the rows', () => {
    const distinctValues = Array.from({ length: 15 }, (_, i) => `V${i}`)
    expect(inferColumnType(column({ nonEmptyCount: 20, distinctValues })).type).toBe('text')
  })

  it('rejects select above 20 distinct values even in a large sheet', () => {
    const distinctValues = Array.from({ length: 21 }, (_, i) => `V${i}`)
    expect(inferColumnType(column({ nonEmptyCount: 1000, distinctValues })).type).toBe('text')
  })

  it('handles an empty column without claiming to have inferred anything', () => {
    const result = inferColumnType(column({ nonEmptyCount: 0, distinctValues: [] }))
    expect(result.type).toBe('text')
    expect(result.evidence).toBe('No values to infer from')
  })
})

// ---------------------------------------------------------------------------
// Select column matching
// ---------------------------------------------------------------------------

describe('matchOption / summariseSelectColumn', () => {
  const options = [labeled('o1', 'Food', '🍽️'), labeled('o2', 'Transport')]

  it('matches on the bare label, case-insensitively', () => {
    expect(matchOption('food', options)?.id).toBe('o1')
  })

  it('matches on the emoji-prefixed display form', () => {
    expect(matchOption('🍽️ Food', options)?.id).toBe('o1')
  })

  it('returns undefined for an unknown value', () => {
    expect(matchOption('Gadgets', options)).toBeUndefined()
  })

  it('splits a column into matched and unmatched', () => {
    const col = column({ distinctValues: ['Food', 'Gadgets', 'Transport', 'Rent'] })
    const summary = summariseSelectColumn(col, options)
    expect(summary.matched).toEqual(['Food', 'Transport'])
    expect(summary.unmatched).toEqual(['Gadgets', 'Rent'])
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validateMapping', () => {
  it('requires an amount column', () => {
    expect(validateMapping({ 1: { kind: 'core', field: 'date' } }))
      .toContain('One column must be mapped to Amount.')
  })

  it('accepts a mapping with an amount column', () => {
    expect(validateMapping({ 1: { kind: 'core', field: 'totalAmount' } })).toEqual([])
  })

  it('rejects two columns mapped to the same field', () => {
    const errors = validateMapping({
      1: { kind: 'core', field: 'totalAmount' },
      2: { kind: 'core', field: 'totalAmount' },
    })
    expect(errors.some((e) => e.includes('same field'))).toBe(true)
  })

  it('allows many ignored columns', () => {
    expect(validateMapping({
      1: { kind: 'core', field: 'totalAmount' },
      2: { kind: 'ignore' },
      3: { kind: 'ignore' },
    })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Option creation
// ---------------------------------------------------------------------------

describe('collectPendingOptions', () => {
  const { space } = customFieldsSpace()
  const config = getSpaceConfig(space)

  function collect(grid: unknown[][], mapping: ColumnMapping, decisions: SelectDecisions) {
    const sheet = readForeignSheet(workbookOf(grid))
    return collectPendingOptions(sheet, mapping, decisions, config.customFields, {
      category: space.categories,
    })
  }

  it('collects unmatched values for a createAll custom column', () => {
    const pending = collect(
      [['Trip leg'], ['Northern leg'], ['Eastern leg'], ['Western leg']],
      { 1: { kind: 'custom', fieldId: CUSTOM_SELECT.id } },
      { 1: { kind: 'createAll', excluded: [] } },
    )
    // "Northern leg" already exists and must not be re-created.
    expect(pending.custom[CUSTOM_SELECT.id]).toEqual(['Eastern leg', 'Western leg'])
  })

  it('honours excluded values', () => {
    const pending = collect(
      [['Trip leg'], ['Eastern leg'], ['Typoo']],
      { 1: { kind: 'custom', fieldId: CUSTOM_SELECT.id } },
      { 1: { kind: 'createAll', excluded: ['Typoo'] } },
    )
    expect(pending.custom[CUSTOM_SELECT.id]).toEqual(['Eastern leg'])
  })

  it('collects nothing for matchExisting or skip', () => {
    const mapping: ColumnMapping = { 1: { kind: 'custom', fieldId: CUSTOM_SELECT.id } }
    const grid = [['Trip leg'], ['Eastern leg']]
    expect(collect(grid, mapping, { 1: { kind: 'matchExisting' } }).custom).toEqual({})
    expect(collect(grid, mapping, { 1: { kind: 'skip' } }).custom).toEqual({})
  })

  it('collects built-in list values separately', () => {
    const pending = collect(
      [['Category'], ['Food'], ['Gadgets']],
      { 1: { kind: 'builtIn', field: 'category' } },
      { 1: { kind: 'createAll', excluded: [] } },
    )
    expect(pending.builtIn.category).toEqual(['Gadgets'])
  })
})

describe('withCreatedOptions', () => {
  it('appends new options without touching existing ids', () => {
    const updated = withCreatedOptions([CUSTOM_SELECT], {
      custom: { [CUSTOM_SELECT.id]: ['Eastern leg'] },
      builtIn: {},
    })
    const field = updated[0]
    expect(field.options).toHaveLength(3)
    expect(field.options?.slice(0, 2)).toEqual(CUSTOM_SELECT.options)
    expect(field.options?.[2].label).toBe('Eastern leg')
    expect(field.options?.[2].id).toBeTruthy()
  })

  it('leaves untouched fields identical', () => {
    const updated = withCreatedOptions([CUSTOM_SELECT], { custom: {}, builtIn: {} })
    expect(updated[0]).toBe(CUSTOM_SELECT)
  })

  it('does not mutate the input', () => {
    const before = CUSTOM_SELECT.options?.length
    withCreatedOptions([CUSTOM_SELECT], { custom: { [CUSTOM_SELECT.id]: ['X'] }, builtIn: {} })
    expect(CUSTOM_SELECT.options).toHaveLength(before!)
  })
})

describe('withCreatedListItems', () => {
  it('appends labels as LabeledItems with generated ids', () => {
    const result = withCreatedListItems([labeled('c1', 'Food')], ['Gadgets'], 'cat')
    expect(result).toHaveLength(2)
    expect(result[1].label).toBe('Gadgets')
    expect(result[1].id).toMatch(/^cat-/)
  })

  it('returns the original array when there is nothing to add', () => {
    const existing = [labeled('c1', 'Food')]
    expect(withCreatedListItems(existing, undefined, 'cat')).toBe(existing)
    expect(withCreatedListItems(existing, [], 'cat')).toBe(existing)
  })
})

// ---------------------------------------------------------------------------
// Creating fields from columns
// ---------------------------------------------------------------------------

describe('resolveNewFields', () => {
  function resolve(grid: unknown[][], mapping: ColumnMapping, existing = [CUSTOM_SELECT]) {
    const sheet = readForeignSheet(workbookOf(grid))
    return { sheet, ...resolveNewFields(sheet, mapping, existing) }
  }

  it('creates a text field and rewrites the mapping to its id', () => {
    const { definitions, mapping } = resolve(
      [['Receipt'], ['R-1'], ['R-2']],
      { 1: { kind: 'newField', type: 'text', label: 'Receipt ref' } },
    )
    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({ label: 'Receipt ref', type: 'text', enabled: true })
    expect(definitions[0].options).toBeUndefined()
    // Row building sees an ordinary custom column, with nothing special to do.
    expect(mapping[1]).toEqual({ kind: 'custom', fieldId: definitions[0].id })
  })

  it('seeds a select field with options from the column values', () => {
    const { definitions } = resolve(
      [['Leg'], ['North'], ['South'], ['North']],
      { 1: { kind: 'newField', type: 'select', label: 'Leg' } },
    )
    expect(definitions[0].options?.map((o) => o.label)).toEqual(['North', 'South'])
    // Ids are generated, never derived from the label.
    expect(definitions[0].options?.every((o) => o.id && o.id !== o.label)).toBe(true)
  })

  it('creates no options for a boolean field', () => {
    const { definitions } = resolve(
      [['Paid back'], ['yes'], ['no']],
      { 1: { kind: 'newField', type: 'boolean', label: 'Paid back' } },
    )
    expect(definitions[0].type).toBe('boolean')
    expect(definitions[0].options).toBeUndefined()
  })

  it('falls back to the column header when the label is blank', () => {
    const { definitions } = resolve(
      [['Widget'], ['a']],
      { 1: { kind: 'newField', type: 'text', label: '   ' } },
    )
    expect(definitions[0].label).toBe('Widget')
  })

  // Two fields with the same name would be indistinguishable everywhere.
  it('drops a field whose name collides with an existing one', () => {
    const { definitions, mapping } = resolve(
      [['Trip leg'], ['x']],
      { 1: { kind: 'newField', type: 'text', label: 'Trip leg' } },
    )
    expect(definitions).toHaveLength(0)
    expect(mapping[1]).toEqual({ kind: 'ignore' })
  })

  it('drops a field colliding with another one created in the same import', () => {
    const { definitions } = resolve(
      [['A', 'B'], ['x', 'y']],
      {
        1: { kind: 'newField', type: 'text', label: 'Same' },
        2: { kind: 'newField', type: 'text', label: 'same' },
      },
    )
    expect(definitions).toHaveLength(1)
  })

  it('caps creation at MAX_NEW_FIELDS and ignores the rest', () => {
    const count = MAX_NEW_FIELDS + 5
    const headers = Array.from({ length: count }, (_, i) => `F${i}`)
    const mapping: ColumnMapping = {}
    headers.forEach((h, i) => { mapping[i + 1] = { kind: 'newField', type: 'text', label: h } })

    const { definitions, mapping: next } = resolve([headers, headers.map(() => 'v')], mapping)

    expect(definitions).toHaveLength(MAX_NEW_FIELDS)
    // A malformed sheet with fifty junk headers cannot create fifty fields.
    for (let i = MAX_NEW_FIELDS; i < count; i++) {
      expect(next[i + 1]).toEqual({ kind: 'ignore' })
    }
  })

  it('leaves non-newField targets untouched', () => {
    const { mapping } = resolve(
      [['Amount', 'Ref'], [10, 'R-1']],
      {
        1: { kind: 'core', field: 'totalAmount' },
        2: { kind: 'newField', type: 'text', label: 'Ref' },
      },
    )
    expect(mapping[1]).toEqual({ kind: 'core', field: 'totalAmount' })
  })

  it('produces unique ids for every created field', () => {
    const { definitions } = resolve(
      [['A', 'B', 'C'], ['x', 'y', 'z']],
      {
        1: { kind: 'newField', type: 'text', label: 'One' },
        2: { kind: 'newField', type: 'text', label: 'Two' },
        3: { kind: 'newField', type: 'text', label: 'Three' },
      },
    )
    expect(new Set(definitions.map((d) => d.id)).size).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

describe('buildForeignRows', () => {
  const { space } = customFieldsSpace()
  const config = getSpaceConfig(space)

  function build(grid: unknown[][], mapping: ColumnMapping, extra: Partial<Parameters<typeof buildForeignRows>[0]> = {}) {
    const sheet = readForeignSheet(workbookOf(grid))
    return buildForeignRows({
      sheet,
      mapping,
      decisions: {},
      customFields: config.customFields,
      builtInOptions: { category: space.categories, country: space.countries },
      defaultMemberId: 'm1',
      mainCurrency: 'EUR',
      ...extra,
    })
  }

  it('builds rows from core columns', () => {
    const { rows } = build(
      [['Date', 'Description', 'Amount'], ['01/02/2026', 'Coffee', 3.5]],
      {
        1: { kind: 'core', field: 'date' },
        2: { kind: 'core', field: 'name' },
        3: { kind: 'core', field: 'totalAmount' },
      },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '01-02-2026', name: 'Coffee', totalAmount: 3.5, currency: 'EUR' })
  })

  it('attributes the whole amount to the default member when there are no split columns', () => {
    const { rows } = build(
      [['Description', 'Amount'], ['Rent', 800]],
      { 1: { kind: 'core', field: 'name' }, 2: { kind: 'core', field: 'totalAmount' } },
    )
    // Without this the row would import with no splits and vanish from balances.
    expect(rows[0].cost).toEqual([{ travelMemberId: 'm1', amount: 800 }])
    expect(rows[0].paid).toEqual([{ travelMemberId: 'm1', amount: 800 }])
  })

  it('uses per-member split columns when the sheet has them', () => {
    const { rows } = build(
      [['Amount', 'Cost Alice', 'Cost Bob', 'Paid Alice'], [30, 10, 20, 30]],
      {
        1: { kind: 'core', field: 'totalAmount' },
        2: { kind: 'memberCost', travelMemberId: 'm1' },
        3: { kind: 'memberCost', travelMemberId: 'm2' },
        4: { kind: 'memberPaid', travelMemberId: 'm1' },
      },
    )
    expect(rows[0].cost).toEqual([
      { travelMemberId: 'm1', amount: 10 },
      { travelMemberId: 'm2', amount: 20 },
    ])
    expect(rows[0].paid).toEqual([{ travelMemberId: 'm1', amount: 30 }])
  })

  it('parses amounts written with thousands separators', () => {
    const mapping: ColumnMapping = { 1: { kind: 'core', field: 'totalAmount' } }
    expect(build([['Amount'], ['1,234.56']], mapping).rows[0].totalAmount).toBeCloseTo(1234.56, 4)
    expect(build([['Amount'], ['1 234,56']], mapping).rows[0].totalAmount).toBeCloseTo(1234.56, 4)
  })

  it('skips rows with neither a description nor an amount', () => {
    const { rows, skipped } = build(
      [['Description', 'Amount'], ['Coffee', 3], ['', ''], ['Lunch', 9]],
      { 1: { kind: 'core', field: 'name' }, 2: { kind: 'core', field: 'totalAmount' } },
    )
    expect(rows).toHaveLength(2)
    expect(skipped).toBe(1)
  })

  it('resolves a matched select value to its OPTION ID', () => {
    const { rows } = build(
      [['Amount', 'Trip leg'], [10, 'Northern leg']],
      { 1: { kind: 'core', field: 'totalAmount' }, 2: { kind: 'custom', fieldId: CUSTOM_SELECT.id } },
    )
    expect(rows[0].custom?.[CUSTOM_SELECT.id]).toBe('opt-north')
  })

  it('imports an unmatched select value as empty under matchExisting', () => {
    const { rows } = build(
      [['Amount', 'Trip leg'], [10, 'Eastern leg']],
      { 1: { kind: 'core', field: 'totalAmount' }, 2: { kind: 'custom', fieldId: CUSTOM_SELECT.id } },
      { decisions: { 2: { kind: 'matchExisting' } } },
    )
    expect(rows[0].custom).toBeUndefined()
  })

  it('contributes nothing from a skipped column', () => {
    const { rows } = build(
      [['Amount', 'Trip leg'], [10, 'Northern leg']],
      { 1: { kind: 'core', field: 'totalAmount' }, 2: { kind: 'custom', fieldId: CUSTOM_SELECT.id } },
      { decisions: { 2: { kind: 'skip' } } },
    )
    expect(rows[0].custom).toBeUndefined()
  })

  it('reads booleans across every accepted spelling', () => {
    const mapping: ColumnMapping = {
      1: { kind: 'core', field: 'totalAmount' },
      2: { kind: 'custom', fieldId: 'cf-reimb' },
    }
    const { rows } = build(
      [['Amount', 'Reimbursable'], [1, 'yes'], [2, 'TRUE'], [3, 1], [4, 'oui'], [5, 'no'], [6, ''], [7, 'banana']],
      mapping,
    )
    // Only `true` is stored; everything else is absent, matching the app.
    expect(rows.slice(0, 4).every((r) => r.custom?.['cf-reimb'] === true)).toBe(true)
    expect(rows.slice(4).every((r) => r.custom === undefined)).toBe(true)
  })

  it('stores a matched category with its emoji prefix but a country bare', () => {
    const { rows } = build(
      [['Amount', 'Category', 'Country'], [10, 'food', 'france']],
      {
        1: { kind: 'core', field: 'totalAmount' },
        2: { kind: 'builtIn', field: 'category' },
        3: { kind: 'builtIn', field: 'country' },
      },
    )
    // The stored forms differ, and the Analysis formulas depend on it (F7).
    expect(rows[0].category).toBe('🍽️ Food')
    expect(rows[0].country).toBe('France')
  })

  it('ignores columns mapped to ignore', () => {
    const { rows } = build(
      [['Amount', 'Junk'], [10, 'whatever']],
      { 1: { kind: 'core', field: 'totalAmount' }, 2: { kind: 'ignore' } },
    )
    expect(rows[0].notes).toBeUndefined()
    expect(rows[0].custom).toBeUndefined()
  })
})
