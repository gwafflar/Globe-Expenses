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
  breakdownDimensions,
  resolveDashboardCards,
  visibleDashboardCards,
  cardTitle,
  OTHER_ROW,
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
    expect(cardTitle({ id: 'c', dimensions: ['category'] }, categoryDim)).toBe('By category')
    expect(cardTitle({ id: 'c', dimensions: ['category'], title: 'Spending buckets' }, categoryDim))
      .toBe('Spending buckets')
    // A blank override falls back rather than rendering an empty heading.
    expect(cardTitle({ id: 'c', dimensions: ['category'], title: '  ' }, categoryDim))
      .toBe('By category')
  })
})
