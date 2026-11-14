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
import { useT } from '@/i18n'

export function DeviceNotificationToggle({ uid }: { uid: string }) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const d = t.social.push.device // shorthand
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
      setError(d.updateFailed)
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
          <p className="text-sm font-medium">{d.title}</p>
          <p className="text-xs text-muted-foreground">
            {d.iosInstall({ icon: <span aria-hidden>&#11023;</span> })}
          </p>
        </div>
      )}

      {state === 'unsupported' && (
        <div>
          <p className="text-sm font-medium">{d.title}</p>
          <p className="text-xs text-muted-foreground">{d.unsupported}</p>
        </div>
      )}

      {state === 'blocked' && (
        <div>
          <p className="text-sm font-medium">{d.blockedTitle}</p>
          <p className="text-xs text-muted-foreground">
            {d.blockedHint}
          </p>
        </div>
      )}

      {state === 'prompt' && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{d.onThisDevice}</p>
            <p className="text-xs text-muted-foreground">
              {d.promptHint}
            </p>
          </div>
          <Button type="button" onClick={() => void handleChange(true)} disabled={busy}>
            {busy ? t.social.push.enabling : t.social.push.enable}
          </Button>
        </div>
      )}

      {(state === 'on' || state === 'off') && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{d.onThisDevice}</p>
            <p className="text-xs text-muted-foreground">
              {state === 'on' ? d.onHint : d.offHint}
            </p>
          </div>
          <Switch
            checked={state === 'on'}
            onChange={(on) => void handleChange(on)}
            disabled={busy}
            label={d.switchLabel}
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
