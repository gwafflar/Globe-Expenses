// dashboardHelpers.test.ts — unit tests for the pure helper functions.
//
// These tests run in the jsdom environment (see vite.config.ts) but since
// dashboardHelpers.ts has no React or DOM dependencies they would also work
// in a node environment.
//
// Tip for reading these tests: each describe() block covers one exported
// function. The test cases focus on the logic contracts, not implementation
// details, so they stay valid even if the internal date-math is refactored.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import type { Travel } from '@/travels/types'
import {
  filterTransactions,
  getTripDurationDays,
  computeMemberStats,
  normalizeTransactionSplits,
  categoryColor,
  CATEGORY_PALETTE,
  parseTxDate,
  formatAmount,
  formatDayLabel,
  dateRangeLabel,
  numberOfDaysInRange,
} from '../dashboardHelpers'

// ---------------------------------------------------------------------------
// Helpers for building minimal test fixtures
// ---------------------------------------------------------------------------

/**
 * Build a minimal TransactionWithStatus for testing.
 * Only the fields used by dashboardHelpers are set; everything else is cast.
 */
function makeTx(
  date: string, // DD-MM-YYYY
  overrides: Partial<TransactionWithStatus> = {},
): TransactionWithStatus {
  return {
    txId: 'tx-' + Math.random().toString(36).slice(2),
    date,
    name: 'Test',
    totalAmount: 10,
    totalAmountMain: 10,
    currency: 'EUR',
    exchangeRate: 1,
    paidBy: [],
    beneficiaries: [],
    createdBy: { type: 'user', uid: 'user-a' },
    createdAt: null as unknown as TransactionWithStatus['createdAt'],
    lastModifiedAt: null as unknown as TransactionWithStatus['lastModifiedAt'],
    lastModifiedBy: 'user-a',
    isPending: false,
    ...overrides,
  }
}

/** Return today's date as DD-MM-YYYY string (matching transaction format). */
function todayStr(): string {
  const d = new Date()
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getFullYear()),
  ].join('-')
}

/** Return a date N days ago as DD-MM-YYYY string. */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getFullYear()),
  ].join('-')
}

