import { describe, it, expect } from 'vitest'
import {
  buildColumnMap,
  colLetter,
  columnMapForConfig,
  columnForDimension,
  customCellValue,
  parseBooleanCell,
} from '../sheetColumns'
import { getSpaceConfig } from '@/spaces/config'
import type { CustomFieldDef } from '@/spaces/types'
import {
  CUSTOM_BOOL,
  CUSTOM_SELECT,
  CUSTOM_TEXT,
  customFieldsSpace,
  disabledFieldSpace,
  legacySpace,
  soloSpace,
} from './sheetFixtures'

const ALL_ON = { country: true, city: true, category: true, paymentMethod: true, notes: true }

describe('buildColumnMap — pre-Phase-8 layout is unchanged', () => {
  // The regression guard: with every built-in on and no custom fields, the
  // layout must be column-for-column what it was before this phase, or every
  // previously exported file becomes unreadable.
  it('places exchangeRate, costMain, and costLocal correctly for N=2', () => {
    const cm = buildColumnMap(2)
    expect(cm.exchangeRate).toBe(9)
    expect(cm.costMain).toBe(10)
    expect(cm.costLocal[0]).toBe(13)
    expect(cm.costLocal[1]).toBe(14)
    expect(cm.paidLocal[0]).toBe(15)
    expect(cm.paidLocal[1]).toBe(16)
  })

  it('places exchangeRate at col I for N=1', () => {
    const cm = buildColumnMap(1)
    expect(cm.exchangeRate).toBe(9)
    expect(cm.costMain).toBe(10)
    expect(cm.costLocal[0]).toBe(13)
  })

  it('reproduces the full historical layout for N=2', () => {
    const cm = buildColumnMap(2)
    expect(cm.country).toBe(3)
    expect(cm.city).toBe(4)
    expect(cm.category).toBe(5)
    expect(cm.paymentMethod).toBe(17)
    expect(cm.notes).toBe(18)
    expect(cm.costMainPerMember).toEqual([19, 20])
    expect(cm.checkCost).toBe(21)
    expect(cm.checkPaid).toBe(22)
    expect(cm.allGood).toBe(23)
    expect(cm.txId).toBe(24)
    expect(cm.totalCols).toBe(24)
  })
})

describe('buildColumnMap — member counts × custom field counts', () => {
  const makeFields = (n: number): CustomFieldDef[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `cf-${i}`,
      label: `Field ${i}`,
      type: 'text' as const,
      enabled: true,
    }))

  it.each([0, 1, 5])('handles %i custom fields at N=2', (fieldCount) => {
    const customFields = makeFields(fieldCount)
    const cm = buildColumnMap(2, { builtIns: ALL_ON, customFields })

    // Custom columns sit after notes and before the cost-main-per-member block.
    expect(Object.keys(cm.custom)).toHaveLength(fieldCount)
    for (const def of customFields) {
      expect(cm.custom[def.id]).toBeGreaterThan(cm.notes!)
      expect(cm.custom[def.id]).toBeLessThan(cm.costMainPerMember[0])
    }
    // Every field widens the sheet by exactly one column.
    expect(cm.totalCols).toBe(24 + fieldCount)
  })

  it.each([1, 2, 5])('handles N=%i members with no custom fields', (n) => {
    const cm = buildColumnMap(n)
    expect(cm.costLocal).toHaveLength(n)
    expect(cm.paidLocal).toHaveLength(n)
    expect(cm.costMainPerMember).toHaveLength(n)
    expect(cm.totalCols).toBe(18 + 3 * n)
  })

  it.each([1, 2, 5])('keeps every column number unique and gapless at N=%i', (n) => {
    const cm = buildColumnMap(n, { builtIns: ALL_ON, customFields: makeFields(3) })
    const claimed = [
      cm.rowIndex, cm.date, cm.country, cm.city, cm.category, cm.name,
      cm.amountLocal, cm.currency, cm.exchangeRate, cm.costMain,
      cm.splitLabel, cm.paidByLabel,
      ...cm.costLocal, ...cm.paidLocal,
      cm.paymentMethod, cm.notes, ...Object.values(cm.custom),
      ...cm.costMainPerMember,
      cm.checkCost, cm.checkPaid, cm.allGood, cm.txId,
    ].filter((c): c is number => c !== undefined)

    expect(new Set(claimed).size).toBe(claimed.length)
    expect([...claimed].sort((a, b) => a - b)).toEqual(
      Array.from({ length: cm.totalCols }, (_, i) => i + 1),
    )
  })
})

describe('buildColumnMap — disabled built-ins emit no column', () => {
  it('omits country and city for a solo space', () => {
    const cm = buildColumnMap(1, {
      builtIns: { country: false, city: false, category: true, paymentMethod: true, notes: true },
    })
    expect(cm.country).toBeUndefined()
    expect(cm.city).toBeUndefined()
    // Category slides up into what used to be country's slot.
    expect(cm.category).toBe(3)
    expect(cm.name).toBe(4)
    expect(cm.totalCols).toBe(19)
  })

  it('omits every optional built-in when all are disabled', () => {
    const cm = buildColumnMap(1, {
      builtIns: { country: false, city: false, category: false, paymentMethod: false, notes: false },
    })
    expect(cm.country).toBeUndefined()
    expect(cm.city).toBeUndefined()
    expect(cm.category).toBeUndefined()
    expect(cm.paymentMethod).toBeUndefined()
    expect(cm.notes).toBeUndefined()
    expect(cm.name).toBe(3)
    expect(cm.totalCols).toBe(16)
  })
})

