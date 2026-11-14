// SpaceNotificationToggle.tsx — Space → Parameters → Manage space: mute or
// unmute pushes from this one space (docs/NOTIFICATIONS_SPEC.md §9.1, §9.3).
//
// Two levels are involved:
//   device  can this device receive pushes at all? (permission + token)
//   space   do I want pushes from THIS space? (mutedSpaceIds, stored on my
//           private user document — other members never see it)
// If the device level is off, the space switch would do nothing, so this
// component offers to enable the device instead.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Switch } from '@/shared/components/Switch'
import { Button } from '@/components/ui/button'
import { usePushState } from '@/notifications/hooks/usePushState'
import { enablePush } from '@/notifications/services/pushService'
import { setSpaceMuted, subscribeToMutedSpaces } from '@/notifications/services/notificationPrefs'

export function SpaceNotificationToggle({ uid, spaceId }: { uid: string; spaceId: string }) {
  const { state } = usePushState(uid)
  // null until the first snapshot arrives, so the switch never flashes "On"
  // for a space that is actually muted.
  const [mutedSpaceIds, setMutedSpaceIds] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  // Real-time listener on my private notification settings. The function
  // returned by subscribeToMutedSpaces stops the listener; returning it from
  // useEffect makes React call it when this component unmounts.
  useEffect(() => subscribeToMutedSpaces(uid, setMutedSpaceIds), [uid])

  const muted = mutedSpaceIds?.includes(spaceId) ?? false

  function handleMuteChange(on: boolean) {
    // Optimistic update: flip the switch now, the listener confirms shortly.
    setMutedSpaceIds((prev) => {
      const others = (prev ?? []).filter((id) => id !== spaceId)
      return on ? others : [...others, spaceId]
    })
    setSpaceMuted(uid, spaceId, !on)
  }

  // ⚠️ enablePush() must be the first call in the tap handler (iOS, see pushService).
  async function handleEnableDevice() {
    setBusy(true)
    try {
      await enablePush(uid)
    } catch (err) {
      console.error('[SpaceNotificationToggle] enabling failed:', err)
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return null

  const profileLink = (
    <p className="text-xs text-muted-foreground">
      Want to turn off all notifications?{' '}
      <Link to="/profile" className="underline underline-offset-2 hover:text-foreground">
        Profile settings →
      </Link>
    </p>
  )

  if (state === 'on') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">🔔 Notifications for this space</p>
          <Switch
            checked={!muted}
            onChange={handleMuteChange}
            disabled={mutedSpaceIds === null}
            label="Notifications for this space"
          />
        </div>
        {profileLink}
      </div>
    )
  }

  if (state === 'prompt' || state === 'off') {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => void handleEnableDevice()}
          disabled={busy}
        >
          {busy ? 'Enabling…' : '🔔 Enable notifications on this device'}
        </Button>
        {profileLink}
      </div>
    )
  }

  return (
    <p className="text-xs text-muted-foreground">
      {state === 'ios-needs-install' &&
        '🔔 To get notifications on iPhone, add GlobeExpenses to your Home Screen first (Share → "Add to Home Screen").'}
      {state === 'blocked' &&
        "🔔 Notifications are blocked on this device. Re-enable them in your phone's settings → GlobeExpenses."}
      {state === 'unsupported' && "🔔 This browser doesn't support push notifications."}
    </p>
  )
}
