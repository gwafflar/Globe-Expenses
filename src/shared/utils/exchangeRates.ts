// exchangeRates.ts — hardcoded currency exchange rates for v1.
// All rates are expressed as "1 unit of currency = X EUR".
// This means EUR itself has a rate of 1.0 (it's the reference).
// Example: USD = 0.92 means 1 USD = 0.92 EUR.

export const EXCHANGE_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 0.92,
  GBP: 1.17,
  JPY: 0.0062,
  SGD: 0.69,
  THB: 0.026,
  MYR: 0.20,
  IDR: 0.000057,
  CHF: 1.04,
  AUD: 0.60,
  CAD: 0.68,
  HKD: 0.12,
  NOK: 0.085,
  SEK: 0.088,
  DKK: 0.134,
}

// Sorted list of all supported currency codes, derived from the keys above.
// Array.from + Object.keys gives us a plain string[], then sort() alphabetises it.
export const SUPPORTED_CURRENCIES: string[] = Array.from(Object.keys(EXCHANGE_RATES)).sort()

/**
 * Returns the exchange rate to convert 1 unit of `currency` into `mainCurrency`.
 *
 * Cross-rate derivation:
 *   Both rates are stored as "X EUR per 1 unit".
 *   So:  currency → EUR  =  EXCHANGE_RATES[currency]
 *        EUR → mainCurrency  =  1 / EXCHANGE_RATES[mainCurrency]
 *   Combined:  currency → mainCurrency  =  EXCHANGE_RATES[currency] / EXCHANGE_RATES[mainCurrency]
 *
 *   Example: 1 USD → MYR
 *     EXCHANGE_RATES[USD] = 0.92  (1 USD = 0.92 EUR)
 *     EXCHANGE_RATES[MYR] = 0.20  (1 MYR = 0.20 EUR, so 1 EUR = 5 MYR)
 *     result = 0.92 / 0.20 = 4.6  → 1 USD = 4.6 MYR  ✓
 */
export function getExchangeRate(currency: string, mainCurrency: string): number {
  // Trivial case: same currency, rate is exactly 1.
  if (currency === mainCurrency) return 1.0

  const fromRate = EXCHANGE_RATES[currency]
  const toRate = EXCHANGE_RATES[mainCurrency]

  // If either code is not in our table, warn and return 1.0 as a safe fallback
  // (the amount will be stored unchanged rather than silently corrupted).
  if (fromRate === undefined || toRate === undefined) {
    console.warn(
      `getExchangeRate: unknown currency code — currency="${currency}", mainCurrency="${mainCurrency}". Falling back to 1.0.`,
    )
    return 1.0
  }

  return fromRate / toRate
}