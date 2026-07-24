// exchangeRates.test.ts — unit tests for getExchangeRate and buildDefaultRates.
//
// Both functions are pure (no side-effects, no Firebase) so they run fine in the
// default jsdom environment without any mocking.

import { describe, it, expect } from 'vitest'
import { getExchangeRate, buildDefaultRates, findStaleDefaultRates, EXCHANGE_RATES } from './exchangeRates'
import { ALL_CURRENCIES } from '@/shared/data/pickerData'

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

  // Hardcoded fallback via EUR cross-rate.
  // EXCHANGE_RATES stores "units of currency per 1 EUR" (standard EUR-base quote).
  // Converting 1 unit of `currency` into `mainCurrency` = EXCHANGE_RATES[mainCurrency] / EXCHANGE_RATES[currency].
  it('derives cross-rate correctly from hardcoded table (USD → EUR)', () => {
    const expected = EXCHANGE_RATES['EUR'] / EXCHANGE_RATES['USD']
    expect(getExchangeRate('USD', 'EUR')).toBeCloseTo(expected, 6)
  })

  it('derives cross-rate correctly from hardcoded table (THB → USD)', () => {
    const expected = EXCHANGE_RATES['USD'] / EXCHANGE_RATES['THB']
    expect(getExchangeRate('THB', 'USD')).toBeCloseTo(expected, 6)
  })

  it('falls back to 1.0 for an unknown currency code', () => {
    // Both from and to unknown
    expect(getExchangeRate('ZZZ', 'EUR')).toBe(1.0)
    expect(getExchangeRate('EUR', 'ZZZ')).toBe(1.0)
  })

  // travelRates absent vs empty
  it('falls through to hardcoded table when travelRates is undefined', () => {
    const hardcoded = EXCHANGE_RATES['EUR'] / EXCHANGE_RATES['USD']
    expect(getExchangeRate('USD', 'EUR', undefined)).toBeCloseTo(hardcoded, 6)
  })

  it('falls through to hardcoded table when the currency is missing from travelRates', () => {
    const travelRates = { GBP: 1.1 } // only GBP present
    const hardcoded = EXCHANGE_RATES['EUR'] / EXCHANGE_RATES['USD']
    expect(getExchangeRate('USD', 'EUR', travelRates)).toBeCloseTo(hardcoded, 6)
  })

  // travelRates same-currency shortcut fires before rate lookup
  it('returns 1.0 for same currency regardless of travelRates content', () => {
    const travelRates = { EUR: 99 } // nonsense entry — should be ignored
    expect(getExchangeRate('EUR', 'EUR', travelRates)).toBe(1.0)
  })

  // Regression test: AED has been pegged to USD at exactly 3.6725 since 1997.
  // This is a fixed real-world constant (not subject to the live-data refresh
  // above), so it's a reliable check that the cross-rate direction is correct.
  // A prior version of this formula silently returned the reciprocal here.
  it('matches the fixed AED/USD peg (3.6725) within rounding tolerance', () => {
    const rate = getExchangeRate('AED', 'USD') // 1 AED → USD
    expect(rate).toBeCloseTo(1 / 3.6725, 2)
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
    // 1 USD → EUR: EXCHANGE_RATES.EUR / EXCHANGE_RATES.USD
    const expected = parseFloat((EXCHANGE_RATES['EUR'] / EXCHANGE_RATES['USD']).toPrecision(6))
    expect(rates['USD']).toBeCloseTo(expected, 5)
  })

  it('produces the correct rate for a non-EUR main currency (USD)', () => {
    const rates = buildDefaultRates('USD')
    // mainCurrency is USD: 1 EUR → USD = EXCHANGE_RATES.USD / EXCHANGE_RATES.EUR
    const expected = parseFloat((EXCHANGE_RATES['USD'] / EXCHANGE_RATES['EUR']).toPrecision(6))
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

  // Regression test: AED has been pegged to USD at exactly 3.6725 since 1997.
  it('seeded USD-main rate for AED matches the fixed peg', () => {
    const rates = buildDefaultRates('USD')
    // rates['AED'] = "1 AED = X USD" = 1 / 3.6725
    expect(rates['AED']).toBeCloseTo(1 / 3.6725, 2)
  })
})

// ---------------------------------------------------------------------------
// Sync between the currency picker data and the rate table
//
// Every currency selectable in the UI (ALL_CURRENCIES, from pickerData.ts)
// must have a corresponding entry in EXCHANGE_RATES — otherwise
// getExchangeRate() silently falls back to a 1:1 rate for that currency,
// which is wrong for any real conversion. (This caught a real gap: SSP was
// selectable in the UI but missing from EXCHANGE_RATES.)
// ---------------------------------------------------------------------------

describe('ALL_CURRENCIES / EXCHANGE_RATES sync', () => {
  it('every currency in the picker has a hardcoded exchange rate', () => {
    const missing = ALL_CURRENCIES.map(([code]) => code).filter(
      (code) => EXCHANGE_RATES[code] === undefined,
    )
    expect(missing).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// findStaleDefaultRates — client-side repair of pre-fix (backwards) rates
// ---------------------------------------------------------------------------

describe('findStaleDefaultRates', () => {
  it('flags a rate stored as the reciprocal of the correct value', () => {
    const correct = getExchangeRate('VND', 'EUR')
    const stale = { VND: 1 / correct } // exactly what the old buggy formula would have produced
    const result = findStaleDefaultRates(stale, 'EUR')
    expect(result.VND).toBeCloseTo(correct, 6)
  })

  it('does not flag an already-correct rate', () => {
    const correct = getExchangeRate('USD', 'EUR')
    const result = findStaleDefaultRates({ USD: correct }, 'EUR')
    expect(result).not.toHaveProperty('USD')
  })

  it('does not flag a rate the user has manually customized to something plausible', () => {
    // A hand-typed rate, close to correct but not identical (real customization, not a bug artifact)
    const correct = getExchangeRate('USD', 'EUR')
    const result = findStaleDefaultRates({ USD: correct * 1.05 }, 'EUR')
    expect(result).not.toHaveProperty('USD')
  })

  it('does not flag mainCurrency itself even if present', () => {
    const result = findStaleDefaultRates({ EUR: 1 }, 'EUR')
    expect(result).not.toHaveProperty('EUR')
  })

  it('ignores unknown currency codes (cannot verify against the hardcoded table)', () => {
    const result = findStaleDefaultRates({ ZZZ: 5 }, 'EUR')
    expect(result).not.toHaveProperty('ZZZ')
  })

  it('flags multiple stale entries in one travel and leaves valid ones alone', () => {
    const correctVND = getExchangeRate('VND', 'EUR')
    const correctUSD = getExchangeRate('USD', 'EUR')
    const result = findStaleDefaultRates(
      { VND: 1 / correctVND, USD: correctUSD },
      'EUR',
    )
    expect(result).toHaveProperty('VND')
    expect(result).not.toHaveProperty('USD')
  })
})
