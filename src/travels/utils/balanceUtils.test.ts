import { describe, it, expect } from 'vitest'
import { computeBalances, computeBalancesRaw, computeSettlements, getSingleCurrency } from './balanceUtils'
import type { Transaction } from '@/transactions/types'
import type { TravelMember } from '@/travels/types'
import { Timestamp } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// Helpers — minimal factories to keep tests readable
// ---------------------------------------------------------------------------

function member(id: string, name: string): TravelMember {
  return {
    travelMemberId: id,
    displayName: name,
    userId: id,
    allowRename: false,
    joinedAt: Timestamp.now(),
  }
}

function tx(
  overrides: Partial<Transaction> & Pick<Transaction, 'paidBy' | 'beneficiaries' | 'totalAmount'>,
): Transaction {
  return {
    txId: 'tx-' + Math.random().toString(36).slice(2, 6),
    date: '01-01-2026',
    name: 'Test expense',
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: overrides.totalAmount,
    category: undefined,
    paymentMethod: undefined,
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: 'u1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeBalances', () => {
  it('two members, one paid everything', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    const transactions = [
      tx({
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'a', amount: 100 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 50 },
        ],
      }),
    ]

    const balances = computeBalances(transactions, members)
    const alice = balances.find((b) => b.memberId === 'a')!
    const bob = balances.find((b) => b.memberId === 'b')!

    expect(alice.net).toBe(50)   // paid 100, consumed 50 → owed 50
    expect(bob.net).toBe(-50)    // paid 0, consumed 50 → owes 50
  })

  it('three members — architecture doc restaurant example', () => {
    // Alice paid 50, Bob paid 25, total 75
    // Alice's share 30, Bob's share 45 (e.g. Alice share = 30, Bob share = 45)
    // Net: Alice = 50 - 30 = +20, Bob = 25 - 45 = -20
    // But we need 3 members — let's include Carol with 0 share to match spec
    // Actually re-reading: total 75, Alice share 30, Bob share 45 → that's 75 total beneficiary
    // Carol isn't a beneficiary here but is a member
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')]
    const transactions = [
      tx({
        totalAmount: 75,
        paidBy: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 25 },
        ],
        beneficiaries: [
          { travelMemberId: 'a', amount: 30 },
          { travelMemberId: 'b', amount: 45 },
        ],
      }),
    ]

    const balances = computeBalances(transactions, members)
    const alice = balances.find((b) => b.memberId === 'a')!
    const bob = balances.find((b) => b.memberId === 'b')!
    const carol = balances.find((b) => b.memberId === 'c')!

    expect(alice.net).toBe(20)    // paid 50, consumed 30
    expect(bob.net).toBe(-20)     // paid 25, consumed 45
    expect(carol.net).toBe(0)     // not involved

    const settlements = computeSettlements(balances)
    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toEqual({
      fromId: 'b',
      fromName: 'Bob',
      toId: 'a',
      toName: 'Alice',
      amount: 20,
    })
  })

  it('all members already balanced → empty settlements', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    const transactions = [
      tx({
        totalAmount: 100,
        paidBy: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 50 },
        ],
        beneficiaries: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 50 },
        ],
      }),
    ]

    const balances = computeBalances(transactions, members)
    expect(balances.find((b) => b.memberId === 'a')!.net).toBe(0)
    expect(balances.find((b) => b.memberId === 'b')!.net).toBe(0)

    const settlements = computeSettlements(balances)
    expect(settlements).toHaveLength(0)
  })

  it('solo travel (one member) → net 0, no settlements', () => {
    const members = [member('a', 'Alice')]
    const transactions = [
      tx({
        totalAmount: 42,
        paidBy: [{ travelMemberId: 'a', amount: 42 }],
        beneficiaries: [{ travelMemberId: 'a', amount: 42 }],
      }),
    ]

    const balances = computeBalances(transactions, members)
    expect(balances).toHaveLength(1)
    expect(balances[0].net).toBe(0)

    const settlements = computeSettlements(balances)
    expect(settlements).toHaveLength(0)
  })

  it('floating-point stability: 100/3 split among 3 members', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')]
    const thirdAmount = 100 / 3 // 33.333...

    const transactions = [
      tx({
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'a', amount: 100 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: thirdAmount },
          { travelMemberId: 'b', amount: thirdAmount },
          { travelMemberId: 'c', amount: thirdAmount },
        ],
      }),
    ]

    const balances = computeBalances(transactions, members)

    // Nets should sum to ~0. Individual nets are rounded to 2dp, so the sum of
    // rounded values can drift by up to 0.01 * memberCount. Use 0.02 tolerance.
    const totalNet = balances.reduce((sum, b) => sum + b.net, 0)
    expect(Math.abs(totalNet)).toBeLessThan(0.02)

    // No false "owes 0.01" settlement should be emitted
    const settlements = computeSettlements(balances)
    for (const s of settlements) {
      expect(s.amount).toBeGreaterThanOrEqual(0.01)
    }

    // Alice paid 100, consumed ~33.33 → net ~66.67
    // Bob and Carol each consumed ~33.33, paid 0 → net ~-33.33
    const alice = balances.find((b) => b.memberId === 'a')!
    expect(alice.net).toBeCloseTo(66.67, 1)

    // Two settlements expected: Bob→Alice ~33.33, Carol→Alice ~33.33
    expect(settlements).toHaveLength(2)
  })
})

