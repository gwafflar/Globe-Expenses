// walletHelpers.test.ts — unit tests for transaction-type helpers and wallet balance computation.
//
// walletHelpers.ts is a pure TypeScript file (no React, no Firebase), so all tests
// run without any mocking in the default jsdom environment.

import { describe, it, expect } from 'vitest'
import {
  getTransactionType,
  isExpense,
  isWithdrawal,
  isAdjustment,
  isTransfer,
  countsAsSpending,
  affectsBalance,
  availableTransactionTypes,
  computeWalletBalances,
  computeReconciliationDiff,
  type WalletBalance,
} from './walletHelpers'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import type { SpaceConfig } from '@/spaces/types'
import { Timestamp } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// Minimal factory — only the fields walletHelpers cares about
// ---------------------------------------------------------------------------

function makeTx(
  overrides: Partial<TransactionWithStatus> & { paidBy?: TransactionWithStatus['paidBy'] },
): TransactionWithStatus {
  return {
    txId: 'tx-' + Math.random().toString(36).slice(2, 6),
    date: '01-04-2026',
    name: 'Test',
    totalAmount: 100,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 100,
    paidBy: [],
    beneficiaries: [],
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: 'u1',
    isPending: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getTransactionType
// ---------------------------------------------------------------------------

describe('getTransactionType', () => {
  it('returns "expense" when type is undefined (legacy doc)', () => {
    expect(getTransactionType({})).toBe('expense')
    expect(getTransactionType({ type: undefined })).toBe('expense')
  })

  it('returns the explicit type when set', () => {
    expect(getTransactionType({ type: 'expense' })).toBe('expense')
    expect(getTransactionType({ type: 'withdrawal' })).toBe('withdrawal')
    expect(getTransactionType({ type: 'adjustment' })).toBe('adjustment')
    expect(getTransactionType({ type: 'transfer' })).toBe('transfer')
  })
})

// ---------------------------------------------------------------------------
// Type predicates
// ---------------------------------------------------------------------------

describe('isExpense / isWithdrawal / isAdjustment / isTransfer', () => {
  it('isExpense returns true only for expense (and undefined)', () => {
    expect(isExpense({})).toBe(true)                       // undefined → expense
    expect(isExpense({ type: 'expense' })).toBe(true)
    expect(isExpense({ type: 'withdrawal' })).toBe(false)
    expect(isExpense({ type: 'adjustment' })).toBe(false)
    expect(isExpense({ type: 'transfer' })).toBe(false)
  })

  it('isWithdrawal returns true only for withdrawal', () => {
    expect(isWithdrawal({ type: 'withdrawal' })).toBe(true)
    expect(isWithdrawal({ type: 'expense' })).toBe(false)
    expect(isWithdrawal({})).toBe(false)
  })

  it('isAdjustment returns true only for adjustment', () => {
    expect(isAdjustment({ type: 'adjustment' })).toBe(true)
    expect(isAdjustment({ type: 'expense' })).toBe(false)
    expect(isAdjustment({})).toBe(false)
  })

  it('isTransfer returns true only for transfer', () => {
    expect(isTransfer({ type: 'transfer' })).toBe(true)
    expect(isTransfer({ type: 'expense' })).toBe(false)
    expect(isTransfer({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// countsAsSpending
// ---------------------------------------------------------------------------

describe('countsAsSpending', () => {
  it('expense (explicit) counts as spending', () => {
    expect(countsAsSpending({ type: 'expense' })).toBe(true)
  })

  it('undefined type (legacy) counts as spending', () => {
    expect(countsAsSpending({})).toBe(true)
  })

  it('withdrawal does NOT count as spending', () => {
    expect(countsAsSpending({ type: 'withdrawal' })).toBe(false)
  })

  it('transfer does NOT count as spending', () => {
    expect(countsAsSpending({ type: 'transfer' })).toBe(false)
  })

  it('adjustment with adjustmentMode="expense" counts as spending', () => {
    expect(countsAsSpending({ type: 'adjustment', adjustmentMode: 'expense' })).toBe(true)
  })

  it('adjustment with adjustmentMode="balance_only" does NOT count as spending', () => {
    expect(countsAsSpending({ type: 'adjustment', adjustmentMode: 'balance_only' })).toBe(false)
  })

  it('adjustment with no adjustmentMode does NOT count as spending', () => {
    expect(countsAsSpending({ type: 'adjustment' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// affectsBalance
// ---------------------------------------------------------------------------

describe('affectsBalance', () => {
  it('expense affects balance', () => {
    expect(affectsBalance({ type: 'expense' })).toBe(true)
  })

  it('undefined type (legacy expense) affects balance', () => {
    expect(affectsBalance({})).toBe(true)
  })

  it('transfer affects balance (it shifts who owes whom)', () => {
    expect(affectsBalance({ type: 'transfer' })).toBe(true)
  })

  it('withdrawal does NOT affect balance', () => {
    expect(affectsBalance({ type: 'withdrawal' })).toBe(false)
  })

  it('adjustment with adjustmentMode="expense" affects balance', () => {
    expect(affectsBalance({ type: 'adjustment', adjustmentMode: 'expense' })).toBe(true)
  })

  it('adjustment with adjustmentMode="balance_only" does NOT affect balance', () => {
    expect(affectsBalance({ type: 'adjustment', adjustmentMode: 'balance_only' })).toBe(false)
  })

  it('adjustment with no adjustmentMode does NOT affect balance', () => {
    expect(affectsBalance({ type: 'adjustment' })).toBe(false)
  })

  // Key invariant: transfer appears in balance but NOT in spending
  it('transfer differs from countsAsSpending (affects balance but not spending)', () => {
    const tx = { type: 'transfer' as const }
    expect(affectsBalance(tx)).toBe(true)
    expect(countsAsSpending(tx)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// availableTransactionTypes
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SpaceConfig['features']> = {}): SpaceConfig {
  return {
    builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
    features: { wallets: false, multiCurrency: false, ...overrides },
    customFields: [],
  }
}

describe('availableTransactionTypes', () => {
  it('solo + wallets off → only expense', () => {
    expect(availableTransactionTypes(makeConfig(), 1)).toEqual(['expense'])
  })

  it('solo + wallets on → expense/withdrawal/adjustment, no transfer', () => {
    expect(availableTransactionTypes(makeConfig({ wallets: true }), 1))
      .toEqual(['expense', 'withdrawal', 'adjustment'])
  })

  it('3 members + wallets off → expense/transfer', () => {
    expect(availableTransactionTypes(makeConfig(), 3)).toEqual(['expense', 'transfer'])
  })

  it('3 members + wallets on → all four, in stable order', () => {
    expect(availableTransactionTypes(makeConfig({ wallets: true }), 3))
      .toEqual(['expense', 'transfer', 'withdrawal', 'adjustment'])
  })

  it('preserves the current type when editing, even if config no longer offers it', () => {
    // Wallets turned off after a withdrawal was recorded — editing it must not
    // silently coerce the type, or wallet history would be corrupted.
    expect(availableTransactionTypes(makeConfig(), 1, 'withdrawal')).toEqual(['expense', 'withdrawal'])
  })

  it('does not duplicate the current type when it is already available', () => {
    expect(availableTransactionTypes(makeConfig({ wallets: true }), 1, 'withdrawal'))
      .toEqual(['expense', 'withdrawal', 'adjustment'])
  })
})

// ---------------------------------------------------------------------------
// computeWalletBalances
// ---------------------------------------------------------------------------

describe('computeWalletBalances', () => {
  const pmMap = new Map([['cash', 'Cash'], ['card', 'Visa']])

  it('returns empty array when there are no transactions', () => {
    expect(computeWalletBalances([], 'alice', pmMap)).toEqual([])
  })

  it('returns empty array when there are expenses but no withdrawals (no wallet to track)', () => {
    const txs = [
      makeTx({
        type: 'expense',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 50,
        paidBy: [{ travelMemberId: 'alice', amount: 50 }],
      }),
    ]
    expect(computeWalletBalances(txs, 'alice', pmMap)).toHaveLength(0)
  })

  it('tracks a simple withdrawal → expense cycle for one wallet', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 200,
        paidBy: [{ travelMemberId: 'alice', amount: 200 }],
      }),
      makeTx({
        type: 'expense',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 80,
        paidBy: [{ travelMemberId: 'alice', amount: 80 }],
        beneficiaries: [{ travelMemberId: 'alice', amount: 80 }],
      }),
    ]

    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets).toHaveLength(1)
    expect(wallets[0].paymentMethod).toBe('cash')
    expect(wallets[0].currency).toBe('EUR')
    expect(wallets[0].deposited).toBe(200)
    expect(wallets[0].spent).toBe(80)
    expect(wallets[0].remaining).toBe(120)
  })

  it('deducts fees from the deposited amount', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'THB',
        totalAmount: 5000,
        fees: 150,
        paidBy: [{ travelMemberId: 'alice', amount: 5000 }],
      }),
    ]

    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets[0].deposited).toBe(4850) // 5000 - 150 fees
    expect(wallets[0].remaining).toBe(4850)
  })

  it('does not include transactions where the member is not in paidBy', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'bob', amount: 100 }],  // bob, not alice
      }),
    ]
    expect(computeWalletBalances(txs, 'alice', pmMap)).toHaveLength(0)
  })

  it('skips transactions without a paymentMethod', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: undefined,  // no PM → no wallet key
        currency: 'EUR',
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'alice', amount: 100 }],
      }),
    ]
    expect(computeWalletBalances(txs, 'alice', pmMap)).toHaveLength(0)
  })

  it('skips transfer transactions (transfers do not affect wallets)', () => {
    const txs = [
      // Need a withdrawal first so the PM is tracked
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'alice', amount: 100 }],
      }),
      makeTx({
        type: 'transfer',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 50,
        paidBy: [{ travelMemberId: 'alice', amount: 50 }],
        beneficiaries: [{ travelMemberId: 'bob', amount: 50 }],
      }),
    ]

    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets[0].spent).toBe(0)     // transfer not counted in spent
    expect(wallets[0].remaining).toBe(100)
  })

  it('returns separate wallet entries for different (paymentMethod, currency) pairs', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 200,
        paidBy: [{ travelMemberId: 'alice', amount: 200 }],
      }),
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'THB',
        totalAmount: 3000,
        paidBy: [{ travelMemberId: 'alice', amount: 3000 }],
      }),
    ]

    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets).toHaveLength(2)
    // Sorted by currency ascending: EUR before THB
    expect(wallets[0].currency).toBe('EUR')
    expect(wallets[1].currency).toBe('THB')
  })

  it('resolves paymentMethodLabel from pmLabelMap', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'alice', amount: 100 }],
      }),
    ]
    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets[0].paymentMethodLabel).toBe('Cash')
  })

  it('falls back to raw paymentMethod id when label is not in pmLabelMap', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'unknown-pm',
        currency: 'EUR',
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'alice', amount: 100 }],
      }),
    ]
    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets[0].paymentMethodLabel).toBe('unknown-pm')
  })

  it('accumulates adjustments into the wallet balance', () => {
    const txs = [
      makeTx({
        type: 'withdrawal',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 100,
        paidBy: [{ travelMemberId: 'alice', amount: 100 }],
      }),
      makeTx({
        type: 'adjustment',
        paymentMethod: 'cash',
        currency: 'EUR',
        totalAmount: 10,
        paidBy: [{ travelMemberId: 'alice', amount: 10 }],
      }),
    ]

    const wallets = computeWalletBalances(txs, 'alice', pmMap)
    expect(wallets[0].adjustments).toBe(10)
    expect(wallets[0].remaining).toBe(110) // 100 deposited + 10 adjustment
  })
})

// ---------------------------------------------------------------------------
// computeReconciliationDiff
// ---------------------------------------------------------------------------

describe('computeReconciliationDiff', () => {
  // Build a minimal WalletBalance stub
  function makeBalance(remaining: number): WalletBalance {
    return {
      paymentMethod: 'cash',
      paymentMethodLabel: 'Cash',
      currency: 'EUR',
      deposited: 100,
      spent: 100 - remaining,
      adjustments: 0,
      remaining,
    }
  }

  it('returns positive diff when actual > computed (user has more than expected)', () => {
    expect(computeReconciliationDiff(120, makeBalance(100))).toBe(20)
  })

  it('returns negative diff when actual < computed (user has less than expected)', () => {
    expect(computeReconciliationDiff(80, makeBalance(100))).toBe(-20)
  })

  it('returns 0 when actual === computed (perfectly balanced)', () => {
    expect(computeReconciliationDiff(100, makeBalance(100))).toBe(0)
  })

  it('rounds result to 2 decimal places', () => {
    // 10.005 - 0 = 10.005, which rounds to 10.01 at 2dp
    const diff = computeReconciliationDiff(10.005, makeBalance(0))
    expect(diff).toBe(Math.round(10.005 * 100) / 100)
  })
})