describe('columnMapForConfig', () => {
  it('gives a legacy space the full built-in set', () => {
    const { space } = legacySpace()
    const cm = columnMapForConfig(2, getSpaceConfig(space))
    expect(cm.country).toBe(3)
    expect(cm.city).toBe(4)
    expect(cm.category).toBe(5)
    expect(cm.customFields).toEqual([])
  })

  it('drops country and city for a solo space', () => {
    const { space } = soloSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space))
    expect(cm.country).toBeUndefined()
    expect(cm.city).toBeUndefined()
    expect(cm.category).toBeDefined()
  })

  it('emits only ENABLED custom fields by default', () => {
    const { space } = disabledFieldSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space))
    expect(cm.custom['cf-trip']).toBeDefined()
    expect(cm.custom['cf-old']).toBeUndefined()
    // city is disabled on this fixture
    expect(cm.city).toBeUndefined()
  })

  it('emits disabled fields the user chose to include', () => {
    const { space } = disabledFieldSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space), ['city', 'cf-old'])
    expect(cm.city).toBeDefined()
    expect(cm.custom['cf-old']).toBeDefined()
  })

  it('emits custom fields in definition order', () => {
    const { space } = customFieldsSpace()
    const cm = columnMapForConfig(2, getSpaceConfig(space))
    const cols = cm.customFields.map((f) => cm.custom[f.id])
    expect(cm.customFields.map((f) => f.id)).toEqual([CUSTOM_SELECT.id, CUSTOM_BOOL.id, CUSTOM_TEXT.id])
    expect(cols).toEqual([...cols].sort((a, b) => a - b))
  })
})

describe('columnForDimension', () => {
  it('resolves built-in and custom dimension keys', () => {
    const { space } = customFieldsSpace()
    const cm = columnMapForConfig(2, getSpaceConfig(space))
    expect(columnForDimension(cm, 'category')).toBe(cm.category)
    expect(columnForDimension(cm, 'country')).toBe(cm.country)
    expect(columnForDimension(cm, CUSTOM_SELECT.id)).toBe(cm.custom[CUSTOM_SELECT.id])
  })

  // This is what lets the Analysis generator skip a card instead of emitting
  // a formula that resolves to #REF!.
  it('returns undefined for a dimension with no exported column', () => {
    const { space } = soloSpace()
    const cm = columnMapForConfig(1, getSpaceConfig(space))
    expect(columnForDimension(cm, 'country')).toBeUndefined()
    expect(columnForDimension(cm, 'nope')).toBeUndefined()
  })
})

describe('customCellValue', () => {
  it('renders a select as its option LABEL', () => {
    expect(customCellValue(CUSTOM_SELECT, 'opt-north')).toBe('Northern leg')
  })

  it('falls back to the raw value for a deleted option', () => {
    expect(customCellValue(CUSTOM_SELECT, 'opt-gone')).toBe('opt-gone')
  })

  it('renders booleans as yes / no, with absent counting as no', () => {
    expect(customCellValue(CUSTOM_BOOL, true)).toBe('yes')
    expect(customCellValue(CUSTOM_BOOL, false)).toBe('no')
    // buildCustomPayload() omits false entirely, so absent is the normal
    // way "no" is stored — it must not render blank.
    expect(customCellValue(CUSTOM_BOOL, undefined)).toBe('no')
  })

  it('renders text raw, and blanks an absent value', () => {
    expect(customCellValue(CUSTOM_TEXT, 'R-0042')).toBe('R-0042')
    expect(customCellValue(CUSTOM_TEXT, undefined)).toBe('')
  })
})

describe('parseBooleanCell', () => {
  it.each(['yes', 'YES', 'y', 'true', 'TRUE', '1', 'oui', 'vrai', 'x', '✔️'])(
    'reads %s as true',
    (raw) => expect(parseBooleanCell(raw)).toBe(true),
  )

  it.each(['no', 'NO', 'n', 'false', '0', 'non', '', '   ', 'maybe', 'banana'])(
    'reads %s as false',
    (raw) => expect(parseBooleanCell(raw)).toBe(false),
  )

  it('handles non-string cell types', () => {
    expect(parseBooleanCell(true)).toBe(true)
    expect(parseBooleanCell(false)).toBe(false)
    expect(parseBooleanCell(1)).toBe(true)
    expect(parseBooleanCell(0)).toBe(false)
    expect(parseBooleanCell(undefined)).toBe(false)
    expect(parseBooleanCell(null)).toBe(false)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseBooleanCell('  yes  ')).toBe(true)
  })
})

describe('colLetter', () => {
  it.each([
    [1, 'A'],
    [26, 'Z'],
    [27, 'AA'],
    [52, 'AZ'],
    [53, 'BA'],
  ])('maps %i to %s', (n, expected) => expect(colLetter(n)).toBe(expected))
})
