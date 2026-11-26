// GooglePwaHint.tsx — help message shown on PWA when Google sign-in may have issues.
// Offers a "copy link" button so the user can paste the URL in their system browser.
//
// Visibility is driven by a sessionStorage flag ("pwa-google-attempted") that survives
// the signInWithRedirect round-trip. The flag is set before the redirect and checked
// on the next mount via isPwaGoogleAttempted(). It is cleared on successful auth
// (the page navigates away and the session ends naturally).

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { useT } from '@/i18n'

/** The deployed web app URL the user should open in their system browser */
const WEB_APP_URL = 'https://globe-expenses.web.app'

/** SessionStorage key used to persist the "attempted Google sign-in on PWA" flag */
const PWA_GOOGLE_KEY = 'pwa-google-attempted'

/** Call before signInWithRedirect on PWA to mark that a Google attempt is in progress */
export function markPwaGoogleAttempted(): void {
  try { sessionStorage.setItem(PWA_GOOGLE_KEY, '1') } catch { /* quota/private mode */ }
}

/** Returns true if a Google sign-in was attempted on PWA (survives the redirect) */
export function isPwaGoogleAttempted(): boolean {
  try { return sessionStorage.getItem(PWA_GOOGLE_KEY) === '1' } catch { return false }
}

/** Clear the flag (e.g. after successful auth or manual dismiss) */
export function clearPwaGoogleAttempted(): void {
  try { sessionStorage.removeItem(PWA_GOOGLE_KEY) } catch { /* noop */ }
}

interface GooglePwaHintProps {
  visible: boolean
}

export function GooglePwaHint({ visible }: GooglePwaHintProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Tracks the "copied!" confirmation state for the copy-link button
  const [copied, setCopied] = useState(false)

  if (!visible) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(WEB_APP_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: some browsers block clipboard in certain contexts — ignore silently
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-amber-800 dark:text-amber-200">
        {t.auth.pwaHint.message}
      </p>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 gap-1.5 border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? t.common.copied : WEB_APP_URL}
      </Button>
    </div>
  )
}
