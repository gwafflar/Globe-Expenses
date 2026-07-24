// exchangeRates.ts — hardcoded currency exchange rates for v1.
// In v2, this will be replaced with dynamic rates fetched from an API (see
// SESSION_LOG / spec Tier 2 roadmap: Cloud-Function-refreshed config/exchangeRates doc).
//
// Refreshed 2026-07-24 from https://open.er-api.com (ECB-derived, EUR base).
//
// Convention: each value is "how many units of this currency equal 1 EUR"
// (the standard EUR-base forex quote — e.g. AED: 4.18 means 1 EUR = 4.18 AED).
// EUR itself is the reference, rate 1.0.
//
// IMPORTANT: this is the OPPOSITE of "1 unit of currency = X EUR". To get the
// value of 1 unit of `currency` in EUR, divide: 1 / EXCHANGE_RATES[currency].
// (A previous version of this file/comment had this backwards, which inverted
// every cross-currency conversion in getExchangeRate() below — verified via
// the fixed AED/USD peg of 3.6725, fixed 2026-07-24.)

export const EXCHANGE_RATES: Record<string, number> = {
  AED: 4.18194,
  AFN: 75.2944,
  ALL: 93.8408,
  AMD: 418.041,
  ANG: 2.0383,
  AOA: 1074.39,
  ARS: 1696.42,
  AUD: 1.63179,
  AWG: 2.0383,
  AZN: 1.94075,
  BAM: 1.95583,
  BBD: 2.27743,
  BDT: 140.543,
  BGN: 1.95583,
  BHD: 0.428157,
  BIF: 3422.5,
  BMD: 1.13872,
  BND: 1.47115,
  BOB: 12.5966,
  BRL: 5.78017,
  BSD: 1.13872,
  BTN: 109.934,
  BWP: 16.1729,
  BYN: 3.29223,
  BZD: 2.27743,
  CAD: 1.60295,
  CDF: 2646.38,
  CHF: 0.929484,
  CLP: 1069.01,
  CNY: 7.7213,
  COP: 3662.7,
  CRC: 518.287,
  CUP: 27.3292,
  CVE: 110.265,
  CZK: 24.1878,
  DJF: 202.374,
  DKK: 7.46382,
  DOP: 66.3654,
  DZD: 152.13,
  EGP: 58.4981,
  ERN: 17.0807,
  ETB: 186.666,
  EUR: 1.0,
  FJD: 2.54888,
  FKP: 0.854057,
  GBP: 0.854061,
  GEL: 2.99859,
  GHS: 13.2765,
  GIP: 0.854057,
  GMD: 84.8568,
  GNF: 10014.2,
  GTQ: 8.71435,
  GYD: 239.109,
  HKD: 8.92318,
  HNL: 30.5942,
  HTG: 149.52,
  HUF: 364.257,
  IDR: 20364,
  ILS: 3.4978,
  INR: 109.92,
  IQD: 1497.74,
  IRR: 1568630,
  ISK: 143.395,
  JMD: 181.04,
  JOD: 0.80735,
  JPY: 186.346,
  KES: 147.784,
  KGS: 99.7977,
  KHR: 4631.17,
  KMF: 491.968,
  KPW: 900,       // No real forex market (N. Korea) — rough placeholder, verify before use
  KRW: 1678.39,
  KWD: 0.352256,
  KYD: 0.94893,
  KZT: 533.53,
  LAK: 25584.9,
  LBP: 101915,
  LKR: 382.883,
  LRD: 206.956,
  LSL: 19.0429,
  LYD: 7.32247,
  MAD: 10.6789,
  MDL: 20.0017,
  MGA: 4873.1,
  MKD: 61.489,
  MMK: 2396.25,
  MNT: 4093.77,
  MOP: 9.19378,
  MRU: 45.8771,
  MUR: 53.7655,
  MVR: 17.6593,
  MWK: 1990.35,
  MXN: 19.9191,
  MYR: 4.65639,
  MZN: 72.7292,
  NAD: 19.0429,
  NGN: 1555.6,
  NIO: 42.0329,
  NOK: 10.941,
  NPR: 175.895,
  NZD: 1.97023,
  OMR: 0.437833,
  PAB: 1.13872,
  PEN: 3.87031,
  PGK: 5.06529,
  PHP: 70.3121,
  PKR: 316.426,
  PLN: 4.33001,
  PYG: 6911.29,
  QAR: 4.14493,
  RON: 5.23484,
  RSD: 117.425,
  RUB: 89.6605,
  RWF: 1677.74,
  SAR: 4.27019,
  SBD: 9.17883,
  SCR: 16.0978,
  SDG: 510.84,
  SEK: 11.0994,
  SGD: 1.47114,
  SHP: 0.854057,
  SLE: 27.7439,
  SOS: 653.004,
  SRD: 43.2288,
  SSP: 5575.24,
  STN: 24.5,
  SYP: 139.066,
  SZL: 19.0429,
  THB: 38.5037,
  TJS: 10.5413,
  TMT: 3.99221,
  TND: 3.36118,
  TOP: 2.69223,
  TRY: 53.8299,
  TTD: 8.23699,
  TWD: 36.7979,
  TZS: 2988.55,
  UAH: 51.1637,
  UGX: 4218.32,
  USD: 1.1387,
  UYU: 45.8605,
  UZS: 13841.1,
  VES: 844.219,
  VND: 29897.9,
  VUV: 135.013,
  WST: 3.09209,
  XAF: 655.957,
  XCD: 3.07454,
  XOF: 655.957,
  XPF: 119.332,
  YER: 271.96,
  ZAR: 19.0436,
  ZMW: 21.0571,
  ZWL: 30.489,
}

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
 *   EXCHANGE_RATES stores "units of X per 1 EUR" (standard EUR-base quote).
 *   So 1 unit of `currency` = (1 / EXCHANGE_RATES[currency]) EUR, and converting
 *   that to `mainCurrency` gives:
 *     currency → mainCurrency  =  EXCHANGE_RATES[mainCurrency] / EXCHANGE_RATES[currency]
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

  return toRate / fromRate
}

