// LanguageSelect.tsx — the UI language picker shown in Profile → Preferences.
//
// Applies on change (no Save button): the whole app re-renders in the new
// language right away, which is its own confirmation.
//
// Three things happen on change, cheapest first:
//   1. useLanguageStore.setPreference() — every component using useT()
//      re-renders; the choice is cached in localStorage for this device.
//   2. updateUserLanguage() — fire-and-forget Firestore write, so the choice
//      follows the user to their other devices at their next sign-in.
//   3. refreshPushToken() — rewrites this device's push token document with
//      the new language, so notifications arrive in it too (no-op when push
//      is off on this device).

import { useAuthStore } from '@/auth/store/useAuthStore'
import { updateUserLanguage } from '@/auth/services/userService'
import { refreshPushToken } from '@/notifications/services/pushService'
import {
  LANGUAGE_FLAGS,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  isSupportedLanguage,
  useLanguageStore,
  useT,
  type LanguagePreference,
} from '@/i18n'
import { Label } from '@/components/ui/label'

export function LanguageSelect({ uid }: { uid: string }) {
  const t = useT()
  // Zustand selectors: this component re-renders only when these values change.
  const preference = useLanguageStore((s) => s.preference)
  const setPreference = useLanguageStore((s) => s.setPreference)
  const userProfile = useAuthStore((s) => s.userProfile)
  const setUserProfile = useAuthStore((s) => s.setUserProfile)

  // What "Automatic" would resolve to on this browser, shown in its label.
  const browserLanguage = detectBrowserLanguage(
    navigator.languages?.length ? navigator.languages : [navigator.language],
  )

  function handleChange(value: string) {
    const next: LanguagePreference = isSupportedLanguage(value) ? value : 'auto'
    setPreference(next)
    updateUserLanguage(uid, next)
    // Keep the cached profile in step with what was just written.
    if (userProfile) setUserProfile({ ...userProfile, language: next })
    void refreshPushToken(uid)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="language">{t.language.label}</Label>
      <p className="text-xs text-muted-foreground">{t.language.hint}</p>
      {/* Native <select>: same look as the currency picker just above it. */}
      <select
        id="language"
        value={preference}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="auto">{t.language.auto({ browser: LANGUAGE_NAMES[browserLanguage] })}</option>
        {SUPPORTED_LANGUAGES.map((code) => (
          // Each language is listed under its own name ("Français", not
          // "French"), so a user stuck in a language they cannot read finds theirs.
          <option key={code} value={code} lang={code}>
            {LANGUAGE_FLAGS[code]} {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </div>
  )
}
