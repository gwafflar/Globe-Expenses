// i18n/index.ts — the public API of the translation module. Import from
// '@/i18n' only, never from the files inside.
//
// ── How a component shows text ────────────────────────────────────────────
//   const t = useT()                      // hook: re-renders on language change
//   <Button>{t.common.save}</Button>      // plain string
//   <p>{t.balance.owes({ from, to })}</p> // message with parameters = a function
//
// The messages are plain TypeScript objects, so keys autocomplete and a typo
// or a missing French string is a compile error rather than a blank label.
//
// ── Outside React (plain .ts helpers, services) ───────────────────────────
//   getT().common.save — reads the CURRENT language once, does not subscribe.
//   Fine for code that runs during a render (the calling component re-renders
//   on a language change, so the helper is called again) or for one-off
//   messages such as an error thrown by a service.
//
// ── Dates and numbers ─────────────────────────────────────────────────────
//   useLocale() / getLocale() → a BCP 47 tag for Intl, e.g.
//   d.toLocaleDateString(locale, …). Never pass `undefined` (that is the
//   browser's language, which may differ from the app's).

import { useLanguageStore } from './useLanguageStore'
import { MESSAGES, type Messages } from './messages'
import type { Language } from './languages'

export type { Messages }
export type { Language, LanguagePreference } from './languages'
export {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  LANGUAGE_FLAGS,
  isSupportedLanguage,
  detectBrowserLanguage,
  languageForNewProfile,
} from './languages'
export { plural, type PluralForms } from './plural'
export { useLanguageStore } from './useLanguageStore'

/** Hook: the messages of the current language. Subscribes to the language
 *  store with a selector, so only a language change re-renders the caller. */
export function useT(): Messages {
  const language = useLanguageStore((s) => s.language)
  return MESSAGES[language]
}

// Set only while withLanguage() runs; overrides the store for getT() & co.
let forcedLanguage: Language | null = null

/**
 * Runs a SYNCHRONOUS function with getT() / getLanguage() / getLocale()
 * answering in `language`, whatever the UI language is. Used by the XLSX
 * export, whose content must stay English (Spec decision #102) while it
 * reuses label helpers shared with the UI.
 *
 * ⚠️ Synchronous only: the override is undone as soon as `fn` returns, so any
 * code after an `await` inside `fn` would see the UI language again.
 */
export function withLanguage<T>(language: Language, fn: () => T): T {
  const previous = forcedLanguage
  forcedLanguage = language
  try {
    return fn()
  } finally {
    forcedLanguage = previous // try/finally: restored even if fn throws
  }
}

function currentLanguage(): Language {
  return forcedLanguage ?? useLanguageStore.getState().language
}

/** Non-hook version for plain TypeScript code. Does not subscribe. */
export function getT(): Messages {
  return MESSAGES[currentLanguage()]
}

/** Hook: the current UI language code ('en' | 'fr'). */
export function useLanguage(): Language {
  return useLanguageStore((s) => s.language)
}

/** Non-hook version of useLanguage(). */
export function getLanguage(): Language {
  return currentLanguage()
}

/** Hook: the Intl locale tag for dates and numbers, e.g. 'fr-BE'. */
export function useLocale(): string {
  return useLanguageStore((s) => s.locale)
}

/** Non-hook version of useLocale(). */
export function getLocale(): string {
  // Under withLanguage() the bare code is enough: no regional variant applies.
  return forcedLanguage ?? useLanguageStore.getState().locale
}
