// exchangeRates.ts — hardcoded currency exchange rates for v1.
// In v2, this will be replaced with dynamic rates fetched from an API.
// All rates are expressed as "1 unit of currency = X EUR".
// This means EUR itself has a rate of 1.0 (it's the reference).
// Example: USD = 0.92 means 1 USD = 0.92 EUR.

export const EXCHANGE_RATES: Record<string, number> = {
  EUR: 1.0,
  AED: 4.359,
  AFN: 94.72,
  ALL: 121.57,
  AMD: 467.10,
  ANG: 2.136,
  AOA: 757.85,
  ARS: 114.78,
  AUD: 1.62,
  AWG: 2.136,
  AZN: 2.02,
  BAM: 1.95,
  BBD: 2.396,
  BDT: 100.74,
  BGN: 1.957,
  BHD: 0.4475,
  BIF: 2351.88,
  BMD: 1.1867,
  BND: 1.6056,
  BOB: 8.1936,
  BRL: 6.1814,
  BSD: 1.1866,
  BTN: 88.18,
  BWP: 13.0686,
  BYN: 2.9606,
  BZD: 2.3918,
  CAD: 1.4807,
  CDF: 2374.59,
  CHF: 1.0745,
  CLP: 897.92,
  CNY: 7.6679,
  COP: 4602.02,
  CRC: 735.44,
  CUP: 31.4476,
  CVE: 109.94,
  CZK: 25.4949,
  DJF: 210.90,
  DKK: 7.4379,
  DOP: 67.6609,
  DZD: 159.84,
  EGP: 18.643,
  ERN: 17.8055,
  ETB: 52.5718,
  FJD: 2.4734,
  FKP: 0.8577,
  GBP: 0.8534,
  GEL: 3.6610,
  GHS: 7.0960,
  GIP: 0.8577,
  GMD: 60.7002,
  GNF: 11587.33,
  GTQ: 9.1963,
  GYD: 247.82,
  HKD: 9.2232,
  HNL: 28.1527,
  HTG: 113.8662,
  HUF: 358.28,
  IDR: 17135.59,
  ILS: 3.8293,
  INR: 88.2659,
  IQD: 1731.28,
  IRR: 49966.00,
  ISK: 146.80,
  JMD: 184.02,
  JOD: 0.8414,
  JPY: 130.16,
  KES: 128.88,
  KGS: 100.58,
  KHR: 4830.71,
  KMF: 493.67,
  KPW: 1068.03,
  KRW: 1366.99,
  KWD: 0.3565,
  KYD: 0.9889,
  KZT: 504.96,
  LAK: 11328.69,
  LBP: 1794.19,
  LKR: 236.73,
  LRD: 203.70,
  LSL: 17.6111,
  LYD: 5.3499,
  MAD: 10.5562,
  MDL: 21.2405,
  MGA: 4528.16,
  MKD: 61.3485,
  MMK: 1953.18,
  MNT: 3379.86,
  MOP: 9.5014,
  MRU: 130.68,
  MUR: 50.39,
  MVR: 18.3349,
  MWK: 964.14,
  MXN: 23.5936,
  MYR: 5.0083,
  MZN: 75.5102,
  NAD: 17.6111,
  NGN: 488.29,
  NIO: 41.6678,
  NOK: 10.4632,
  NPR: 141.09,
  NZD: 1.7018,
  OMR: 0.4570,
  PAB: 1.1867,
  PEN: 4.6570,
  PGK: 4.1665,
  PHP: 59.331,
  PKR: 192.9444,
  PLN: 4.5673,
  PYG: 8195.36,
  QAR: 4.3208,
  RON: 4.9150,
  RSD: 117.2283,
  RUB: 86.8064,
  RWF: 1195.4043,
  SAR: 4.4505,
  SBD: 9.5664,
  SCR: 17.0604,
  SDG: 529.8659,
  SEK: 10.1996,
  SGD: 1.6072,
  SHP: 0.8577,
  SLE: 12169.61,
  SOS: 694.2199,
  SRD: 25.4014,
  STN: 24445.81,
  SYP: 1492.1159,
  SZL: 17.2837,
  THB: 39.2608,
  TJS: 13.5334,
  TMT: 4.1653,
  TND: 3.3115,
  TOP: 2.6774,
  TRY: 10.0324,
  TTD: 8.0617,
  TWD: 33.1568,
  TZS: 2751.7710,
  UAH: 31.8392,
  UGX: 4216.0299,
  USD: 1.1867,
  UYU: 51.9803,
  UZS: 12628.5275,
  VES: 0.001,       // Placeholder (practically hyperinflated; use local source)
  VND: 27240.6984,
  VUV: 130.6779,
  WST: 3.0281,
  XAF: 654.0225,
  XCD: 3.2071,
  XOF: 654.0225,
  XPF: 120.3911,
  YER: 296.7979,
  ZAR: 17.3306,
  ZMW: 22.8247,
  ZWL: 382.1177,
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