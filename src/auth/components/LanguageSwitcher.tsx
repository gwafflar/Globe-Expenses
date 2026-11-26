// LanguageSwitcher.tsx — compact language picker for signed-OUT pages
// (Welcome page, top-right corner).
//
// Unlike LanguageSelect (Profile), it writes nothing to Firestore: there is no
// user yet. It only sets this device's preference (store + localStorage), so:
//   - login and register pages, opened next, are already in that language;
//   - when the sign-up creates the profile, useAuthStore copies the choice
//     into `users/{uid}.language` (see languageForNewProfile()).
//
// A native <select> behind a small flag pill: the OS shows its own picker
// (good on phones), and it scales to any number of languages.

import { cn } from '@/lib/utils'
import {
  LANGUAGE_FLAGS,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  useLanguageStore,
  useT,
} from '@/i18n'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const t = useT() // translation hook — re-renders when the language changes
  // Zustand selectors: re-render only when the displayed language changes.
  const language = useLanguageStore((s) => s.language)
  const setPreference = useLanguageStore((s) => s.setPreference)

  return (
    // `relative` lets the invisible <select> cover the whole pill (absolute inset-0),
    // so a tap anywhere on it opens the native picker.
    // cn() (tailwind-merge) lets a caller's positioning class REPLACE `relative`:
    // with plain string concatenation both stay, CSS order makes `relative` win,
    // and `absolute right-4 top-4` from the page is silently ignored.
    <label
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1.5 text-sm text-muted-foreground shadow-sm hover:text-foreground',
        className,
      )}
    >
      {/* Flag + uppercase code ("🇫🇷 FR"): recognisable without reading the language. */}
      <span aria-hidden>{LANGUAGE_FLAGS[language]}</span>
      <span className="font-medium uppercase">{language}</span>
      <select
        aria-label={t.language.label}
        value={language}
        // An explicit choice (never 'auto'): the user picked a language on purpose.
        onChange={(e) => { if (isSupportedLanguage(e.target.value)) setPreference(e.target.value) }}
        className="absolute inset-0 cursor-pointer opacity-0" // invisible but clickable
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LANGUAGE_FLAGS[code]} {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  )
}
