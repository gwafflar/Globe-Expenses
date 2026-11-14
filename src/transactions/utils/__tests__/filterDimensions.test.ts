// filterDimensions.test.ts — Space refactor Phase 6, §1–§3.
//
// Pure-function coverage for the filter descriptor list, the custom-field
// predicate and stale-filter reconciliation. No React, no Firestore.

import { describe, it, expect } from 'vitest'
import type { CustomFieldDef, Space, SpaceConfig } from '@/spaces/types'
import type { Transaction } from '@/transactions/types'
import { getSpaceConfig } from '@/spaces/config'
import { configFromPreset } from '@/spaces/presets'
import {
  BOOL_FALSE,
  BOOL_TRUE,
  UNDEFINED_FILTER,
  allFilterDimensions,
  dimensionValues,
  filterDimensions,
  matchesDimension,
  reconcileFilters,
  searchableCustomFieldIds,
  type FilterDimension,
  type FilterState,
} from '../filterDimensions'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A legacy space: no `config` field at all, exactly like a pre-refactor doc. */
function legacySpace(): Space {
  return {
    spaceId: 's1',
    name: 'Japan 2026',
    members: [
      { travelMemberId: 'm1', displayName: 'Alice', userId: 'u1', allowRename: true, joinedAt: null as never },
      { travelMemberId: 'm2', displayName: 'Bob', userId: null, allowRename: true, joinedAt: null as never },
    ],
    memberUids: ['u1'],
    createdBy: 'u1',
    createdAt: null as never,
    currencies: ['EUR'],
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
    archivedByUids: [],
  }
}

function spaceWithConfig(config: SpaceConfig): Space {
  return { ...legacySpace(), config }
}

function selectField(overrides: Partial<CustomFieldDef> = {}): CustomFieldDef {
  return {
    id: 'f_project',
    label: 'Project',
    emoji: '📁',
    type: 'select',
    options: [
      { id: 'o_a', label: 'Alpha' },
      { id: 'o_b', label: 'Beta' },
    ],
    enabled: true,
    ...overrides,
  }
}

function booleanField(overrides: Partial<CustomFieldDef> = {}): CustomFieldDef {
  return { id: 'f_billable', label: 'Billable', type: 'boolean', enabled: true, ...overrides }
}

function textField(overrides: Partial<CustomFieldDef> = {}): CustomFieldDef {
  return { id: 'f_ref', label: 'Reference', type: 'text', enabled: true, ...overrides }
}

/** Minimal transaction — only the fields the dimension extractors read. */
function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txId: 'tx1',
    date: '01-03-2026',
    name: 'Lunch',
    totalAmount: 10,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 10,
    paidBy: [{ travelMemberId: 'm1', amount: 10 }],
    beneficiaries: [{ travelMemberId: 'm1', amount: 10 }],
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: null as never,
    lastModifiedAt: null as never,
    lastModifiedBy: 'u1',
    ...overrides,
  }
}

const keys = (dims: FilterDimension[]) => dims.map((d) => d.key)

// ---------------------------------------------------------------------------
// filterDimensions — config gating
// ---------------------------------------------------------------------------

