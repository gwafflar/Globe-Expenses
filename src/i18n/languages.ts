// languages.ts — the list of UI languages and the pure rules for picking one.
//
// No React, no Zustand, no Firebase here: everything is a pure function of its
// inputs so it can be unit-tested (see languages.test.ts).
//
// ── Adding a language ─────────────────────────────────────────────────────
//   1. Add its code to SUPPORTED_LANGUAGES and its native name to LANGUAGE_NAMES.
//   2. Copy src/i18n/messages/en/ to messages/<code>/ and translate every file.
//      TypeScript refuses to compile until every key exists with the same shape.
//   3. Register the new bundle in src/i18n/messages/index.ts.
//   4. Add the push texts in functions/src/push/text.ts (Cloud Functions are a
//      separate package and cannot import from src/).

/** UI languages, in the order they are offered in the Profile picker. */
export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const

/** `'en' | 'fr'` — derived from the array above so the two never drift. */
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

/** What the user chose in Profile. `'auto'` = follow the browser language. */
export type LanguagePreference = Language | 'auto'

/** Used when the browser asks for nothing we support. */
export const FALLBACK_LANGUAGE: Language = 'en'

/** Each language's name written in that language, as shown in the picker.
 *  `Record<Language, string>` makes TypeScript require one entry per language. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
}

/** Flag shown next to each language in the pickers. English uses the UK flag
 *  (product choice), not the US one. Record<Language, …> = one per language. */
export const LANGUAGE_FLAGS: Record<Language, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
}

/** Type guard: narrows an unknown value (Firestore, localStorage) to Language. */
export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/** Narrows an unknown stored value to a preference; anything unknown = 'auto'. */
export function parsePreference(value: unknown): LanguagePreference {
  return isSupportedLanguage(value) ? value : 'auto'
}

/**
 * First supported language among the browser's preferred ones.
 * `navigator.languages` is ordered by preference, e.g. ['fr-BE', 'fr', 'en-US'].
 * Only the primary subtag matters: 'fr-BE' → 'fr'.
 */
export function detectBrowserLanguage(browserLanguages: readonly string[]): Language {
  for (const tag of browserLanguages) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isSupportedLanguage(primary)) return primary
  }
  return FALLBACK_LANGUAGE
}

/**
 * The `language` to store on a NEW user profile, from this device's
 * preference at sign-up time. An explicit choice (e.g. made on the Welcome
 * page) is kept; 'auto' gives `undefined` = field omitted = "never chose",
 * so each of the user's devices keeps following its own browser.
 */
export function languageForNewProfile(preference: LanguagePreference): Language | undefined {
  return preference === 'auto' ? undefined : preference
}

/** The language actually shown: the explicit choice, or the browser's. */
export function resolveLanguage(
  preference: LanguagePreference,
  browserLanguages: readonly string[],
): Language {
  return preference === 'auto' ? detectBrowserLanguage(browserLanguages) : preference
}

/**
 * The BCP 47 tag handed to Intl (dates, numbers, country and currency names).
 *
 * Keeps the browser's regional variant when it matches the UI language, so a
 * Belgian browser in French gets 'fr-BE' formatting and a British one in English
 * gets 'en-GB' dates. Otherwise the bare language code ('fr', 'en').
 */
export function intlLocaleFor(language: Language, browserLanguages: readonly string[]): string {
  const match = browserLanguages.find((tag) => tag.toLowerCase().split('-')[0] === language)
  return match ?? language
}
