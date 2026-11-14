import { describe, expect, it } from 'vitest'
import {
  detectBrowserLanguage,
  intlLocaleFor,
  parsePreference,
  resolveLanguage,
} from './languages'
import { plural } from './plural'
import { MESSAGES } from './messages'

describe('detectBrowserLanguage', () => {
  it('takes the first supported language, by primary subtag', () => {
    expect(detectBrowserLanguage(['fr-BE', 'en-US'])).toBe('fr')
    expect(detectBrowserLanguage(['de-DE', 'en-GB', 'fr'])).toBe('en')
  })
  it('falls back to English when nothing is supported', () => {
    expect(detectBrowserLanguage(['de', 'nl'])).toBe('en')
    expect(detectBrowserLanguage([])).toBe('en')
  })
})

describe('resolveLanguage', () => {
  it('follows the browser in auto mode', () => {
    expect(resolveLanguage('auto', ['fr-FR'])).toBe('fr')
  })
  it('an explicit choice wins over the browser', () => {
    expect(resolveLanguage('en', ['fr-FR'])).toBe('en')
  })
})

describe('parsePreference', () => {
  it('accepts supported codes and auto, anything else is auto', () => {
    expect(parsePreference('fr')).toBe('fr')
    expect(parsePreference('auto')).toBe('auto')
    expect(parsePreference('de')).toBe('auto')
    expect(parsePreference(null)).toBe('auto')
    expect(parsePreference(42)).toBe('auto')
  })
})

describe('intlLocaleFor', () => {
  it('keeps the regional variant of the matching browser language', () => {
    expect(intlLocaleFor('fr', ['en-US', 'fr-BE'])).toBe('fr-BE')
  })
  it('uses the bare code when the browser has no match', () => {
    expect(intlLocaleFor('fr', ['en-US'])).toBe('fr')
  })
})

describe('plural', () => {
  it('applies each language rule for zero', () => {
    const forms = { one: 'one', other: 'other' }
    expect(plural('en', 0, forms)).toBe('other')
    expect(plural('fr', 0, forms)).toBe('one')
    expect(plural('en', 1, forms)).toBe('one')
    expect(plural('fr', 2, forms)).toBe('other')
  })
})

// The compiler already guarantees FR has every EN key. This catches what the
// type system cannot: an empty string, or a French value left in English by
// copy-paste (allowed only for words identical in both languages).
describe('message bundles', () => {
  // Single words are often identical ('Transactions', 'Notes', 'Total'), so
  // only multi-word strings are checked for being left in English. A phrase
  // that is genuinely the same in both languages goes in this allow-list.
  const SAME_IN_BOTH = new Set<string>([])

  function walk(en: unknown, fr: unknown, path: string, out: string[]) {
    if (typeof en === 'string') {
      if (typeof fr !== 'string' || fr.trim() === '') out.push(`${path}: empty`)
      else if (fr === en && /[a-z]{2,} [a-z]{2,}/i.test(en) && !SAME_IN_BOTH.has(en))
        out.push(`${path}: identical to English ("${en}")`)
      return
    }
    if (en && typeof en === 'object') {
      for (const key of Object.keys(en)) {
        walk((en as Record<string, unknown>)[key], (fr as Record<string, unknown>)?.[key], `${path}.${key}`, out)
      }
    }
  }

  it('every French string is filled and translated', () => {
    const problems: string[] = []
    walk(MESSAGES.en, MESSAGES.fr, 'messages', problems)
    expect(problems).toEqual([])
  })
})
