// src/travels/components/tabs/__tests__/transactionsTab.test.ts
import { describe, it, expect } from 'vitest'
import {
  currencySymbol,
  formatAmount,
  groupByDay,
  type DayGroup,
} from '../TransactionsTab'
import { parseTxDate } from '../dashboardHelpers'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'

// ---------------------------------------------------------------------------
// currencySymbol
// ---------------------------------------------------------------------------

describe('currencySymbol', () => {
  it('returns known symbol for EUR', () => expect(currencySymbol('EUR')).toBe('€'))
  it('returns known symbol for USD', () => expect(currencySymbol('USD')).toBe('$'))
  it('returns known symbol for THB', () => expect(currencySymbol('THB')).toBe('฿'))
  it('returns known symbol for GBP', () => expect(currencySymbol('GBP')).toBe('£'))
  it('returns known symbol for JPY', () => expect(currencySymbol('JPY')).toBe('¥'))
  it('returns known symbol for AUD', () => expect(currencySymbol('AUD')).toBe('A$'))
  it('returns known symbol for HKD', () => expect(currencySymbol('HKD')).toBe('HK$'))
  // Fallback: unknown code returned as-is
  it('falls back to the ISO code for unknown currency', () => expect(currencySymbol('XYZ')).toBe('XYZ'))
  it('falls back for empty string', () => expect(currencySymbol('')).toBe(''))
})

// ---------------------------------------------------------------------------
// formatAmount
// ---------------------------------------------------------------------------

describe('formatAmount', () => {
  it('formats integer with no decimals', () => expect(formatAmount(450, 'THB')).toBe('450 ฿'))
  it('formats thousands with space separator', () => expect(formatAmount(8900, 'THB')).toBe('8 900 ฿'))
  it('formats millions with two spaces', () => expect(formatAmount(1234567, 'EUR')).toBe('1 234 567 €'))
  it('formats fractional value with 2dp', () => expect(formatAmount(11.7, 'EUR')).toBe('11.70 €'))
  it('formats zero as integer', () => expect(formatAmount(0, 'USD')).toBe('0 $'))
  it('uses ISO code as symbol fallback', () => expect(formatAmount(100, 'XYZ')).toBe('100 XYZ'))
  // Integer detection — .00 should show without decimals
  it('treats x.00 values as integers', () => expect(formatAmount(225.0, 'THB')).toBe('225 ฿'))
  it('keeps 2dp for non-integer values', () => expect(formatAmount(1.5, 'EUR')).toBe('1.50 €'))
})

// ---------------------------------------------------------------------------
// groupByDay
// ---------------------------------------------------------------------------

/** Minimal factory — only the fields groupByDay cares about (date + txId). */
function makeTx(txId: string, date: string): TransactionWithStatus {
  return { txId, date } as unknown as TransactionWithStatus
}

describe('groupByDay', () => {
  it('returns an empty array for no transactions', () => {
    expect(groupByDay([])).toEqual([])
  })

  it('creates one group for a single transaction', () => {
    const groups = groupByDay([makeTx('tx1', '16-03-2025')])
    expect(groups).toHaveLength(1)
    expect(groups[0].date).toBe('16-03-2025')
    expect(groups[0].transactions).toHaveLength(1)
  })

  it('keeps transactions with the same date in the same group', () => {
    const txs = [makeTx('tx1', '16-03-2025'), makeTx('tx2', '16-03-2025')]
    const groups = groupByDay(txs)
    expect(groups).toHaveLength(1)
    expect(groups[0].transactions).toHaveLength(2)
  })

  it('creates separate groups for different dates', () => {
    const txs = [makeTx('tx1', '16-03-2025'), makeTx('tx2', '15-03-2025')]
    const groups = groupByDay(txs)
    expect(groups).toHaveLength(2)
    expect(groups[0].date).toBe('16-03-2025')
    expect(groups[1].date).toBe('15-03-2025')
  })

  it('preserves the input date-desc order of groups', () => {
    const txs = [
      makeTx('tx1', '18-03-2025'),
      makeTx('tx2', '17-03-2025'),
      makeTx('tx3', '16-03-2025'),
    ]
    const dates = groupByDay(txs).map((g) => g.date)
    expect(dates).toEqual(['18-03-2025', '17-03-2025', '16-03-2025'])
  })

  it('preserves the order of transactions within a group', () => {
    const txs = [makeTx('tx1', '16-03-2025'), makeTx('tx2', '16-03-2025'), makeTx('tx3', '16-03-2025')]
    const group = groupByDay(txs)[0]
    expect(group.transactions.map((t) => t.txId)).toEqual(['tx1', 'tx2', 'tx3'])
  })

  it('handles interleaved dates correctly (groups by first seen)', () => {
    // Shouldn't normally happen (list is pre-sorted), but groupByDay should still be correct
    const txs = [
      makeTx('tx1', '16-03-2025'),
      makeTx('tx2', '15-03-2025'),
      makeTx('tx3', '16-03-2025'), // same date as tx1, but appears after tx2
    ]
    const groups = groupByDay(txs)
    // Two distinct dates → two groups; tx3 ends up in the first group (16-03)
    expect(groups).toHaveLength(2)
    const group16 = groups.find((g) => g.date === '16-03-2025')!
    expect(group16.transactions.map((t) => t.txId)).toEqual(['tx1', 'tx3'])
  })

  it('returns correct DayGroup shape', () => {
    const result: DayGroup[] = groupByDay([makeTx('tx1', '01-01-2025')])
    expect(result[0]).toMatchObject({ date: '01-01-2025', transactions: expect.any(Array) })
  })
})

// ---------------------------------------------------------------------------
// Date sort order (parseTxDate-based, matching the useMemo in TransactionsTab)
// ---------------------------------------------------------------------------

/** Sort helper — mirrors the useMemo sort in TransactionsTab. */
function sortByDateDesc(txs: TransactionWithStatus[]): TransactionWithStatus[] {
  return [...txs].sort((a, b) => {
    const dateDiff = parseTxDate(b.date).getTime() - parseTxDate(a.date).getTime()
    return dateDiff
  })
}

describe('date sort order (parseTxDate)', () => {
  it('sorts cross-month correctly (Feb 01 before Jan 31)', () => {
    const txs = [makeTx('jan31', '31-01-2025'), makeTx('feb01', '01-02-2025')]
    const sorted = sortByDateDesc(txs)
    expect(sorted.map((t) => t.txId)).toEqual(['feb01', 'jan31'])
  })

  it('sorts cross-year correctly (Jan 2025 before Dec 2024)', () => {
    const txs = [makeTx('dec24', '31-12-2024'), makeTx('jan25', '01-01-2025')]
    const sorted = sortByDateDesc(txs)
    expect(sorted.map((t) => t.txId)).toEqual(['jan25', 'dec24'])
  })
})
