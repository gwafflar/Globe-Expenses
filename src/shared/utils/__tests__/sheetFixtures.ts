// sheetFixtures.ts — the five fixture spaces the Phase 8 round-trip tests assert on.
//
// Not a test file itself (no .test suffix, so vitest does not collect it).
// Shared by the metadata, column-map, analysis and round-trip suites so all of
// them exercise the SAME spaces — a fixture that only one suite uses is a
// fixture whose regressions only one suite catches.

import type { Timestamp } from 'firebase/firestore'
import type {
  CustomFieldDef,
  DashboardCardDef,
  LabeledItem,
  Space,
  SpaceConfig,
  SpaceMember,
} from '@/spaces/types'
import type { Transaction } from '@/transactions/types'
import { configFromPreset } from '@/spaces/presets'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Firestore Timestamps are irrelevant to the sheet layer — every code path
 *  under test reads dates from Transaction.date, never from these. */
const TS = null as unknown as Timestamp

export function member(travelMemberId: string, displayName: string): SpaceMember {
  return { travelMemberId, displayName, userId: null, allowRename: true, joinedAt: TS }
}

export function labeled(id: string, label: string, emoji?: string): LabeledItem {
  return emoji ? { id, label, emoji } : { id, label }
}

export function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txId: 'tx-1',
    date: '10-06-2026',
    name: 'Test expense',
    totalAmount: 10,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 10,
    paidBy: [],
    beneficiaries: [],
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: TS,
    lastModifiedAt: TS,
    lastModifiedBy: 'u1',
    ...overrides,
  } as Transaction
}

export function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    spaceId: 'space-1',
    name: 'Test space',
    members: [member('m1', 'Alice')],
    memberUids: [],
    createdBy: 'u1',
    createdAt: TS,
    currencies: ['EUR'],
    mainCurrency: 'EUR',
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
    archivedByUids: [],
    ...overrides,
  } as Space
}

/** An equal 2-way split of `amount` between two members. */
function splitEqually(amount: number, ids: string[]) {
  const each = Math.round((amount / ids.length) * 100) / 100
  return ids.map((travelMemberId) => ({ travelMemberId, amount: each }))
}

// ---------------------------------------------------------------------------
// Fixture 1 — legacy space (no `config` at all)
// ---------------------------------------------------------------------------
//
// The regression that matters most: getSpaceConfig() must resolve this to full
// travel-mode defaults, so the export is materially identical to pre-refactor.

export function legacySpace(): { space: Space; transactions: Transaction[] } {
  const space = makeSpace({
    spaceId: 'legacy-1',
    name: 'Japan 2025',
    emoji: '🗾',
    members: [member('m1', 'Alice'), member('m2', 'Bob')],
    currencies: ['EUR', 'JPY'],
    categories: [labeled('c1', 'Food', '🍽️'), labeled('c2', 'Transport', '🚆')],
    paymentMethods: [labeled('p1', 'Cash'), labeled('p2', 'Card')],
    countries: [labeled('co1', 'Japan', '🇯🇵')],
    cities: [labeled('ci1', 'Tokyo')],
    // NO config, NO presetOrigin — this is the whole point of the fixture.
  })

  const transactions = [
    makeTx({
      txId: 'lt1',
      date: '03-05-2025',
      name: 'Ramen',
      totalAmount: 1200,
      currency: 'JPY',
      exchangeRate: 0.0062,
      totalAmountMain: 7.44,
      // ⚠️ category carries its emoji prefix; country does NOT. That asymmetry
      // is real (see audit finding F7) and the Analysis formulas depend on it.
      category: '🍽️ Food',
      country: 'Japan',
      city: 'Tokyo',
      paymentMethod: 'Cash',
      notes: 'Tonkotsu',
      paidBy: [{ travelMemberId: 'm1', amount: 1200 }],
      beneficiaries: splitEqually(1200, ['m1', 'm2']),
    }),
    makeTx({
      txId: 'lt2',
      date: '04-05-2025',
      name: 'Metro',
      totalAmount: 400,
      currency: 'JPY',
      exchangeRate: 0.0062,
      totalAmountMain: 2.48,
      category: '🚆 Transport',
      country: 'Japan',
      city: 'Tokyo',
      paidBy: [{ travelMemberId: 'm2', amount: 400 }],
      beneficiaries: splitEqually(400, ['m1', 'm2']),
    }),
  ]

  return { space, transactions }
}

// ---------------------------------------------------------------------------
// Fixture 2 — travel space: all built-ins, two currencies, three members
// ---------------------------------------------------------------------------

