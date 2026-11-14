import { describe, expect, it } from 'vitest'
import {
  displayCountryName,
  findCountry,
  getFlagForCountry,
  localizedCountryName,
  localizedCurrencyName,
} from './pickerData'

describe('getFlagForCountry', () => {
  it('returns the flag emoji, not the ISO code', () => {
    expect(getFlagForCountry('Japan')).toBe('🇯🇵')
    expect(getFlagForCountry('  japan ')).toBe('🇯🇵')
  })
  it('falls back to the globe for unknown names', () => {
    expect(getFlagForCountry('Atlantis')).toBe('🌍')
  })
})

describe('localised country names', () => {
  it('translates from the ISO code', () => {
    expect(localizedCountryName('JP', 'fr')).toBe('Japon')
    expect(localizedCountryName('JP', 'en')).toBe('Japan')
  })
  it('displays a stored English name in the UI language', () => {
    expect(displayCountryName('Japan', 'fr')).toBe('Japon')
    expect(displayCountryName('Germany', 'fr-BE')).toBe('Allemagne')
  })
  it('leaves unknown stored values untouched', () => {
    expect(displayCountryName('Bali', 'fr')).toBe('Bali')
  })
  it('finds a country typed in English or in the UI language', () => {
    expect(findCountry('Japon', 'fr')?.[2]).toBe('Japan')
    expect(findCountry('japan', 'fr')?.[2]).toBe('Japan')
    expect(findCountry('Japon', 'en')).toBeUndefined()
    expect(findCountry('', 'fr')).toBeUndefined()
  })
})

describe('localizedCurrencyName', () => {
  it('uses the Intl currency names', () => {
    expect(localizedCurrencyName('EUR', 'fr').toLowerCase()).toBe('euro')
    expect(localizedCurrencyName('JPY', 'en')).toBe('Japanese Yen')
  })
})