/**
 * Returns false when getExchangeRate() would have to fall back to the 1.0
 * "unknown currency" default — i.e. neither travelRates nor the hardcoded
 * table has a real rate for this pair. Used to surface a warning in the UI
 * instead of only logging to the console (which nobody sees in production).
 */
export function hasExchangeRate(
  currency: string,
  mainCurrency: string,
  travelRates?: Record<string, number>,
): boolean {
  if (currency === mainCurrency) return true
  if (travelRates?.[currency] !== undefined) return true
  return EXCHANGE_RATES[currency] !== undefined && EXCHANGE_RATES[mainCurrency] !== undefined
}

/**
 * One-time client-side repair: detects Travel.defaultRates entries that were
 * seeded (or saved) while getExchangeRate()/buildDefaultRates() computed the
 * reciprocal of the correct rate (fixed 2026-07-24 — see comments above).
 *
 * A stored value is flagged only when it sits close to the RECIPROCAL of the
 * currently-correct hardcoded rate, and clearly NOT close to the correct rate
 * itself — this avoids "fixing" a rate the user has since manually corrected,
 * or one that's merely stale due to normal market movement (which stays in
 * the same order of magnitude as the correct rate, not its reciprocal).
 *
 * Returns only the entries that should change: { code: correctedRate }.
 */
export function findStaleDefaultRates(
  defaultRates: Record<string, number>,
  mainCurrency: string,
): Record<string, number> {
  const corrections: Record<string, number> = {}
  // A currency pair is close enough to "correct" or "reciprocal" within ±30%.
  const TOLERANCE = Math.log(1.3)

  for (const [code, stored] of Object.entries(defaultRates)) {
    if (code === mainCurrency || !(stored > 0)) continue

    const correct = getExchangeRate(code, mainCurrency) // hardcoded-table-only reference
    // getExchangeRate falls back to exactly 1.0 for an unrecognized code — can't verify those.
    if (correct === 1.0) continue

    const distToCorrect = Math.abs(Math.log(stored / correct))
    const distToReciprocal = Math.abs(Math.log(stored * correct))

    if (distToReciprocal < TOLERANCE && distToCorrect > TOLERANCE) {
      corrections[code] = correct
    }
  }
  return corrections
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
    rates[code] = parseFloat((toRate / fromRate).toPrecision(6))
  }
  return rates
}