export function travelSpace(): { space: Space; transactions: Transaction[] } {
  const config: SpaceConfig = {
    ...configFromPreset('travel'),
    dashboardCards: [
      { id: 'card-cat', dimensions: ['category'] },
      { id: 'card-country', dimensions: ['country'] },
    ],
  }

  const space = makeSpace({
    spaceId: 'travel-1',
    name: 'Portugal 2026',
    emoji: '🌍',
    presetOrigin: 'travel',
    startDate: '2026-04-01',
    endDate: '2026-04-14',
    members: [member('m1', 'Alice'), member('m2', 'Bob'), member('m3', 'Carla')],
    currencies: ['EUR', 'GBP'],
    mainCurrency: 'EUR',
    categories: [labeled('c1', 'Food', '🍽️'), labeled('c2', 'Lodging', '🏨')],
    paymentMethods: [labeled('p1', 'Cash'), labeled('p2', 'Card')],
    countries: [labeled('co1', 'Portugal', '🇵🇹'), labeled('co2', 'Spain', '🇪🇸')],
    cities: [labeled('ci1', 'Lisbon'), labeled('ci2', 'Porto')],
    config,
  })

  const transactions = [
    makeTx({
      txId: 't1',
      date: '02-04-2026',
      name: 'Dinner',
      totalAmount: 60,
      currency: 'EUR',
      exchangeRate: 1,
      totalAmountMain: 60,
      category: '🍽️ Food',
      country: 'Portugal',
      city: 'Lisbon',
      paymentMethod: 'Card',
      notes: 'Seafood',
      paidBy: [{ travelMemberId: 'm1', amount: 60 }],
      beneficiaries: splitEqually(60, ['m1', 'm2', 'm3']),
    }),
    makeTx({
      txId: 't2',
      date: '05-04-2026',
      name: 'Hostel',
      totalAmount: 90,
      currency: 'GBP',
      exchangeRate: 1.17,
      totalAmountMain: 105.3,
      category: '🏨 Lodging',
      country: 'Spain',
      city: 'Porto',
      paymentMethod: 'Card',
      paidBy: [{ travelMemberId: 'm2', amount: 90 }],
      beneficiaries: splitEqually(90, ['m1', 'm2', 'm3']),
    }),
    makeTx({
      txId: 't3',
      date: '06-04-2026',
      name: 'Coffee',
      totalAmount: 9,
      currency: 'EUR',
      exchangeRate: 1,
      totalAmountMain: 9,
      category: '🍽️ Food',
      country: 'Portugal',
      city: 'Porto',
      paymentMethod: 'Cash',
      paidBy: [{ travelMemberId: 'm3', amount: 9 }],
      beneficiaries: splitEqually(9, ['m1', 'm2', 'm3']),
    }),
  ]

  return { space, transactions }
}

// ---------------------------------------------------------------------------
// Fixture 3 — all three custom field types, populated
// ---------------------------------------------------------------------------

export const CUSTOM_SELECT: CustomFieldDef = {
  id: 'cf-trip',
  label: 'Trip leg',
  emoji: '🧭',
  type: 'select',
  options: [
    labeled('opt-north', 'Northern leg'),
    labeled('opt-south', 'Southern leg', '🌞'),
  ],
  enabled: true,
}

export const CUSTOM_BOOL: CustomFieldDef = {
  id: 'cf-reimb',
  label: 'Reimbursable',
  type: 'boolean',
  enabled: true,
}

export const CUSTOM_TEXT: CustomFieldDef = {
  id: 'cf-ref',
  label: 'Receipt ref',
  type: 'text',
  enabled: true,
}

export function customFieldsSpace(): { space: Space; transactions: Transaction[] } {
  const config: SpaceConfig = {
    ...configFromPreset('travel'),
    customFields: [CUSTOM_SELECT, CUSTOM_BOOL, CUSTOM_TEXT],
    dashboardCards: [
      { id: 'card-cat', dimensions: ['category'] },
      { id: 'card-trip', dimensions: [CUSTOM_SELECT.id] },
      { id: 'card-pivot', dimensions: ['category', CUSTOM_SELECT.id] },
    ] satisfies DashboardCardDef[],
  }

  const space = makeSpace({
    spaceId: 'custom-1',
    name: 'Field test',
    presetOrigin: 'travel',
    members: [member('m1', 'Alice'), member('m2', 'Bob')],
    currencies: ['EUR'],
    categories: [labeled('c1', 'Food', '🍽️'), labeled('c2', 'Gear')],
    paymentMethods: [labeled('p1', 'Card')],
    countries: [labeled('co1', 'France', '🇫🇷')],
    cities: [labeled('ci1', 'Lyon')],
    config,
  })

  const transactions = [
    makeTx({
      txId: 'cf1',
      name: 'Tent',
      totalAmount: 200,
      totalAmountMain: 200,
      category: '🍽️ Food',
      country: 'France',
      city: 'Lyon',
      paymentMethod: 'Card',
      paidBy: [{ travelMemberId: 'm1', amount: 200 }],
      beneficiaries: splitEqually(200, ['m1', 'm2']),
      // ⚠️ select stores the OPTION ID, never the label (SPEC §8 invariant 6).
      custom: { [CUSTOM_SELECT.id]: 'opt-north', [CUSTOM_BOOL.id]: true, [CUSTOM_TEXT.id]: 'R-0042' },
    }),
    makeTx({
      txId: 'cf2',
      name: 'Rope',
      totalAmount: 35,
      totalAmountMain: 35,
      category: 'Gear',
      country: 'France',
      paymentMethod: 'Card',
      paidBy: [{ travelMemberId: 'm2', amount: 35 }],
      beneficiaries: splitEqually(35, ['m1', 'm2']),
      // No boolean key at all — buildCustomPayload() omits `false`, so this
      // must still export as `no` and re-import as absent.
      custom: { [CUSTOM_SELECT.id]: 'opt-south', [CUSTOM_TEXT.id]: 'R-0043' },
    }),
  ]

  return { space, transactions }
}

