// dashboardCards.test.ts — generic 1D breakdown aggregation (Phase 7a §4, §6).

import { describe, it, expect } from 'vitest'
import type { Transaction } from '@/transactions/types'
import type { CustomFieldDef, DashboardCardDef, Space, SpaceConfig } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import { configFromPreset } from '@/spaces/presets'
import { UNDEFINED_FILTER } from '@/transactions/utils/filterDimensions'
import type { ScopedTransaction } from '@/spaces/utils/dashboardScope'
import {
  computeBreakdown,
  computePivot,
  breakdownDimensions,
  resolveDashboardCards,
  visibleDashboardCards,
  usedCardKeys,
  drillValues,
  cardTitle,
  OTHER_ROW,
  SECTION_TOP_N,
  LEGACY_CATEGORY_CARD_ID,
  LEGACY_COUNTRY_CARD_ID,
} from '../dashboardCards'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txId: 'tx-' + Math.random().toString(36).slice(2),
    date: '10-06-2026',
    name: 'Test',
    totalAmount: 10,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 10,
    paidBy: [],
    beneficiaries: [],
    createdBy: { type: 'user', uid: 'u' },
    createdAt: null as unknown as Transaction['createdAt'],
    lastModifiedAt: null as unknown as Transaction['lastModifiedAt'],
    lastModifiedBy: 'u',
    ...overrides,
  }
}

/** Wrap transactions as already-scoped, attributing `totalAmountMain`. */
function scope(txs: Transaction[]): ScopedTransaction[] {
  return txs.map((t) => ({ transaction: t, attributedAmount: t.totalAmountMain }))
}

function makeSpace(config?: SpaceConfig): Space {
  return { spaceId: 's1', members: [], currencies: [], config } as unknown as Space
}

/** The descriptor for one dimension key of a space. */
function dim(space: Space, config: SpaceConfig, key: string) {
  const found = breakdownDimensions(space, config).find((d) => d.key === key)
  if (!found) throw new Error(`no dimension ${key}`)
  return found
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe('computeBreakdown', () => {
  const legacyConfig = getSpaceConfig(makeSpace())
  const space = makeSpace()
  const categoryDim = dim(space, legacyConfig, 'category')

  it('sorts rows by amount descending, not alphabetically', () => {
    const scoped = scope([
      makeTx({ category: 'Aaa', totalAmountMain: 10 }),
      makeTx({ category: 'Zzz', totalAmountMain: 50 }),
      makeTx({ category: 'Mmm', totalAmountMain: 30 }),
    ])
    const { rows, total } = computeBreakdown(scoped, categoryDim)
    expect(rows.map((r) => r.label)).toEqual(['Zzz', 'Mmm', 'Aaa'])
    expect(total).toBe(90)
  })

  it('sums several transactions into one row and counts them', () => {
    const scoped = scope([
      makeTx({ category: 'Food', totalAmountMain: 10 }),
      makeTx({ category: 'Food', totalAmountMain: 5 }),
    ])
    const { rows } = computeBreakdown(scoped, categoryDim)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Food', amount: 15, count: 2 })
  })

  it('collapses the tail into an Other row with the correct total', () => {
    // 7 distinct values, top-N = 5 → 5 rows + Other holding the last 2.
    const scoped = scope([
      makeTx({ category: 'A', totalAmountMain: 70 }),
      makeTx({ category: 'B', totalAmountMain: 60 }),
      makeTx({ category: 'C', totalAmountMain: 50 }),
      makeTx({ category: 'D', totalAmountMain: 40 }),
      makeTx({ category: 'E', totalAmountMain: 30 }),
      makeTx({ category: 'F', totalAmountMain: 20 }),
      makeTx({ category: 'G', totalAmountMain: 10 }),
    ])
    const { rows, total } = computeBreakdown(scoped, categoryDim)

    expect(rows).toHaveLength(6)
    const other = rows[5]
    expect(other.key).toBe(OTHER_ROW)
    expect(other.isOther).toBe(true)
    expect(other.amount).toBe(30)   // F + G
    expect(other.count).toBe(2)
    expect(other.label).toContain('2 values')
    // Tapping Other must drill into every collapsed value.
    expect(other.values.sort()).toEqual(['F', 'G'])
    // Rows still sum to the card total.
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(total)
  })

  it('does not create an Other row when the tail is empty', () => {
    const scoped = scope([makeTx({ category: 'A' }), makeTx({ category: 'B' })])
    expect(computeBreakdown(scoped, categoryDim).rows.some((r) => r.isOther)).toBe(false)
  })

  it('pins the missing-value row last regardless of its amount', () => {
    const scoped = scope([
      makeTx({ category: undefined, totalAmountMain: 1000 }), // biggest
      makeTx({ category: 'Food', totalAmountMain: 10 }),
    ])
    const { rows } = computeBreakdown(scoped, categoryDim)
    expect(rows.map((r) => r.label)).toEqual(['Food', 'No category'])
    const missing = rows[1]
    expect(missing.isMissing).toBe(true)
    expect(missing.amount).toBe(1000)
    // Drills down on the filter panel's "Undefined" sentinel.
    expect(missing.values).toEqual([UNDEFINED_FILTER])
  })

  it('pins the missing row after Other', () => {
    const scoped = scope([
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) =>
        makeTx({ category: c, totalAmountMain: 100 - i }),
      ),
      makeTx({ category: undefined, totalAmountMain: 5 }),
    ])
    const rows = computeBreakdown(scoped, categoryDim).rows
    expect(rows[rows.length - 2].isOther).toBe(true)
    expect(rows[rows.length - 1].isMissing).toBe(true)
  })

  it('returns no rows for an empty scoped list', () => {
    expect(computeBreakdown([], categoryDim)).toEqual({ rows: [], total: 0 })
  })
})

