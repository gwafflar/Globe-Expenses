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
 * If `travelRates` is provided, it is used as the primary source.
 * `travelRates` stores rates relative to the travel's mainCurrency:
 *   travelRates[currency] = how many mainCurrency units per 1 unit of that currency.
 *   Example: travelRates["USD"] = 0.92 → 1 USD = 0.92 mainCurrency.
 *
 * Fallback: if the currency is not in travelRates, derive from the hardcoded
 * EXCHANGE_RATES table via cross-rate through EUR.
 *
 *   Cross-rate derivation (hardcoded fallback):
 *   Both rates are stored as "X EUR per 1 unit".
 *   currency → mainCurrency  =  EXCHANGE_RATES[currency] / EXCHANGE_RATES[mainCurrency]
 */
export function getExchangeRate(
  currency: string,
  mainCurrency: string,
  travelRates?: Record<string, number>,
): number {
  // Trivial case: same currency, rate is exactly 1.
  if (currency === mainCurrency) return 1.0

  // 1. Try travel-specific rates first (already stored relative to mainCurrency).
  if (travelRates?.[currency] !== undefined) {
    return travelRates[currency]
  }

  // 2. Fallback: derive from hardcoded EUR-based table.
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

/**
 * Builds initial defaultRates for a given mainCurrency from the hardcoded table.
 * Returns rates for all supported currencies except the mainCurrency itself.
 * Each rate = "1 unit of currency = X mainCurrency".
 */
export function buildDefaultRates(mainCurrency: string): Record<string, number> {
  const rates: Record<string, number> = {}
  const toRate = EXCHANGE_RATES[mainCurrency]
  if (toRate === undefined) return rates

  for (const [code, fromRate] of Object.entries(EXCHANGE_RATES)) {
    if (code === mainCurrency) continue
    // Round to 6 significant digits to avoid floating-point noise
    rates[code] = parseFloat((fromRate / toRate).toPrecision(6))
  }
  return rates
}