// ---------------------------------------------------------------------------
// Fixture 4 — a DISABLED field that still holds values
// ---------------------------------------------------------------------------
//
// Both flavours at once: a disabled built-in (city) and a disabled custom
// field, each with stored values on at least one transaction.

export const DISABLED_CUSTOM: CustomFieldDef = {
  id: 'cf-old',
  label: 'Old tag',
  type: 'select',
  options: [labeled('opt-a', 'Alpha'), labeled('opt-b', 'Beta')],
  enabled: false,
}

export function disabledFieldSpace(): { space: Space; transactions: Transaction[] } {
  const base = configFromPreset('travel')
  const config: SpaceConfig = {
    ...base,
    builtInFields: { ...base.builtInFields, city: false },
    customFields: [CUSTOM_SELECT, DISABLED_CUSTOM],
    dashboardCards: [{ id: 'card-cat', dimensions: ['category'] }],
  }

  const space = makeSpace({
    spaceId: 'disabled-1',
    name: 'Legacy tags',
    members: [member('m1', 'Alice')],
    categories: [labeled('c1', 'Food', '🍽️')],
    countries: [labeled('co1', 'Italy', '🇮🇹')],
    cities: [labeled('ci1', 'Rome')],
    config,
  })

  const transactions = [
    makeTx({
      txId: 'd1',
      name: 'Pizza',
      totalAmount: 12,
      totalAmountMain: 12,
      category: '🍽️ Food',
      country: 'Italy',
      // Values on fields that are currently DISABLED — the export must warn
      // rather than silently drop them.
      city: 'Rome',
      paidBy: [{ travelMemberId: 'm1', amount: 12 }],
      beneficiaries: [{ travelMemberId: 'm1', amount: 12 }],
      custom: { [CUSTOM_SELECT.id]: 'opt-north', [DISABLED_CUSTOM.id]: 'opt-a' },
    }),
    makeTx({
      txId: 'd2',
      name: 'Gelato',
      totalAmount: 4,
      totalAmountMain: 4,
      category: '🍽️ Food',
      country: 'Italy',
      paidBy: [{ travelMemberId: 'm1', amount: 4 }],
      beneficiaries: [{ travelMemberId: 'm1', amount: 4 }],
      custom: { [DISABLED_CUSTOM.id]: 'opt-b' },
    }),
  ]

  return { space, transactions }
}

// ---------------------------------------------------------------------------
// Fixture 5 — solo space: no country, no wallets, single currency
// ---------------------------------------------------------------------------

export function soloSpace(): { space: Space; transactions: Transaction[] } {
  const config: SpaceConfig = {
    ...configFromPreset('solo'),
    dashboardCards: [{ id: 'card-cat', dimensions: ['category'] }],
  }

  const space = makeSpace({
    spaceId: 'solo-1',
    name: 'My budget',
    emoji: '👤',
    presetOrigin: 'solo',
    members: [member('m1', 'Alice')],
    currencies: ['EUR'],
    categories: [labeled('c1', 'Groceries', '🛒'), labeled('c2', 'Rent')],
    paymentMethods: [labeled('p1', 'Card')],
    config,
  })

  const transactions = [
    makeTx({
      txId: 's1',
      name: 'Supermarket',
      totalAmount: 54.2,
      totalAmountMain: 54.2,
      category: '🛒 Groceries',
      paymentMethod: 'Card',
      paidBy: [{ travelMemberId: 'm1', amount: 54.2 }],
      beneficiaries: [{ travelMemberId: 'm1', amount: 54.2 }],
    }),
    makeTx({
      txId: 's2',
      name: 'April rent',
      totalAmount: 800,
      totalAmountMain: 800,
      category: 'Rent',
      paymentMethod: 'Card',
      paidBy: [{ travelMemberId: 'm1', amount: 800 }],
      beneficiaries: [{ travelMemberId: 'm1', amount: 800 }],
    }),
  ]

  return { space, transactions }
}
