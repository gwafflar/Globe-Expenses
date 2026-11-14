// useLanguageStore.ts — Zustand store holding the current UI language.
//
// Why a global store? Every component that shows text needs the language, and
// changing it in Profile must re-render the whole app at once. A Zustand store
// is the project's tool for that (same pattern as useAuthStore): components
// subscribe with a selector, e.g. useLanguageStore((s) => s.language), and
// React re-renders exactly those components when the value changes.
//
// Where the preference comes from, in priority order:
//   1. The user's profile (`users/{uid}.language`), applied at sign-in by
//      useAuthStore → applyProfilePreference(). Follows the user across devices.
//   2. localStorage — a copy of the last known preference on THIS device, so
//      the login page and the first paint (before the profile has loaded) are
//      already in the right language.
//   3. 'auto' → the browser language (navigator.languages).

import { create } from 'zustand'
import {
  intlLocaleFor,
  parsePreference,
  resolveLanguage,
  type Language,
  type LanguagePreference,
} from './languages'

const STORAGE_KEY = 'globeexpenses.language'

interface LanguageState {
  /** What the user chose. 'auto' = follow the browser. */
  preference: LanguagePreference
  /** The language actually displayed (preference resolved). */
  language: Language
  /** BCP 47 tag for Intl formatting, e.g. 'fr-BE' (see intlLocaleFor). */
  locale: string
  /** Changes the preference on this device: state + localStorage + <html lang>.
   *  Does NOT write Firestore — ProfilePage does that (see updateUserLanguage). */
  setPreference: (preference: LanguagePreference) => void
  /** Applies the preference stored on the profile at sign-in. A profile
   *  without one leaves the device's own preference untouched. */
  applyProfilePreference: (stored: unknown) => void
}

/** navigator.languages is the browser's ordered list; very old browsers only
 *  have navigator.language. Guarded for non-browser environments. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

// localStorage can throw (private mode, storage disabled) — never let a
// preference cache break the app.
function readStoredPreference(): LanguagePreference {
  try {
    return parsePreference(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

function writeStoredPreference(preference: LanguagePreference): void {
  try {
    if (preference === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* ignore — see readStoredPreference */
  }
}

/** Derives the displayed language + Intl locale from a preference. */
function resolve(preference: LanguagePreference) {
  const browser = browserLanguages()
  const language = resolveLanguage(preference, browser)
  return { preference, language, locale: intlLocaleFor(language, browser) }
}

/** Keeps <html lang="…"> in sync: screen readers and the browser's own
 *  translate offer read it. */
function syncHtmlLang(language: Language): void {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

const initial = resolve(readStoredPreference())
syncHtmlLang(initial.language)

export const useLanguageStore = create<LanguageState>((set, get) => ({
  ...initial,

  // Action: user picked a language (or 'auto') in Profile.
  setPreference: (preference) => {
    writeStoredPreference(preference)
    const next = resolve(preference)
    syncHtmlLang(next.language)
    set(next)
  },

  // Action: called once per sign-in with the raw Firestore value.
  applyProfilePreference: (stored) => {
    // Absent on the profile → the user never chose: keep whatever this device has.
    if (stored === undefined || stored === null) return
    const preference = parsePreference(stored)
    if (preference !== get().preference) get().setPreference(preference)
  },
}))

// The browser fires 'languagechange' when the OS/browser language changes while
// the app is open. Only matters in 'auto' mode — re-resolve so the UI follows.
if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => {
    const { preference } = useLanguageStore.getState()
    if (preference === 'auto') useLanguageStore.setState(resolve('auto'))
  })
}
