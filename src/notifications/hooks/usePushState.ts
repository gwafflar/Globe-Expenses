// usePushState.ts — React hook exposing this device's live push state.
//
// The state is NOT kept in a store: it lives in the browser (OS permission,
// service worker subscription, localStorage) and can change behind the app's
// back — e.g. Chrome revokes permission for rarely visited sites. So the hook
// re-reads it whenever something may have changed (spec §2.2).

import { useCallback, useEffect, useState } from 'react'
import { onPushStateChange, readPushState } from '@/notifications/services/pushService'
import type { PushState } from '@/notifications/utils/pushState'

/**
 * @returns `state` — null while the first read is in flight;
 *          `refresh` — re-read now (e.g. after an action).
 */
export function usePushState(uid: string | undefined): { state: PushState | null; refresh: () => void } {
  // useState: the last value we read. Changing it re-renders the component.
  const [state, setState] = useState<PushState | null>(null)

  // useCallback keeps the same function identity between renders, so the
  // effect below does not re-run (and re-subscribe) on every render.
  const refresh = useCallback(() => {
    if (!uid) return
    readPushState(uid)
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [uid])

  // useEffect: runs after render. Reads once, then re-reads when
  //  - pushService changed something (enable / disable / token refresh),
  //  - the user comes back to the app (they may have changed OS settings).
  // The returned function is the cleanup, run when the component unmounts.
  useEffect(() => {
    refresh()
    const unsubscribe = onPushStateChange(refresh)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { state, refresh }
}