describe('computeBalances with exchange rates', () => {
  it('applies exchange rate to convert to main currency', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    const transactions = [
      tx({
        totalAmount: 100,
        currency: 'USD',
        exchangeRate: 0.92, // 1 USD = 0.92 EUR
        totalAmountMain: 92,
        paidBy: [{ travelMemberId: 'a', amount: 100 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 50 },
        ],
      }),
    ]

    const balances = computeBalances(transactions, members)
    const alice = balances.find((b) => b.memberId === 'a')!
    const bob = balances.find((b) => b.memberId === 'b')!

    // In EUR: Alice paid 100*0.92=92, consumed 50*0.92=46 → net +46
    // Bob paid 0, consumed 50*0.92=46 → net -46
    expect(alice.net).toBe(46)
    expect(bob.net).toBe(-46)
  })
})

// ---------------------------------------------------------------------------
// computeBalancesRaw — same logic as computeBalances but ignores exchangeRate
// ---------------------------------------------------------------------------

describe('computeBalancesRaw', () => {
  it('produces the same result as computeBalances when exchangeRate = 1', () => {
    // With rate=1, both functions should agree exactly
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    const transactions = [
      tx({
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'a', amount: 100 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: 60 },
          { travelMemberId: 'b', amount: 40 },
        ],
      }),
    ]

    const withRate  = computeBalances(transactions, members)
    const withoutRate = computeBalancesRaw(transactions, members)

    expect(withoutRate.find(b => b.memberId === 'a')!.net)
      .toBe(withRate.find(b => b.memberId === 'a')!.net)
    expect(withoutRate.find(b => b.memberId === 'b')!.net)
      .toBe(withRate.find(b => b.memberId === 'b')!.net)
  })

  it('ignores exchangeRate — amounts are used as-is without conversion', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    // rate=2 would double amounts in computeBalances but raw ignores it
    const transactions = [
      tx({
        totalAmount: 100,
        exchangeRate: 2,  // this will be ignored by computeBalancesRaw
        paidBy: [{ travelMemberId: 'a', amount: 100 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 50 },
        ],
      }),
    ]

    const raw     = computeBalancesRaw(transactions, members)
    const withRate = computeBalances(transactions, members)

    // Raw: Alice paid 100, consumed 50 → net +50 (no rate applied)
    expect(raw.find(b => b.memberId === 'a')!.net).toBe(50)
    expect(raw.find(b => b.memberId === 'b')!.net).toBe(-50)

    // With rate=2: Alice paid 200 in main, consumed 100 → net +100
    expect(withRate.find(b => b.memberId === 'a')!.net).toBe(100)
    expect(withRate.find(b => b.memberId === 'b')!.net).toBe(-100)
  })

  it('initialises all members at zero — members with no transactions appear with net=0', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')]
    const transactions = [
      tx({
        totalAmount: 30,
        paidBy: [{ travelMemberId: 'a', amount: 30 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: 15 },
          { travelMemberId: 'b', amount: 15 },
        ],
        // Carol not involved
      }),
    ]

    const raw = computeBalancesRaw(transactions, members)
    expect(raw).toHaveLength(3)
    expect(raw.find(b => b.memberId === 'c')!.net).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getSingleCurrency
// ---------------------------------------------------------------------------

describe('getSingleCurrency', () => {
  it('returns null for an empty transaction list', () => {
    expect(getSingleCurrency([])).toBeNull()
  })

  it('returns the currency when all transactions share the same currency', () => {
    const transactions = [
      tx({ totalAmount: 10, paidBy: [], beneficiaries: [], currency: 'EUR' }),
      tx({ totalAmount: 20, paidBy: [], beneficiaries: [], currency: 'EUR' }),
      tx({ totalAmount: 30, paidBy: [], beneficiaries: [], currency: 'EUR' }),
    ]
    expect(getSingleCurrency(transactions)).toBe('EUR')
  })

  it('returns null when transactions have mixed currencies', () => {
    const transactions = [
      tx({ totalAmount: 10, paidBy: [], beneficiaries: [], currency: 'EUR' }),
      tx({ totalAmount: 20, paidBy: [], beneficiaries: [], currency: 'USD' }),
    ]
    expect(getSingleCurrency(transactions)).toBeNull()
  })

  it('returns the currency for a single transaction', () => {
    const transactions = [
      tx({ totalAmount: 50, paidBy: [], beneficiaries: [], currency: 'THB' }),
    ]
    expect(getSingleCurrency(transactions)).toBe('THB')
  })

  it('returns null as soon as the second currency differs', () => {
    const transactions = [
      tx({ totalAmount: 10, paidBy: [], beneficiaries: [], currency: 'EUR' }),
      tx({ totalAmount: 20, paidBy: [], beneficiaries: [], currency: 'EUR' }),
      tx({ totalAmount: 30, paidBy: [], beneficiaries: [], currency: 'GBP' }),  // breaks uniformity
    ]
    expect(getSingleCurrency(transactions)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('computeSettlements', () => {
  it('two members, one paid everything → one settlement', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    const transactions = [
      tx({
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'a', amount: 100 }],
        beneficiaries: [
          { travelMemberId: 'a', amount: 50 },
          { travelMemberId: 'b', amount: 50 },
        ],
      }),
    ]

    const balances = computeBalances(transactions, members)
    const settlements = computeSettlements(balances)

    expect(settlements).toHaveLength(1)
    expect(settlements[0]).toEqual({
      fromId: 'b',
      fromName: 'Bob',
      toId: 'a',
      toName: 'Alice',
      amount: 50,
    })
  })
})