/** Build a minimal Travel fixture. */
function makeTravel(overrides: Partial<Travel> = {}): Travel {
  return {
    travelId: 'travel-1',
    name: 'Test Trip',
    members: [],
    memberUids: [],
    createdBy: 'user-a',
    createdAt: null as unknown as Travel['createdAt'],
    currencies: ['EUR'],
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock Firestore Timestamp for travel.startDate / endDate
// ---------------------------------------------------------------------------

function makeTimestamp(date: Date) {
  return { toDate: () => date } as unknown as Travel['startDate']
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filterTransactions', () => {
  it('all — returns all transactions unchanged', () => {
    const txs = [makeTx(todayStr()), makeTx(daysAgo(10)), makeTx(daysAgo(40))]
    const result = filterTransactions(txs, { type: 'all' })
    expect(result).toHaveLength(3)
    expect(result).toEqual(txs)
  })

  it('today — returns only transactions with today\'s date', () => {
    const txs = [
      makeTx(todayStr()),
      makeTx(todayStr()),
      makeTx(daysAgo(1)),  // yesterday — excluded
      makeTx(daysAgo(5)),  // older — excluded
    ]
    const result = filterTransactions(txs, { type: 'today' })
    expect(result).toHaveLength(2)
    result.forEach((tx) => expect(tx.date).toBe(todayStr()))
  })

  it('days:7 — returns transactions in the last 7 days, excludes older ones', () => {
    const txs = [
      makeTx(todayStr()),     // included (day 0)
      makeTx(daysAgo(3)),     // included (day 3)
      makeTx(daysAgo(6)),     // included (day 6 — last day of the window)
      makeTx(daysAgo(7)),     // excluded (day 7 — just outside the 7-day window)
      makeTx(daysAgo(30)),    // excluded (old)
    ]
    const result = filterTransactions(txs, { type: 'days', n: 7 })
    // Should include days 0–6 (7 days total)
    expect(result).toHaveLength(3)
    const dates = result.map((tx) => tx.date)
    expect(dates).toContain(todayStr())
    expect(dates).toContain(daysAgo(3))
    expect(dates).toContain(daysAgo(6))
  })

  it('custom — returns transactions within from/to range inclusive', () => {
    // Fixed dates to avoid flakiness
    const from = new Date(2025, 2, 1)   // 2025-03-01
    const to   = new Date(2025, 2, 14)  // 2025-03-14

    const txs = [
      makeTx('28-02-2025'), // before range — excluded
      makeTx('01-03-2025'), // from boundary — included
      makeTx('10-03-2025'), // inside range — included
      makeTx('14-03-2025'), // to boundary — included
      makeTx('15-03-2025'), // after range — excluded
    ]

    const result = filterTransactions(txs, { type: 'custom', from, to })
    expect(result).toHaveLength(3)
    const dates = result.map((tx) => tx.date)
    expect(dates).toContain('01-03-2025')
    expect(dates).toContain('10-03-2025')
    expect(dates).toContain('14-03-2025')
  })
})

// ---------------------------------------------------------------------------

describe('getTripDurationDays', () => {
  it('returns correct days when both startDate and endDate are set', () => {
    const start = new Date(2025, 0, 1)   // 2025-01-01
    const end   = new Date(2025, 0, 14)  // 2025-01-14 → 14 days
    const travel = makeTravel({
      startDate: makeTimestamp(start),
      endDate:   makeTimestamp(end),
    })
    expect(getTripDurationDays(travel, [])).toBe(14)
  })

  it('returns span of transactions when no travel dates are set', () => {
    const travel = makeTravel() // no startDate / endDate
    const txs = [
      makeTx('01-03-2025'),  // earliest
      makeTx('10-03-2025'),
      makeTx('15-03-2025'),  // latest → span = 15 days (1st to 15th inclusive)
    ]
    expect(getTripDurationDays(travel, txs)).toBe(15)
  })

  it('returns 30 when no dates and no transactions', () => {
    const travel = makeTravel()
    expect(getTripDurationDays(travel, [])).toBe(30)
  })
})

// ---------------------------------------------------------------------------

describe('computeMemberStats', () => {
  it('correctly computes consumed and paid for a member who both paid and consumed', () => {
    const txs = [
      makeTx(todayStr(), {
        totalAmount: 100,
        totalAmountMain: 100,
        exchangeRate: 1,
        paidBy: [
          { travelMemberId: 'alice', amount: 100 },
        ],
        beneficiaries: [
          { travelMemberId: 'alice', amount: 50 },
          { travelMemberId: 'bob',   amount: 50 },
        ],
      }),
    ]

    const alice = computeMemberStats(txs, 'alice')
    expect(alice.paid).toBeCloseTo(100)
    expect(alice.consumed).toBeCloseTo(50)

    const bob = computeMemberStats(txs, 'bob')
    expect(bob.paid).toBeCloseTo(0)
    expect(bob.consumed).toBeCloseTo(50)
  })

  it('returns zeros for a member not present in any transaction', () => {
    const txs = [
      makeTx(todayStr(), {
        exchangeRate: 1,
        paidBy: [{ travelMemberId: 'alice', amount: 30 }],
        beneficiaries: [{ travelMemberId: 'alice', amount: 30 }],
      }),
    ]
    const result = computeMemberStats(txs, 'charlie')
    expect(result.consumed).toBe(0)
    expect(result.paid).toBe(0)
  })

  it('handles a transaction where one member paid for multiple beneficiaries', () => {
    // Alice paid the full bill; Alice + Bob + Carol are beneficiaries
    const txs = [
      makeTx(todayStr(), {
        totalAmount: 90,
        totalAmountMain: 90,
        exchangeRate: 1,
        paidBy: [{ travelMemberId: 'alice', amount: 90 }],
        beneficiaries: [
          { travelMemberId: 'alice', amount: 30 },
          { travelMemberId: 'bob',   amount: 30 },
          { travelMemberId: 'carol', amount: 30 },
        ],
      }),
    ]

    expect(computeMemberStats(txs, 'alice').paid).toBeCloseTo(90)
    expect(computeMemberStats(txs, 'alice').consumed).toBeCloseTo(30)
    expect(computeMemberStats(txs, 'bob').consumed).toBeCloseTo(30)
    expect(computeMemberStats(txs, 'carol').consumed).toBeCloseTo(30)
  })

  it('applies exchangeRate when computing amounts in main currency', () => {
    // 100 THB at rate 0.027 = 2.70 EUR
    const txs = [
      makeTx(todayStr(), {
        totalAmount: 100,
        currency: 'THB',
        exchangeRate: 0.027,
        totalAmountMain: 100 * 0.027,
        paidBy: [{ travelMemberId: 'alice', amount: 100 }],
        beneficiaries: [{ travelMemberId: 'alice', amount: 100 }],
      }),
    ]

    const result = computeMemberStats(txs, 'alice')
    expect(result.paid).toBeCloseTo(2.7)
    expect(result.consumed).toBeCloseTo(2.7)
  })
})

// ---------------------------------------------------------------------------

describe('categoryColor', () => {
  it('same input always returns same color', () => {
    const color1 = categoryColor('Food')
    const color2 = categoryColor('Food')
    expect(color1).toBe(color2)
  })

  it('different inputs can return different colors', () => {
    // With 6 palette slots and diverse inputs, at least two should differ
    const names  = ['Food', 'Transport', 'Hotels', 'Shopping', 'Entertainment', 'Health']
    const colors = names.map(categoryColor)
    const unique = new Set(colors)
    // Not all inputs map to the same single color
    expect(unique.size).toBeGreaterThan(1)
  })

  it('never returns a value outside CATEGORY_PALETTE', () => {
    const testNames = [
      'Food', 'Hotels', 'Transport', 'Shopping',
      'Alcohol', 'Entertainment', 'Health', 'Tech', 'Misc',
      '', 'Uncategorized', '日本語', '!@#$%',
    ]
    for (const name of testNames) {
      expect(CATEGORY_PALETTE).toContain(categoryColor(name))
    }
  })
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('normalizeTransactionSplits', () => {
  // Build minimal TravelMember fixtures
  function makeMember(userId: string, travelMemberId: string) {
    return {
      travelMemberId,
      displayName: 'Test',
      userId,
      allowRename: true,
      joinedAt: null as unknown as ReturnType<typeof makeTimestamp>,
    }
  }

  it('returns the same array reference when all splits already have travelMemberId', () => {
    const txs = [
      makeTx(todayStr(), {
        paidBy: [{ travelMemberId: 'alice-nanoid', amount: 100 }],
        beneficiaries: [{ travelMemberId: 'alice-nanoid', amount: 100 }],
      }),
    ]
    const members = [makeMember('alice-uid', 'alice-nanoid')]
    const result = normalizeTransactionSplits(txs, members)
    // Same reference — no unnecessary allocation
    expect(result).toBe(txs)
  })

  it('remaps legacy uid splits to travelMemberId using the members lookup', () => {
    // Simulate a pre-refactor transaction: split stored with 'uid', not 'travelMemberId'
    const legacySplit = { uid: 'alice-uid', amount: 100 } as unknown as { travelMemberId: string; amount: number }
    const txs = [
      makeTx(todayStr(), {
        paidBy: [legacySplit],
        beneficiaries: [legacySplit],
      }),
    ]
    const members = [makeMember('alice-uid', 'alice-nanoid')]

    const result = normalizeTransactionSplits(txs, members)

    expect(result[0].paidBy[0].travelMemberId).toBe('alice-nanoid')
    expect(result[0].beneficiaries[0].travelMemberId).toBe('alice-nanoid')
  })

  it('after normalization, computeMemberStats finds paid amounts for legacy splits', () => {
    const legacySplit = { uid: 'alice-uid', amount: 100 } as unknown as { travelMemberId: string; amount: number }
    const txs = [
      makeTx(todayStr(), {
        totalAmountMain: 100,
        exchangeRate: 1,
        paidBy: [legacySplit],
        beneficiaries: [
          legacySplit,
          { uid: 'bob-uid', amount: 0 } as unknown as { travelMemberId: string; amount: number },
        ],
      }),
    ]
    const members = [
      makeMember('alice-uid', 'alice-nanoid'),
      makeMember('bob-uid',   'bob-nanoid'),
    ]

    // Without normalization: paid = 0 (the bug)
    const before = computeMemberStats(txs, 'alice-nanoid')
    expect(before.paid).toBe(0)

    // After normalization: paid = 100 (the fix)
    const normalized = normalizeTransactionSplits(txs, members)
    const after = computeMemberStats(normalized, 'alice-nanoid')
    expect(after.paid).toBe(100)
  })

  it('falls back to the raw uid if no member mapping exists', () => {
    const legacySplit = { uid: 'unknown-uid', amount: 50 } as unknown as { travelMemberId: string; amount: number }
    const txs = [makeTx(todayStr(), { paidBy: [legacySplit], beneficiaries: [legacySplit] })]
    const members = [makeMember('alice-uid', 'alice-nanoid')] // 'unknown-uid' not in members

    const result = normalizeTransactionSplits(txs, members)
    // Falls back to the uid itself so we don't lose the data
    expect(result[0].paidBy[0].travelMemberId).toBe('unknown-uid')
  })
})

// ---------------------------------------------------------------------------

describe('parseTxDate', () => {
  it('correctly parses DD-MM-YYYY to a local Date', () => {
    const d = parseTxDate('15-03-2025')
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(2)  // 0-indexed: March = 2
    expect(d.getDate()).toBe(15)
  })
})

// ---------------------------------------------------------------------------

describe('formatAmount', () => {
  it('formats EUR with € symbol', () => {
    expect(formatAmount(42.5, 'EUR')).toBe('€ 42.50')
  })

  it('formats USD with $ symbol', () => {
    expect(formatAmount(1000, 'USD')).toBe('$ 1000.00')
  })

  it('formats THB with ฿ symbol', () => {
    expect(formatAmount(350, 'THB')).toBe('฿ 350.00')
  })

  it('falls back to the currency code when no symbol is defined', () => {
    // SGD has no entry in SYMBOL_MAP
    expect(formatAmount(88.8, 'SGD')).toBe('SGD 88.80')
  })

  it('always displays exactly 2 decimal places', () => {
    expect(formatAmount(10, 'EUR')).toBe('€ 10.00')
    expect(formatAmount(10.1, 'EUR')).toBe('€ 10.10')
    expect(formatAmount(10.123, 'EUR')).toBe('€ 10.12') // rounds at 2dp
  })
})

// ---------------------------------------------------------------------------

describe('formatDayLabel', () => {
  it('returns "Today" for today\'s date', () => {
    expect(formatDayLabel(todayStr())).toBe('Today')
  })

  it('returns "Yest." for yesterday\'s date', () => {
    expect(formatDayLabel(daysAgo(1))).toBe('Yest.')
  })

  it('returns a short date label for older dates', () => {
    // 2025-03-05 is not "today" or "yesterday" in any reasonable test run
    const label = formatDayLabel('05-03-2025')
    expect(label).not.toBe('Today')
    expect(label).not.toBe('Yest.')
    // Should contain a month abbreviation and a day number
    expect(label).toMatch(/[A-Za-z]+ \d+/)
  })
})

// ---------------------------------------------------------------------------

describe('numberOfDaysInRange', () => {
  it('returns tripDurationDays for "all"', () => {
    expect(numberOfDaysInRange({ type: 'all' }, 14)).toBe(14)
  })

  it('returns 1 for "today"', () => {
    expect(numberOfDaysInRange({ type: 'today' }, 14)).toBe(1)
  })

  it('returns n for "days:n"', () => {
    expect(numberOfDaysInRange({ type: 'days', n: 7 }, 14)).toBe(7)
    expect(numberOfDaysInRange({ type: 'days', n: 30 }, 60)).toBe(30)
  })

  it('returns inclusive day count for "custom"', () => {
    const from = new Date(2025, 2, 1)   // 2025-03-01
    const to   = new Date(2025, 2, 14)  // 2025-03-14 → 14 days inclusive
    expect(numberOfDaysInRange({ type: 'custom', from, to }, 30)).toBe(14)
  })

  it('returns 1 for a single-day custom range', () => {
    const day = new Date(2025, 2, 5)
    expect(numberOfDaysInRange({ type: 'custom', from: day, to: day }, 30)).toBe(1)
  })
})

// ---------------------------------------------------------------------------

describe('dateRangeLabel', () => {
  it('returns "Today" for period type "today"', () => {
    expect(dateRangeLabel({ type: 'today' }, [], 7)).toBe('Today')
  })

  it('returns a date range string for "days:n"', () => {
    const label = dateRangeLabel({ type: 'days', n: 7 }, [], 7)
    // Should be two short dates separated by '–'
    expect(label).toMatch(/\w+ \d+–\w+ \d+/)
  })

  it('returns a date range string for "custom"', () => {
    const from = new Date(2025, 2, 1)  // Mar 1
    const to   = new Date(2025, 2, 14) // Mar 14
    const label = dateRangeLabel({ type: 'custom', from, to }, [], 14)
    expect(label).toContain('–')
    // Both dates should appear somewhere in the label
    expect(label).toMatch(/Mar/)
  })

  it('all — returns fallback "N days" when no transactions', () => {
    expect(dateRangeLabel({ type: 'all' }, [], 10)).toBe('10 days')
  })

  it('all — returns span of transaction dates when transactions exist', () => {
    const txs = [
      makeTx('01-03-2025'),
      makeTx('05-03-2025'),
      makeTx('14-03-2025'),
    ]
    const label = dateRangeLabel({ type: 'all' }, txs, 30)
    expect(label).toContain('–')
  })

  it('all — returns single date label when all transactions on the same day', () => {
    const txs = [makeTx('01-03-2025'), makeTx('01-03-2025')]
    const label = dateRangeLabel({ type: 'all' }, txs, 1)
    expect(label).not.toContain('–')
  })
})
