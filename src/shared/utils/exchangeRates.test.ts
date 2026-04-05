// exchangeRates.test.ts — unit tests for getExchangeRate and buildDefaultRates.
//
// Both functions are pure (no side-effects, no Firebase) so they run fine in the
// default jsdom environment without any mocking.

import { describe, it, expect } from 'vitest'
import { getExchangeRate, buildDefaultRates, EXCHANGE_RATES } from './exchangeRates'

// ---------------------------------------------------------------------------
// getExchangeRate
// ---------------------------------------------------------------------------

describe('getExchangeRate', () => {
  // Same currency — trivial identity
  it('returns 1.0 when currency === mainCurrency', () => {
    expect(getExchangeRate('EUR', 'EUR')).toBe(1.0)
    expect(getExchangeRate('USD', 'USD')).toBe(1.0)
    expect(getExchangeRate('THB', 'THB')).toBe(1.0)
  })

  // Travel-specific rates take priority over hardcoded table
  it('returns the travel-specific rate when present in travelRates', () => {
    const travelRates = { USD: 0.88 } // overrides the hardcoded USD rate
    expect(getExchangeRate('USD', 'EUR', travelRates)).toBe(0.88)
  })

  it('still uses travelRates even when the hardcoded table has a different value', () => {
    // Hardcoded EUR→EUR rate would be 1.0; travelRates deliberately says 0.5
    const travelRates = { XXX: 0.5 }
    expect(getExchangeRate('XXX', 'EUR', travelRates)).toBe(0.5)
  })

  // Hardcoded fallback via EUR cross-rate
  it('derives cross-rate correctly from hardcoded table (USD → EUR)', () => {
    // EXCHANGE_RATES stores "X EUR per 1 unit"
    // 1 USD → EUR = EXCHANGE_RATES.USD / EXCHANGE_RATES.EUR = USD_rate / 1.0
    const expected = EXCHANGE_RATES['USD'] / EXCHANGE_RATES['EUR']
    expect(getExchangeRate('USD', 'EUR')).toBeCloseTo(expected, 6)
  })

  it('derives cross-rate correctly from hardcoded table (THB → USD)', () => {
    const expected = EXCHANGE_RATES['THB'] / EXCHANGE_RATES['USD']
    expect(getExchangeRate('THB', 'USD')).toBeCloseTo(expected, 6)
  })

  it('falls back to 1.0 for an unknown currency code', () => {
    // Both from and to unknown
    expect(getExchangeRate('ZZZ', 'EUR')).toBe(1.0)
    expect(getExchangeRate('EUR', 'ZZZ')).toBe(1.0)
  })

  // travelRates absent vs empty
  it('falls through to hardcoded table when travelRates is undefined', () => {
    const hardcoded = EXCHANGE_RATES['USD'] / EXCHANGE_RATES['EUR']
    expect(getExchangeRate('USD', 'EUR', undefined)).toBeCloseTo(hardcoded, 6)
  })

  it('falls through to hardcoded table when the currency is missing from travelRates', () => {
    const travelRates = { GBP: 1.1 } // only GBP present
    const hardcoded = EXCHANGE_RATES['USD'] / EXCHANGE_RATES['EUR']
    expect(getExchangeRate('USD', 'EUR', travelRates)).toBeCloseTo(hardcoded, 6)
  })

  // travelRates same-currency shortcut fires before rate lookup
  it('returns 1.0 for same currency regardless of travelRates content', () => {
    const travelRates = { EUR: 99 } // nonsense entry — should be ignored
    expect(getExchangeRate('EUR', 'EUR', travelRates)).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// buildDefaultRates
// ---------------------------------------------------------------------------

describe('buildDefaultRates', () => {
  it('does not include mainCurrency itself in the output', () => {
    const rates = buildDefaultRates('EUR')
    expect(rates).not.toHaveProperty('EUR')
  })

  it('includes other currencies relative to mainCurrency (EUR)', () => {
    const rates = buildDefaultRates('EUR')
    // 1 USD → EUR: EXCHANGE_RATES.USD / EXCHANGE_RATES.EUR
    const expected = parseFloat((EXCHANGE_RATES['USD'] / EXCHANGE_RATES['EUR']).toPrecision(6))
    expect(rates['USD']).toBeCloseTo(expected, 5)
  })

  it('produces the correct rate for a non-EUR main currency (USD)', () => {
    const rates = buildDefaultRates('USD')
    // mainCurrency is USD: 1 EUR → USD = EXCHANGE_RATES.EUR / EXCHANGE_RATES.USD
    const expected = parseFloat((EXCHANGE_RATES['EUR'] / EXCHANGE_RATES['USD']).toPrecision(6))
    expect(rates['EUR']).toBeCloseTo(expected, 5)
    // mainCurrency itself not in the map
    expect(rates).not.toHaveProperty('USD')
  })

  it('returns an empty object for an unknown mainCurrency', () => {
    const rates = buildDefaultRates('ZZZ')
    expect(Object.keys(rates)).toHaveLength(0)
  })

  it('covers all supported currencies except mainCurrency', () => {
    const rates = buildDefaultRates('EUR')
    // Every key in EXCHANGE_RATES except EUR should appear
    const expectedCount = Object.keys(EXCHANGE_RATES).length - 1
    expect(Object.keys(rates)).toHaveLength(expectedCount)
  })

  it('all rates are finite positive numbers', () => {
    const rates = buildDefaultRates('EUR')
    for (const [code, rate] of Object.entries(rates)) {
      expect(isFinite(rate), `rate for ${code} should be finite`).toBe(true)
      expect(rate, `rate for ${code} should be positive`).toBeGreaterThan(0)
    }
  })
})
