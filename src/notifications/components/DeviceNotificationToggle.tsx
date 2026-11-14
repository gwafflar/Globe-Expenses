// DeviceNotificationToggle.tsx — Profile → Preferences: the master switch for
// push notifications on THIS device (docs/NOTIFICATIONS_SPEC.md §9.2).
//
// What it shows depends on the live push state (usePushState):
//   ios-needs-install → how to add the app to the Home Screen
//   prompt            → [Enable] button (tap → OS permission prompt)
//   on / off          → a switch
//   blocked           → how to unblock in the phone's settings
//   unsupported       → a one-line explanation

import { useState } from 'react'
import { Switch } from '@/shared/components/Switch'
import { Button } from '@/components/ui/button'
import { usePushState } from '@/notifications/hooks/usePushState'
import { disablePush, enablePush } from '@/notifications/services/pushService'

export function DeviceNotificationToggle({ uid }: { uid: string }) {
  const { state } = usePushState(uid)
  // `busy` disables the control while the token is being created / removed.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ⚠️ Called straight from the tap, and enablePush() is the first call: the OS
  // prompt only opens while the tap is still "active" (required on iOS).
  async function handleChange(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      await (on ? enablePush(uid) : disablePush(uid))
    } catch (err) {
      console.error('[DeviceNotificationToggle] failed:', err)
      setError("Couldn't update notifications. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  // First read still in flight: render nothing rather than a flickering switch.
  if (state === null) return null

  return (
    <div className="flex flex-col gap-1">
      {state === 'ios-needs-install' && (
        <div>
          <p className="text-sm font-medium">🔔 Notifications</p>
          <p className="text-xs text-muted-foreground">
            To get notifications on iPhone, add GlobeExpenses to your Home Screen: tap{' '}
            <strong>Share</strong> <span aria-hidden>&#11023;</span>, then{' '}
            <strong>"Add to Home Screen"</strong>.
          </p>
        </div>
      )}

      {state === 'unsupported' && (
        <div>
          <p className="text-sm font-medium">🔔 Notifications</p>
          <p className="text-xs text-muted-foreground">This browser doesn't support push notifications.</p>
        </div>
      )}

      {state === 'blocked' && (
        <div>
          <p className="text-sm font-medium">🔔 Notifications are blocked on this device.</p>
          <p className="text-xs text-muted-foreground">
            Re-enable them in your phone's settings → GlobeExpenses (or in the browser's site settings).
          </p>
        </div>
      )}

      {state === 'prompt' && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">🔔 Notifications on this device</p>
            <p className="text-xs text-muted-foreground">
              Get notified when someone adds or changes a transaction involving you.
            </p>
          </div>
          <Button type="button" onClick={() => void handleChange(true)} disabled={busy}>
            {busy ? 'Enabling…' : 'Enable'}
          </Button>
        </div>
      )}

      {(state === 'on' || state === 'off') && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">🔔 Notifications on this device</p>
            <p className="text-xs text-muted-foreground">
              {state === 'on'
                ? 'On. Each space can be muted from its Parameters tab.'
                : 'Off. No notification reaches this device.'}
            </p>
          </div>
          <Switch
            checked={state === 'on'}
            onChange={(on) => void handleChange(on)}
            disabled={busy}
            label="Notifications on this device"
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
