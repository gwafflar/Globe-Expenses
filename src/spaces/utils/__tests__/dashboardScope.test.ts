// dashboardScope.test.ts — the scoped pipeline (Phase 7a §1).
//
// Everything here is pure: no DOM, no Firestore, no wall-clock dependency
// (resolveRange takes an injectable `now`).

import { describe, it, expect } from 'vitest'
import type { Transaction } from '@/transactions/types'
import type { Space, SpaceConfig } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import { configFromPreset } from '@/spaces/presets'
import { computeBalances } from '@/spaces/utils/balanceUtils'
import { resolveRange, ALL_TIME, isDateInRange, rangeDayCount } from '@/shared/utils/dateRange'
import {
  ALL_MEMBERS,
  scopeTransactions,
  scopedTotal,
  attributedAmount,
  defaultRangePreset,
} from '../dashboardScope'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALICE = 'm-alice'
const BOB = 'm-bob'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    txId: 'tx-' + Math.random().toString(36).slice(2),
    date: '10-06-2026',
    name: 'Test',
    totalAmount: 100,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 100,
    paidBy: [{ travelMemberId: ALICE, amount: 100 }],
    beneficiaries: [
      { travelMemberId: ALICE, amount: 50 },
      { travelMemberId: BOB, amount: 50 },
    ],
    createdBy: { type: 'user', uid: 'u-alice' },
    createdAt: null as unknown as Transaction['createdAt'],
    lastModifiedAt: null as unknown as Transaction['lastModifiedAt'],
    lastModifiedBy: 'u-alice',
    ...overrides,
  }
}

const OPTS_ALL = { range: ALL_TIME, mode: ALL_MEMBERS, mainCurrency: 'EUR' }
/** Scoped to one member — the pipeline only ever sees a travelMemberId here,
 *  never the string 'you'. */
const OPTS_ALICE = { ...OPTS_ALL, mode: ALICE }
const OPTS_BOB = { ...OPTS_ALL, mode: BOB }

// ---------------------------------------------------------------------------
// Exclusion rule
// ---------------------------------------------------------------------------

describe('scopeTransactions — which transactions are included', () => {
  it('excludes transfers and withdrawals for every member selection', () => {
    const txs = [
      makeTx({ type: 'expense' }),
      makeTx({ type: 'transfer' }),
      makeTx({ type: 'withdrawal' }),
    ]

    expect(scopeTransactions(txs, OPTS_ALL)).toHaveLength(1)
    expect(scopeTransactions(txs, OPTS_ALICE)).toHaveLength(1)
    expect(scopeTransactions(txs, OPTS_BOB)).toHaveLength(1)
    expect(scopeTransactions(txs, OPTS_ALL)[0].transaction.type).toBe('expense')
  })

  it('treats an undefined type as an expense (legacy documents)', () => {
    expect(scopeTransactions([makeTx({ type: undefined })], OPTS_ALL)).toHaveLength(1)
  })

  it('includes expense-mode adjustments and excludes balance-only ones', () => {
    // This mirrors countsAsSpending() exactly — the pre-Phase-7a dashboard rule,
    // reused rather than restated.
    const txs = [
      makeTx({ type: 'adjustment', adjustmentMode: 'expense' }),
      makeTx({ type: 'adjustment', adjustmentMode: 'balance_only' }),
      makeTx({ type: 'adjustment' }), // no mode → not spending
    ]
    const scoped = scopeTransactions(txs, OPTS_ALL)
    expect(scoped).toHaveLength(1)
    expect(scoped[0].transaction.adjustmentMode).toBe('expense')
  })
})

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

describe('scopeTransactions — attribution', () => {
  it('ALL_MEMBERS sums totalAmountMain', () => {
    const txs = [makeTx({ totalAmountMain: 100 }), makeTx({ totalAmountMain: 42.5 })]
    expect(scopedTotal(scopeTransactions(txs, OPTS_ALL))).toBeCloseTo(142.5)
  })

  it('a member id uses that member share from the splits, converted at the tx rate', () => {
    // 300 MYR at 0.2 → 60 EUR total; Alice's beneficiary share is 100 MYR → 20 EUR.
    const tx = makeTx({
      currency: 'MYR',
      totalAmount: 300,
      exchangeRate: 0.2,
      totalAmountMain: 60,
      beneficiaries: [
        { travelMemberId: ALICE, amount: 100 },
        { travelMemberId: BOB, amount: 200 },
      ],
    })
    expect(attributedAmount(tx, ALL_MEMBERS)).toBeCloseTo(60)
    expect(attributedAmount(tx, ALICE)).toBeCloseTo(20)
    // Any member, not just the logged-in one — the pipeline has no notion of
    // "current user" at all.
    expect(attributedAmount(tx, BOB)).toBeCloseTo(40)
  })

  it('attributes 0 when the selected member is not a beneficiary', () => {
    const tx = makeTx({ beneficiaries: [{ travelMemberId: BOB, amount: 100 }] })
    expect(attributedAmount(tx, ALICE)).toBe(0)
  })

  it('attributes an unclaimed member slot like any other', () => {
    // A slot with userId === null still holds splits; nothing here consults it.
    const GHOST = 'm-ghost'
    const tx = makeTx({
      totalAmountMain: 90,
      beneficiaries: [
        { travelMemberId: ALICE, amount: 30 },
        { travelMemberId: GHOST, amount: 60 },
      ],
    })
    expect(attributedAmount(tx, GHOST)).toBeCloseTo(60)
  })

  it('member-scoped totals agree with the balance calculation for the same member', () => {
    // The consumed leg of computeBalances() is exactly what a member-scoped
    // attribution produces, so a breakdown card's total must reconcile with the
    // Balance tab — for ANY member, not only the logged-in one.
    const txs = [
      makeTx({ totalAmount: 100, totalAmountMain: 100 }),
      makeTx({
        totalAmount: 60,
        totalAmountMain: 60,
        paidBy: [{ travelMemberId: BOB, amount: 60 }],
        beneficiaries: [
          { travelMemberId: ALICE, amount: 20 },
          { travelMemberId: BOB, amount: 40 },
        ],
      }),
    ]
    const members = [
      { travelMemberId: ALICE, displayName: 'Alice', userId: 'u-alice', allowRename: true, joinedAt: null },
      { travelMemberId: BOB, displayName: 'Bob', userId: 'u-bob', allowRename: true, joinedAt: null },
    ] as unknown as Space['members']

    const balances = computeBalances(txs, members)

    // net = paid − consumed, so consumed = paid − net.
    const aliceConsumed = scopedTotal(scopeTransactions(txs, OPTS_ALICE))
    const aliceNet = balances.find((b) => b.memberId === ALICE)!.net
    expect(aliceConsumed).toBeCloseTo(100 - aliceNet) // Alice paid 100
    expect(aliceConsumed).toBeCloseTo(70) // 50 + 20

    const bobConsumed = scopedTotal(scopeTransactions(txs, OPTS_BOB))
    const bobNet = balances.find((b) => b.memberId === BOB)!.net
    expect(bobConsumed).toBeCloseTo(60 - bobNet) // Bob paid 60
    expect(bobConsumed).toBeCloseTo(90) // 50 + 40

    // The two member shares partition the group total.
    expect(aliceConsumed + bobConsumed).toBeCloseTo(scopedTotal(scopeTransactions(txs, OPTS_ALL)))
  })
})

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

