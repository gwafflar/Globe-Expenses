// InstallPromptBanner.tsx — shows a contextual "install the app" prompt on
// mobile browsers when the PWA is not already installed.
//
// Platform behaviour:
//   Android Chrome  → the `beforeinstallprompt` event is captured early in
//                     main.tsx via installPrompt.ts; we read it synchronously
//                     here and show a banner with a native "Install" button.
//   Android (other) → Firefox, Samsung Internet etc. don't fire that event;
//                     we show generic "open the browser menu → Add to Home
//                     Screen" instructions instead.
//   iOS Safari      → no programmatic install API; show manual instructions
//                     ("Tap Share → Add to Home Screen").
//   Installed PWA   → already standalone; banner never shown.
//   Desktop         → never shown.
//
// One-time dismissal is persisted in localStorage.

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import {
  getDeferredInstallPrompt,
  clearDeferredInstallPrompt,
  type BeforeInstallPromptEvent,
} from '@/shared/utils/installPrompt'
import { useT } from '@/i18n'

const DISMISSED_KEY = 'pwa-install-dismissed'

// True when running as an installed PWA (standalone window, no browser chrome).
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari on iOS sets this when launched from the home screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// True on iOS Safari. Chrome/Firefox on iOS include CriOS/FxiOS in their UA.
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua)
}

// True on any Android device/emulation.
function isAndroid(): boolean {
  return /Android/i.test(window.navigator.userAgent)
}

// Broad mobile check.
function isMobileDevice(): boolean {
  return isIosSafari() || isAndroid() || /Mobi/i.test(window.navigator.userAgent)
}

export function InstallPromptBanner() {
  // translation hook — re-renders when the language changes
  const t = useT()
  const ti = t.social.install // shorthand
  // 'chrome'  → Android Chrome with native install prompt available
  // 'android' → Android but no install prompt (Firefox, Samsung Internet, etc.)
  // 'ios'     → iOS Safari, manual instructions
  // null      → don't show
  const [mode, setMode] = useState<'chrome' | 'android' | 'ios' | null>(null)
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (!isMobileDevice()) return

    if (isIosSafari()) {
      setMode('ios')
      return
    }

    if (isAndroid()) {
      // Check if beforeinstallprompt was captured early by installPrompt.ts
      const captured = getDeferredInstallPrompt()
      if (captured) {
        setPrompt(captured)
        setMode('chrome')
      } else {
        // Firefox Android, Samsung Internet, etc. — no native prompt; show instructions.
        setMode('android')
      }
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setMode(null)
  }

  async function handleInstall() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setMode(null)
      clearDeferredInstallPrompt()
    }
  }

  if (!mode) return null

  return (
    <div className="mx-4 mb-3 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
      <Download className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{ti.title}</p>

        {mode === 'ios' && (
          // iOS Safari: tap the Share icon (box with up-arrow) → "Add to Home Screen"
          <p className="mt-0.5 text-xs text-blue-700">
            {ti.ios({ icon: <span aria-hidden>&#11023;</span> })}
          </p>
        )}

        {mode === 'chrome' && (
          <p className="mt-0.5 text-xs text-blue-700">
            {ti.chrome}
          </p>
        )}

        {mode === 'android' && (
          // Firefox / Samsung Internet / other Android browsers
          <p className="mt-0.5 text-xs text-blue-700">
            {ti.android()}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Android Chrome: show an Install button that triggers the native prompt */}
        {mode === 'chrome' && prompt && (
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            {ti.install}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={ti.dismiss}
          className="text-blue-400 hover:text-blue-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
