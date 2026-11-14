// PushPromptBanner.tsx — the single place where the "Get notified?" banner is
// drawn. Mounted once in ProtectedRoute, above every signed-in page.
//
// It shows nothing until some part of the app calls requestPushPrompt(...)
// and the no-nagging rules allow it (see usePushPromptStore).

import { Bell, X } from 'lucide-react'
import { usePushPromptStore } from '@/notifications/store/usePushPromptStore'

export function PushPromptBanner() {
  // Reading from the store subscribes this component to it: when `active`
  // changes, React re-renders the banner automatically.
  const { active, busy, enable, notNow, close } = usePushPromptStore()

  if (!active) return null

  return (
    // role="status": screen readers announce the banner without stealing focus.
    <div
      role="status"
      className="mx-4 my-2 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
    >
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />

      {/* min-w-0 lets long text wrap instead of pushing the buttons off-screen */}
      <div className="min-w-0 flex-1">
        <p className="text-sm">{active.message}</p>

        {active.variant === 'ios-install' ? (
          // iOS in a Safari tab: push is impossible until the app is installed.
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
            On iPhone, first add GlobeExpenses to your Home Screen: tap <strong>Share</strong>{' '}
            <span aria-hidden>&#11023;</span>, then <strong>"Add to Home Screen"</strong>, and enable
            notifications from the installed app.
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Enabling…' : 'Enable'}
            </button>
            <button
              type="button"
              onClick={notNow}
              disabled={busy}
              className="rounded-md px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-900"
            >
              Not now
            </button>
          </div>
        )}
      </div>

      {active.variant === 'ios-install' && (
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 text-blue-400 hover:text-blue-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