describe('date range filtering', () => {
  const NOW = new Date(2026, 5, 15, 13, 30) // 15 June 2026, mid-afternoon

  it('resolves "this month" to the 1st → today, inclusive of both boundaries', () => {
    const range = resolveRange('month', undefined, NOW)
    expect(isDateInRange('01-06-2026', range)).toBe(true)  // first day
    expect(isDateInRange('15-06-2026', range)).toBe(true)  // today
    expect(isDateInRange('31-05-2026', range)).toBe(false) // day before
    expect(isDateInRange('16-06-2026', range)).toBe(false) // tomorrow
  })

  it('resolves "last 30 days" to a 30-day window ending today', () => {
    const range = resolveRange('last30', undefined, NOW)
    expect(rangeDayCount(range, 0)).toBe(30)
    expect(isDateInRange('17-05-2026', range)).toBe(true)  // 29 days back
    expect(isDateInRange('16-05-2026', range)).toBe(false) // 30 days back
    expect(isDateInRange('15-06-2026', range)).toBe(true)
  })

  it('"all time" includes everything', () => {
    const range = resolveRange('all', undefined, NOW)
    expect(isDateInRange('01-01-1999', range)).toBe(true)
    expect(isDateInRange('31-12-2099', range)).toBe(true)
  })

  it('does NOT compare the DD-MM-YYYY strings lexicographically', () => {
    // "02-01-2026" < "31-12-2025" as strings, but is chronologically later.
    const range = resolveRange('custom', {
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 31),
    }, NOW)
    expect(isDateInRange('02-01-2026', range)).toBe(true)
    expect(isDateInRange('31-12-2025', range)).toBe(false)
  })

  it('custom ranges include both boundary dates', () => {
    const range = resolveRange('custom', {
      from: new Date(2026, 5, 10),
      to: new Date(2026, 5, 12),
    }, NOW)
    expect(isDateInRange('10-06-2026', range)).toBe(true)
    expect(isDateInRange('12-06-2026', range)).toBe(true)
    expect(isDateInRange('09-06-2026', range)).toBe(false)
    expect(isDateInRange('13-06-2026', range)).toBe(false)
  })

  it('scopeTransactions applies the range', () => {
    const txs = [makeTx({ date: '01-06-2026' }), makeTx({ date: '20-06-2026' })]
    const range = resolveRange('custom', {
      from: new Date(2026, 5, 15),
      to: new Date(2026, 5, 30),
    }, NOW)
    const scoped = scopeTransactions(txs, { ...OPTS_ALL, range })
    expect(scoped).toHaveLength(1)
    expect(scoped[0].transaction.date).toBe('20-06-2026')
  })
})

// ---------------------------------------------------------------------------
// Default range preset
// ---------------------------------------------------------------------------

describe('defaultRangePreset', () => {
  /** A legacy space document: no `config`, no `settings`. */
  const legacySpace = { currencies: [], members: [] } as unknown as Space

  it('defaults a legacy space to all time (today\'s behaviour)', () => {
    expect(defaultRangePreset(getSpaceConfig(legacySpace))).toBe('all')
  })

  it('defaults a travel-preset space to all time', () => {
    expect(defaultRangePreset(configFromPreset('travel'))).toBe('all')
  })

  it('defaults solo / group / custom spaces to this month', () => {
    for (const preset of ['solo', 'group', 'custom'] as const) {
      expect(defaultRangePreset(configFromPreset(preset))).toBe('month')
    }
  })

  it('reads config only — never the preset badge', () => {
    // A space labelled 'travel' but configured like a budget must behave like a
    // budget (SPEC §8 invariant 4).
    const budgetish: SpaceConfig = {
      ...configFromPreset('solo'),
    }
    expect(defaultRangePreset(budgetish)).toBe('month')
  })
})