describe('filterDimensions', () => {
  it('a legacy space yields exactly today\'s four built-ins, in display order', () => {
    const space = legacySpace()
    expect(keys(filterDimensions(space, getSpaceConfig(space))))
      .toEqual(['category', 'country', 'city', 'paymentMethod'])
  })

  it('a solo-preset space yields category and payment method only', () => {
    const config = configFromPreset('solo')
    expect(keys(filterDimensions(spaceWithConfig(config), config)))
      .toEqual(['category', 'paymentMethod'])
  })

  it('a group-preset space yields category only', () => {
    const config = configFromPreset('group')
    expect(keys(filterDimensions(spaceWithConfig(config), config))).toEqual(['category'])
  })

  it('enabled custom select and boolean fields appear after the built-ins, in definition order', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'),
      customFields: [booleanField(), selectField()],
    }
    expect(keys(filterDimensions(spaceWithConfig(config), config)))
      .toEqual(['category', 'f_billable', 'f_project'])
  })

  it('custom text fields are not dimensions', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'),
      customFields: [textField(), selectField()],
    }
    expect(keys(filterDimensions(spaceWithConfig(config), config))).toEqual(['category', 'f_project'])
  })

  it('disabled custom fields are absent', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'),
      customFields: [selectField({ enabled: false }), booleanField()],
    }
    expect(keys(filterDimensions(spaceWithConfig(config), config))).toEqual(['category', 'f_billable'])
  })

  it('a custom select dimension carries option IDS, never labels', () => {
    const config: SpaceConfig = { ...configFromPreset('group'), customFields: [selectField()] }
    const dim = filterDimensions(spaceWithConfig(config), config).find((d) => d.key === 'f_project')!
    expect(dim.options.map((o) => o.id)).toEqual(['o_a', 'o_b'])
    expect(dim.options.map((o) => o.label)).toEqual(['Alpha', 'Beta'])
    expect(dim.control).toBe('multi')
    expect(dim.optionsAreClosed).toBe(true)
  })

  it('a custom boolean dimension is tri-state with Yes/No options', () => {
    const config: SpaceConfig = { ...configFromPreset('group'), customFields: [booleanField()] }
    const dim = filterDimensions(spaceWithConfig(config), config).find((d) => d.key === 'f_billable')!
    expect(dim.control).toBe('triState')
    expect(dim.options).toEqual([
      { id: BOOL_TRUE, label: 'Yes' },
      { id: BOOL_FALSE, label: 'No' },
    ])
  })

  it('built-in options come from the observed values and are not treated as closed', () => {
    const space = legacySpace()
    const dims = filterDimensions(space, getSpaceConfig(space), {
      category: ['Food', UNDEFINED_FILTER],
    })
    const category = dims.find((d) => d.key === 'category')!
    expect(category.options).toEqual([
      { id: 'Food', label: 'Food' },
      { id: UNDEFINED_FILTER, label: 'Undefined' },
    ])
    expect(category.optionsAreClosed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// allFilterDimensions — core dimensions interleaved with the built-ins
// ---------------------------------------------------------------------------

describe('allFilterDimensions', () => {
  it('a legacy multi-member space renders the historical dimension order', () => {
    const space = legacySpace()
    expect(keys(allFilterDimensions(space, getSpaceConfig(space), false)))
      .toEqual(['type', 'category', 'currency', 'country', 'city', 'paymentMethod', 'paidBy', 'beneficiaries'])
  })

  it('a solo space drops the member dimensions', () => {
    const space = legacySpace()
    const dims = keys(allFilterDimensions(space, getSpaceConfig(space), true))
    expect(dims).not.toContain('paidBy')
    expect(dims).not.toContain('beneficiaries')
  })

  it('a solo-preset space has no country, city or currency dimension', () => {
    const config = configFromPreset('solo')
    const dims = keys(allFilterDimensions(spaceWithConfig(config), config, true))
    expect(dims).toEqual(['type', 'category', 'paymentMethod'])
  })

  it('keeps the type dimension when wallets are off, so existing withdrawals stay filterable', () => {
    const config = configFromPreset('solo') // wallets: false
    expect(keys(allFilterDimensions(spaceWithConfig(config), config, true))).toContain('type')
  })

  it('resolves member ids to display names in the option labels', () => {
    const space = legacySpace()
    const dims = allFilterDimensions(space, getSpaceConfig(space), false, { paidBy: ['m1', 'mX'] })
    const paidBy = dims.find((d) => d.key === 'paidBy')!
    // Unknown ids fall back to the raw value rather than blanking out
    expect(paidBy.options).toEqual([
      { id: 'm1', label: 'Alice' },
      { id: 'mX', label: 'mX' },
    ])
  })

  it('labels transaction types for display', () => {
    const space = legacySpace()
    const dims = allFilterDimensions(space, getSpaceConfig(space), true, { type: ['expense', 'withdrawal'] })
    expect(dims.find((d) => d.key === 'type')!.options.map((o) => o.label))
      .toEqual(['Expense', 'Withdrawal'])
  })
})

// ---------------------------------------------------------------------------
// searchableCustomFieldIds
// ---------------------------------------------------------------------------

describe('searchableCustomFieldIds', () => {
  it('returns enabled text fields only', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'),
      customFields: [
        textField(),
        selectField(),
        textField({ id: 'f_off', label: 'Old ref', enabled: false }),
      ],
    }
    expect(searchableCustomFieldIds(config)).toEqual(['f_ref'])
  })
})

// ---------------------------------------------------------------------------
// Predicate — custom fields
// ---------------------------------------------------------------------------

describe('filter predicate — custom select', () => {
  const config: SpaceConfig = { ...configFromPreset('group'), customFields: [selectField()] }
  const dim = filterDimensions(spaceWithConfig(config), config).find((d) => d.key === 'f_project')!

  it('matches on the stored option id', () => {
    const tx = makeTx({ custom: { f_project: 'o_a' } })
    expect(matchesDimension(tx, dim, new Set(['o_a']))).toBe(true)
  })

  it('does NOT match on the option label', () => {
    const tx = makeTx({ custom: { f_project: 'o_a' } })
    expect(matchesDimension(tx, dim, new Set(['Alpha']))).toBe(false)
  })

  it('does not match a transaction with no value for the field', () => {
    expect(matchesDimension(makeTx(), dim, new Set(['o_a']))).toBe(false)
  })

  it('is OR within the dimension', () => {
    const tx = makeTx({ custom: { f_project: 'o_b' } })
    expect(matchesDimension(tx, dim, new Set(['o_a', 'o_b']))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The "no value" sentinel on a custom select — the dashboard drill-down path
// ---------------------------------------------------------------------------

describe('custom select — the Undefined sentinel', () => {
  const config: SpaceConfig = { ...configFromPreset('group'), customFields: [selectField()] }
  const space = spaceWithConfig(config)
  // A space where some transaction has no value for the field, as observed by
  // the hook from the full transaction list.
  const observed = { f_project: [UNDEFINED_FILTER] }

  it('a transaction with no value reports the sentinel, not nothing', () => {
    const dim = filterDimensions(space, config, observed).find((d) => d.key === 'f_project')!
    expect(dimensionValues(makeTx(), dim)).toEqual([UNDEFINED_FILTER])
    expect(dimensionValues(makeTx({ custom: { f_project: '' } }), dim)).toEqual([UNDEFINED_FILTER])
    expect(dimensionValues(makeTx({ custom: { f_project: 'o_a' } }), dim)).toEqual(['o_a'])
  })

  it('the sentinel matches exactly the transactions the dashboard counted as missing', () => {
    const dim = filterDimensions(space, config, observed).find((d) => d.key === 'f_project')!
    const only = new Set([UNDEFINED_FILTER])
    expect(matchesDimension(makeTx(), dim, only)).toBe(true)
    expect(matchesDimension(makeTx({ custom: { f_project: 'o_a' } }), dim, only)).toBe(false)
  })

  it('is offered as an option only when some transaction lacks a value', () => {
    const withMissing = filterDimensions(space, config, observed).find((d) => d.key === 'f_project')!
    expect(withMissing.options.map((o) => o.id)).toEqual(['o_a', 'o_b', UNDEFINED_FILTER])

    const noneMissing = filterDimensions(space, config, {}).find((d) => d.key === 'f_project')!
    expect(noneMissing.options.map((o) => o.id)).toEqual(['o_a', 'o_b'])
  })

  it('survives reconciliation on a closed dimension', () => {
    // ⚠️ The regression: the sentinel is not one of the field's defined options,
    // so a closed dimension found no legal value and dropped the whole filter —
    // the drill-down then showed every transaction rather than the missing ones.
    const dims = filterDimensions(space, config, observed)
    const filters: FilterState = { f_project: new Set([UNDEFINED_FILTER]) }
    expect(reconcileFilters(filters, dims)).toBe(filters)
  })
})

describe('filter predicate — custom boolean (absent means false)', () => {
  const config: SpaceConfig = { ...configFromPreset('group'), customFields: [booleanField()] }
  const dim = filterDimensions(spaceWithConfig(config), config).find((d) => d.key === 'f_billable')!

  const txTrue = makeTx({ custom: { f_billable: true } })
  const txExplicitFalse = makeTx({ custom: { f_billable: false } })
  const txAbsentKey = makeTx({ custom: { f_project: 'o_a' } })
  const txNoCustomMap = makeTx() // saved before the field existed

  it('"yes" matches only explicitly-true transactions', () => {
    const yes = new Set([BOOL_TRUE])
    expect(matchesDimension(txTrue, dim, yes)).toBe(true)
    expect(matchesDimension(txExplicitFalse, dim, yes)).toBe(false)
    expect(matchesDimension(txAbsentKey, dim, yes)).toBe(false)
    expect(matchesDimension(txNoCustomMap, dim, yes)).toBe(false)
  })

  it('"no" matches explicit false AND an absent key AND an absent custom map', () => {
    const no = new Set([BOOL_FALSE])
    expect(matchesDimension(txExplicitFalse, dim, no)).toBe(true)
    expect(matchesDimension(txAbsentKey, dim, no)).toBe(true)
    expect(matchesDimension(txNoCustomMap, dim, no)).toBe(true)
    expect(matchesDimension(txTrue, dim, no)).toBe(false)
  })

  it('"any" (empty selection) is not a filter at all — every transaction extracts a value', () => {
    // An empty Set is never stored in filter state; the equivalent assertion is
    // that every transaction yields exactly one of the two tri-state values.
    for (const tx of [txTrue, txExplicitFalse, txAbsentKey, txNoCustomMap]) {
      expect(dimensionValues(tx, dim)).toHaveLength(1)
    }
  })
})

describe('filter predicate — built-ins', () => {
  const space = legacySpace()
  const dims = allFilterDimensions(space, getSpaceConfig(space), false)
  const byKey = (k: string) => dims.find((d) => d.key === k)!

  it('an empty optional field matches the Undefined sentinel', () => {
    expect(matchesDimension(makeTx(), byKey('category'), new Set([UNDEFINED_FILTER]))).toBe(true)
    expect(matchesDimension(makeTx({ category: 'Food' }), byKey('category'), new Set([UNDEFINED_FILTER]))).toBe(false)
  })

  it('member dimensions match any of the transaction\'s splits', () => {
    const tx = makeTx({ beneficiaries: [
      { travelMemberId: 'm1', amount: 5 },
      { travelMemberId: 'm2', amount: 5 },
    ] })
    expect(matchesDimension(tx, byKey('beneficiaries'), new Set(['m2']))).toBe(true)
    expect(matchesDimension(tx, byKey('beneficiaries'), new Set(['m3']))).toBe(false)
  })

  it('type falls back to expense on legacy documents', () => {
    expect(dimensionValues(makeTx(), byKey('type'))).toEqual(['expense'])
  })
})

// ---------------------------------------------------------------------------
// reconcileFilters (§3)
// ---------------------------------------------------------------------------

describe('reconcileFilters', () => {
  const config: SpaceConfig = {
    ...configFromPreset('group'),
    customFields: [selectField(), booleanField()],
  }
  const space = spaceWithConfig(config)
  const dims = allFilterDimensions(space, config, false, { category: ['Food'] })

  it('removes a filter whose dimension no longer exists', () => {
    const filters: FilterState = { country: new Set(['🇯🇵 Japan']), category: new Set(['Food']) }
    // `dims` comes from a group-preset space: no country dimension.
    const next = reconcileFilters(filters, dims)
    expect(next.country).toBeUndefined()
    expect(next.category).toBe(filters.category) // untouched, same reference
  })

  it('removes a filter on a disabled custom field', () => {
    const disabled: SpaceConfig = { ...config, customFields: [selectField({ enabled: false })] }
    const next = reconcileFilters(
      { f_project: new Set(['o_a']) },
      allFilterDimensions(space, disabled, false),
    )
    expect(next).toEqual({})
  })

  it('drops a deleted option while sibling selections survive', () => {
    const shrunk: SpaceConfig = {
      ...config,
      customFields: [selectField({ options: [{ id: 'o_a', label: 'Alpha' }] })],
    }
    const next = reconcileFilters(
      { f_project: new Set(['o_a', 'o_b']) },
      allFilterDimensions(space, shrunk, false),
    )
    expect(Array.from(next.f_project!)).toEqual(['o_a'])
  })

  it('drops the dimension entirely when every selected option was deleted', () => {
    const shrunk: SpaceConfig = { ...config, customFields: [selectField({ options: [] })] }
    const next = reconcileFilters(
      { f_project: new Set(['o_a']) },
      allFilterDimensions(space, shrunk, false),
    )
    expect(next.f_project).toBeUndefined()
  })

  it('keeps a built-in selection whose value is not currently observed', () => {
    // Built-in options are observations, not a definition: a category that no
    // transaction currently uses must not silently clear the user's filter.
    const filters: FilterState = { category: new Set(['Transport']) }
    expect(reconcileFilters(filters, dims)).toBe(filters)
  })

  it('returns the SAME object when nothing changed', () => {
    const filters: FilterState = { category: new Set(['Food']), f_project: new Set(['o_a']) }
    expect(reconcileFilters(filters, dims)).toBe(filters)
  })

  it('renaming an option keeps the filter working (ids are stable)', () => {
    const renamed: SpaceConfig = {
      ...config,
      customFields: [selectField({ options: [{ id: 'o_a', label: 'Alpha renamed' }] })],
    }
    const filters: FilterState = { f_project: new Set(['o_a']) }
    expect(reconcileFilters(filters, allFilterDimensions(space, renamed, false))).toBe(filters)
  })

  it('drops an empty selection set', () => {
    const next = reconcileFilters({ category: new Set<string>() }, dims)
    expect(next).toEqual({})
  })
})
