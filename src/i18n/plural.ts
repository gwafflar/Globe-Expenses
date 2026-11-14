// plural.ts — picks the right plural form for a count, per language rules.
//
// Languages disagree on plurals: English says "0 transactions", French says
// "0 transaction" (0 and 1 are both singular in French). Intl.PluralRules is
// the browser's built-in table of those rules, so we never hard-code `n === 1`.

import type { Language } from './languages'

/** The forms a message must provide. `one` and `other` cover EN and FR; a
 *  later language that needs more (e.g. Polish 'few'/'many') can add optional
 *  keys here without breaking the existing messages. */
export interface PluralForms {
  one: string
  other: string
}

// One PluralRules object per language, created on first use (they are not free).
const rulesCache = new Map<Language, Intl.PluralRules>()

/**
 * plural('fr', 0, { one: '0 transaction', other: '0 transactions' }) → '0 transaction'
 * plural('en', 0, { one: '0 transaction', other: '0 transactions' }) → '0 transactions'
 */
export function plural(language: Language, count: number, forms: PluralForms): string {
  let rules = rulesCache.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(language)
    rulesCache.set(language, rules)
  }
  return rules.select(count) === 'one' ? forms.one : forms.other
}