// ---------------------------------------------------------------------------
// Custom field dimensions
// ---------------------------------------------------------------------------

describe('computeBreakdown — custom fields', () => {
  const selectField: CustomFieldDef = {
    id: 'f-trip',
    label: 'Trip leg',
    type: 'select',
    enabled: true,
    options: [
      { id: 'o-north', label: 'North' },
      { id: 'o-south', label: 'South', emoji: '🌴' },
    ],
  }
  const boolField: CustomFieldDef = {
    id: 'f-work',
    label: 'Work',
    type: 'boolean',
    enabled: true,
  }

  const config: SpaceConfig = {
    ...configFromPreset('custom'),
    customFields: [selectField, boolField],
  }
  const space = makeSpace(config)

  it('groups a select on the OPTION ID and displays the resolved label', () => {
    const scoped = scope([
      makeTx({ custom: { 'f-trip': 'o-north' }, totalAmountMain: 10 }),
      makeTx({ custom: { 'f-trip': 'o-south' }, totalAmountMain: 30 }),
      makeTx({ custom: { 'f-trip': 'o-south' }, totalAmountMain: 5 }),
    ])
    const { rows } = computeBreakdown(scoped, dim(space, config, 'f-trip'))
    expect(rows.map((r) => [r.key, r.label, r.amount])).toEqual([
      ['o-south', '🌴 South', 35],
      ['o-north', 'North', 10],
    ])
  })

  it('falls back to the raw value when the option was deleted', () => {
    const scoped = scope([makeTx({ custom: { 'f-trip': 'o-gone' }, totalAmountMain: 7 })])
    const { rows } = computeBreakdown(scoped, dim(space, config, 'f-trip'))
    expect(rows[0]).toMatchObject({ key: 'o-gone', label: 'o-gone', amount: 7 })
  })

  it('groups a transaction with no value for the select under "No ..."', () => {
    const scoped = scope([
      makeTx({ custom: { 'f-trip': 'o-north' }, totalAmountMain: 10 }),
      makeTx({ totalAmountMain: 4 }),                 // no custom map at all
      makeTx({ custom: {}, totalAmountMain: 6 }),     // empty custom map
    ])
    const { rows } = computeBreakdown(scoped, dim(space, config, 'f-trip'))
    expect(rows[rows.length - 1]).toMatchObject({
      label: 'No trip leg',
      amount: 10,
      count: 2,
      isMissing: true,
    })
  })

  it('boolean: an absent key counts as No', () => {
    // buildCustomPayload() omits `false` entirely, so "no key" and "explicitly
    // false" must land in the same bucket.
    const scoped = scope([
      makeTx({ custom: { 'f-work': true }, totalAmountMain: 10 }),
      makeTx({ custom: { 'f-work': false }, totalAmountMain: 20 }),
      makeTx({ totalAmountMain: 5 }),                       // no custom map
      makeTx({ custom: { 'f-trip': 'o-north' }, totalAmountMain: 5 }), // other field only
    ])
    const { rows } = computeBreakdown(scoped, dim(space, config, 'f-work'))
    expect(rows.map((r) => [r.label, r.amount, r.count])).toEqual([
      ['No', 30, 3],
      ['Yes', 10, 1],
    ])
    // Neither row is the missing row — every transaction has a boolean value.
    expect(rows.every((r) => !r.isMissing)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Dimension offering
// ---------------------------------------------------------------------------

describe('breakdownDimensions', () => {
  it('offers a legacy space its four built-ins', () => {
    const space = makeSpace()
    const keys = breakdownDimensions(space, getSpaceConfig(space)).map((d) => d.key)
    expect(keys).toEqual(['category', 'country', 'city', 'paymentMethod'])
  })

  it('excludes disabled built-ins and custom text fields, and excludes members', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'), // country/city/paymentMethod off
      customFields: [
        { id: 'f-note', label: 'Ref', type: 'text', enabled: true },
        { id: 'f-tag', label: 'Tag', type: 'select', enabled: true, options: [] },
        { id: 'f-off', label: 'Off', type: 'select', enabled: false, options: [] },
      ],
    }
    const keys = breakdownDimensions(makeSpace(config), config).map((d) => d.key)
    expect(keys).toEqual(['category', 'f-tag'])
    expect(keys).not.toContain('paidBy')
    expect(keys).not.toContain('beneficiaries')
    expect(keys).not.toContain('currency')
  })
})

// ---------------------------------------------------------------------------
// Card definitions
// ---------------------------------------------------------------------------

describe('resolveDashboardCards / visibleDashboardCards', () => {
  it('resolves an absent list to the legacy default set', () => {
    const space = makeSpace()
    const cards = resolveDashboardCards(getSpaceConfig(space))
    expect(cards.map((c) => c.dimensions[0])).toEqual(['category', 'country'])
    expect(cards.map((c) => c.id)).toEqual([LEGACY_CATEGORY_CARD_ID, LEGACY_COUNTRY_CARD_ID])
  })

  it('honours an empty stored array — the user deleted every card', () => {
    const config: SpaceConfig = { ...configFromPreset('travel'), dashboardCards: [] }
    expect(resolveDashboardCards(config)).toEqual([])
  })

  it('hides a card whose dimension is disabled, without deleting it', () => {
    const stored: DashboardCardDef[] = [
      { id: 'c1', dimensions: ['category'] },
      { id: 'c2', dimensions: ['country'], title: 'Where' },
    ]
    // country off (group preset)
    const config: SpaceConfig = { ...configFromPreset('group'), dashboardCards: stored }
    const space = makeSpace(config)
    const visible = visibleDashboardCards(
      resolveDashboardCards(config),
      breakdownDimensions(space, config),
    )
    expect(visible.map((v) => v.card.id)).toEqual(['c1'])
    // The stored config is untouched — re-enabling brings the card back.
    expect(config.dashboardCards).toHaveLength(2)
    expect(config.dashboardCards![1].title).toBe('Where')

    const reEnabled: SpaceConfig = {
      ...config,
      builtInFields: { ...config.builtInFields, country: true },
    }
    const backAgain = visibleDashboardCards(
      resolveDashboardCards(reEnabled),
      breakdownDimensions(makeSpace(reEnabled), reEnabled),
    )
    expect(backAgain.map((v) => v.card.title)).toEqual([undefined, 'Where'])
  })

  it('derives a title from the dimension, overridable by the user', () => {
    const space = makeSpace()
    const config = getSpaceConfig(space)
    const categoryDim = dim(space, config, 'category')
    expect(cardTitle({ id: 'c', dimensions: ['category'] }, [categoryDim])).toBe('By category')
    expect(cardTitle({ id: 'c', dimensions: ['category'], title: 'Spending buckets' }, [categoryDim]))
      .toBe('Spending buckets')
    // A blank override falls back rather than rendering an empty heading.
    expect(cardTitle({ id: 'c', dimensions: ['category'], title: '  ' }, [categoryDim]))
      .toBe('By category')
  })

  it('names both dimensions, in order, for a pivot', () => {
    const space = makeSpace()
    const config = getSpaceConfig(space)
    const country = dim(space, config, 'country')
    const category = dim(space, config, 'category')
    // Order is meaningful, so the two orders must not produce the same title.
    expect(cardTitle({ id: 'c', dimensions: ['country', 'category'] }, [country, category]))
      .toBe('Country × category')
    expect(cardTitle({ id: 'c', dimensions: ['category', 'country'] }, [category, country]))
      .toBe('Category × country')
    expect(cardTitle({ id: 'c', dimensions: ['country', 'category'], title: 'Where & what' }, [country, category]))
      .toBe('Where & what')
  })
})

// ---------------------------------------------------------------------------
// computePivot (Phase 7b §2)
// ---------------------------------------------------------------------------

describe('computePivot', () => {
  const legacyConfig = getSpaceConfig(makeSpace())
  const space = makeSpace()
  const countryDim = dim(space, legacyConfig, 'country')
  const categoryDim = dim(space, legacyConfig, 'category')

  /** Shorthand: one transaction with a country, a category and an amount. */
  function tx(country: string | undefined, category: string | undefined, amount: number) {
    return makeTx({ country, category, totalAmount: amount, totalAmountMain: amount })
  }

  it('emits only combinations that exist — never an empty cell', () => {
    // 2 countries × 2 categories, but only 3 of the 4 pairs occur.
    const { sections } = computePivot(
      scope([tx('JP', 'Food', 30), tx('JP', 'Hotel', 20), tx('FR', 'Food', 10)]),
      countryDim,
      categoryDim,
    )
    expect(sections.map((s) => s.key)).toEqual(['JP', 'FR'])
    expect(sections[0].rows.map((r) => r.key)).toEqual(['Food', 'Hotel'])
    // FR has no Hotel row at all — the sparse cell simply does not exist.
    expect(sections[1].rows.map((r) => r.key)).toEqual(['Food'])
  })

  it('sorts sections and rows by total descending', () => {
    const { sections, total } = computePivot(
      scope([
        tx('Aaa', 'Cheap', 5),
        tx('Zzz', 'Cheap', 10),
        tx('Zzz', 'Dear', 90),
      ]),
      countryDim,
      categoryDim,
    )
    expect(sections.map((s) => s.label)).toEqual(['Zzz', 'Aaa'])
    expect(sections[0].rows.map((r) => r.label)).toEqual(['Dear', 'Cheap'])
    expect(total).toBe(105)
  })

  it('collapses the row tail into Other, with the right total and collapsedKeys', () => {
    // One country, 7 categories → 5 rows + Other · 2 values.
    const cats = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']
    const { sections } = computePivot(
      scope(cats.map((c, i) => tx('JP', c, 100 - i))),
      countryDim,
      categoryDim,
    )
    const rows = sections[0].rows
    expect(rows).toHaveLength(6)
    expect(rows[5].key).toBe(OTHER_ROW)
    expect(rows[5].label).toBe('Other · 2 values')
    expect(rows[5].total).toBe(95 + 94)
    expect(rows[5].count).toBe(2)
    expect(rows[5].collapsedKeys).toEqual(['c6', 'c7'])
    // A normal row carries no collapsedKeys — drillValues() falls back to its key.
    expect(rows[0].collapsedKeys).toBeUndefined()
    expect(drillValues(rows[0])).toEqual(['c1'])
    expect(drillValues(rows[5])).toEqual(['c6', 'c7'])
  })

  it('caps sections at 8 with a trailing, non-expandable Other section', () => {
    // 10 countries → 8 sections + Other · 2 values.
    const countries = Array.from({ length: 10 }, (_, i) => `country-${i}`)
    const { sections, total } = computePivot(
      scope(countries.map((c, i) => tx(c, 'Food', 100 - i))),
      countryDim,
      categoryDim,
    )
    expect(sections).toHaveLength(SECTION_TOP_N + 1)
    const other = sections[SECTION_TOP_N]
    expect(other.isOther).toBe(true)
    expect(other.label).toBe('Other · 2 values')
    expect(other.total).toBe(92 + 91)
    // Not expandable: it drills straight through instead of showing rows.
    expect(other.rows).toEqual([])
    expect(other.collapsedKeys).toEqual(['country-8', 'country-9'])
    expect(drillValues(other)).toEqual(['country-8', 'country-9'])
    expect(total).toBe(countries.reduce((s, _c, i) => s + 100 - i, 0))
  })

  it('pins the missing value last at BOTH levels, after Other', () => {
    const rowsCats = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    const scoped = scope([
      // A country section whose rows overflow AND include a missing category.
      ...rowsCats.map((c, i) => tx('JP', c, 100 - i)),
      tx('JP', undefined, 1000),
      // A missing-country group, with the biggest total of all — still last.
      tx(undefined, 'Food', 9999),
    ])
    const { sections } = computePivot(scoped, countryDim, categoryDim)

    const last = sections[sections.length - 1]
    expect(last.isMissing).toBe(true)
    expect(last.key).toBe(UNDEFINED_FILTER)
    expect(last.label).toBe('No country')

    const jp = sections.find((s) => s.key === 'JP')!
    const lastRow = jp.rows[jp.rows.length - 1]
    expect(lastRow.isMissing).toBe(true)
    expect(lastRow.label).toBe('No category')
    // …and it sits AFTER the collapsed Other row, not before it.
    expect(jp.rows[jp.rows.length - 2].key).toBe(OTHER_ROW)
  })

  it('breaks the missing-value section down normally', () => {
    // Knowing WHAT is missing a country is the reason to open that section.
    const { sections } = computePivot(
      scope([tx(undefined, 'Food', 10), tx(undefined, 'Hotel', 20)]),
      countryDim,
      categoryDim,
    )
    expect(sections).toHaveLength(1)
    expect(sections[0].isMissing).toBe(true)
    expect(sections[0].rows.map((r) => r.label)).toEqual(['Hotel', 'Food'])
  })

  it('keeps the two invariants a user checks by eye', () => {
    // Enough values to engage BOTH top-N levels at once.
    const scoped = scope(
      Array.from({ length: 12 }, (_, ci) =>
        Array.from({ length: 9 }, (_, ki) => tx(`country-${ci}`, `cat-${ki}`, 100 - ci * 5 - ki)),
      ).flat(),
    )
    const { sections, total } = computePivot(scoped, countryDim, categoryDim)

    // Both caps engaged.
    expect(sections).toHaveLength(SECTION_TOP_N + 1)
    expect(sections[0].rows.some((r) => r.isOther)).toBe(true)

    // 1. Every expandable section's total equals the sum of its own rows,
    //    Other row included.
    for (const s of sections.filter((x) => !x.isOther)) {
      const sumRows = s.rows.reduce((acc, r) => acc + r.total, 0)
      expect(sumRows).toBeCloseTo(s.total, 6)
    }
    // 2. The section totals sum to the card total.
    const sumSections = sections.reduce((acc, s) => acc + s.total, 0)
    expect(sumSections).toBeCloseTo(total, 6)
    expect(total).toBeCloseTo(
      scoped.reduce((acc, s) => acc + s.attributedAmount, 0),
      6,
    )
  })

  it('resolves custom select labels from the option id at both levels', () => {
    const trip: CustomFieldDef = {
      id: 'f-trip',
      label: 'Trip',
      type: 'select',
      enabled: true,
      options: [
        { id: 'o1', label: 'Business' },
        { id: 'o2', label: 'Leisure' },
      ],
    }
    const config: SpaceConfig = { ...configFromPreset('travel'), customFields: [trip] }
    const s = makeSpace(config)
    const tripDim = dim(s, config, 'f-trip')

    const { sections } = computePivot(
      scope([
        makeTx({ category: 'Food', custom: { 'f-trip': 'o1' }, totalAmountMain: 10 }),
        makeTx({ category: 'Food', custom: { 'f-trip': 'o2' }, totalAmountMain: 30 }),
      ]),
      dim(s, config, 'category'),
      tripDim,
    )
    // Grouped on the stored OPTION ID, displayed with the definition's label.
    expect(sections[0].rows.map((r) => r.key)).toEqual(['o2', 'o1'])
    expect(sections[0].rows.map((r) => r.label)).toEqual(['Leisure', 'Business'])
  })

  it('treats an absent boolean key as No', () => {
    const flag: CustomFieldDef = { id: 'f-b', label: 'Reimbursed', type: 'boolean', enabled: true }
    const config: SpaceConfig = { ...configFromPreset('travel'), customFields: [flag] }
    const s = makeSpace(config)

    const { sections } = computePivot(
      scope([
        makeTx({ category: 'Food', custom: { 'f-b': true }, totalAmountMain: 10 }),
        // No `custom` map at all — buildCustomPayload omits `false` entirely.
        makeTx({ category: 'Food', totalAmountMain: 20 }),
      ]),
      dim(s, config, 'category'),
      dim(s, config, 'f-b'),
    )
    const labels = sections[0].rows.map((r) => r.label)
    expect(labels).toContain('Yes')
    expect(labels).toContain('No')
    expect(sections[0].rows.find((r) => r.label === 'No')!.total).toBe(20)
  })

  it('reproduces the 1D card as its section totals (regression anchor)', () => {
    const scoped = scope([
      tx('JP', 'Food', 30),
      tx('JP', 'Hotel', 20),
      tx('FR', 'Food', 10),
      tx(undefined, 'Food', 5),
    ])
    const flat = computeBreakdown(scoped, countryDim)
    const pivot = computePivot(scoped, countryDim, categoryDim)

    expect(pivot.total).toBe(flat.total)
    expect(pivot.sections.map((s) => [s.key, s.total])).toEqual(
      flat.rows.map((r) => [r.key, r.amount]),
    )
  })
})

// ---------------------------------------------------------------------------
// usedCardKeys (Phase 7b §5)
// ---------------------------------------------------------------------------

describe('usedCardKeys', () => {
  const cards: DashboardCardDef[] = [
    { id: 'a', dimensions: ['category'] },
    { id: 'b', dimensions: ['country', 'category'] },
  ]

  it('keys on the ORDERED dimensions, so only an exact match is a duplicate', () => {
    const used = usedCardKeys(cards)
    expect(used.has('category')).toBe(true)
    expect(used.has('country|category')).toBe(true)
    // The reverse order is a different, legitimate card.
    expect(used.has('category|country')).toBe(false)
    // A 1D card does not block the 2D card that starts with it.
    expect(used.has('country')).toBe(false)
  })

  it('excludes the card being edited from its own duplicate check', () => {
    expect(usedCardKeys(cards, 'b').has('country|category')).toBe(false)
    expect(usedCardKeys(cards, 'b').has('category')).toBe(true)
  })

  it('still counts a card hidden behind a disabled field', () => {
    // country off → the pivot card is hidden by visibleDashboardCards()…
    const config: SpaceConfig = { ...configFromPreset('group'), dashboardCards: cards }
    const s = makeSpace(config)
    const visible = visibleDashboardCards(resolveDashboardCards(config), breakdownDimensions(s, config))
    expect(visible.map((v) => v.card.id)).toEqual(['a'])
    // …but it is still STORED, so its combination stays taken. Otherwise the
    // user creates a second card that collides when country is re-enabled.
    expect(usedCardKeys(resolveDashboardCards(config)).has('country|category')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// visibleDashboardCards — pivots (Phase 7b §6)
// ---------------------------------------------------------------------------

describe('visibleDashboardCards — pivot cards', () => {
  const pivot: DashboardCardDef[] = [{ id: 'p', dimensions: ['country', 'category'], title: 'Both' }]

  it('hides a pivot when EITHER dimension is disabled, and never degrades it to 1D', () => {
    const config: SpaceConfig = { ...configFromPreset('group'), dashboardCards: pivot } // country off
    const s = makeSpace(config)
    expect(visibleDashboardCards(resolveDashboardCards(config), breakdownDimensions(s, config)))
      .toEqual([])
    // Still stored, with its title and order intact.
    expect(config.dashboardCards).toEqual(pivot)
  })

  it('brings the pivot back intact when both dimensions are enabled again', () => {
    const config: SpaceConfig = { ...configFromPreset('travel'), dashboardCards: pivot }
    const s = makeSpace(config)
    const visible = visibleDashboardCards(resolveDashboardCards(config), breakdownDimensions(s, config))
    expect(visible).toHaveLength(1)
    expect(visible[0].dims.map((d) => d.key)).toEqual(['country', 'category'])
    expect(visible[0].card.title).toBe('Both')
  })
})
