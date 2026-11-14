// usePushPromptStore.ts — the "Get notified?" banner (docs/NOTIFICATIONS_SPEC.md §9.4).
//
// WHY A STORE: the banner is requested from many places (after sending an
// invite, after joining a space, when a transaction from someone else shows
// up…) but rendered in ONE place (PushPromptBanner, mounted in ProtectedRoute).
// A Zustand store is the simplest bridge: any code calls
// `requestPushPrompt('a')`, and the banner component re-renders because it
// reads `active` from the same store. It also survives page navigation, e.g.
// accepting an invite and landing on the space.
//
// The OS permission prompt NEVER opens by itself: the banner only offers a
// button, and the prompt follows the user's tap.

import { create } from 'zustand'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { enablePush, onPushStateChange, readPushState } from '@/notifications/services/pushService'
import {
  EMPTY_BANNER_HISTORY,
  canShowBanner,
  type BannerHistory,
  type BannerMoment,
} from '@/notifications/utils/pushState'

/** Per device, like the permission the banner leads to. A new device starts fresh. */
const HISTORY_KEY = 'notifBanners'

const DEFAULT_MESSAGES: Record<BannerMoment, string> = {
  a: 'Get notified when members join your space and add or edit transactions.',
  d: 'Get notified when members join your space and add or edit transactions.',
  b: 'Get notified when members add or edit transactions involving you.',
  e2: 'Get notified when members add or edit transactions involving you.',
  e1: 'Someone added a transaction involving you. Get notified next time?',
}

function loadHistory(): BannerHistory {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return EMPTY_BANNER_HISTORY
    const parsed = JSON.parse(raw) as Partial<BannerHistory>
    return { shown: parsed.shown ?? [], notNow: parsed.notNow ?? 0 }
  } catch {
    return EMPTY_BANNER_HISTORY
  }
}

function saveHistory(history: BannerHistory) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    // storage full / disabled: the banner may simply show again later
  }
}

interface ActiveBanner {
  moment: BannerMoment
  message: string
  /** 'enable': offers the Enable button. 'ios-install': Safari tab on iOS,
   *  where push is impossible until the app is added to the Home Screen. */
  variant: 'enable' | 'ios-install'
}

interface PushPromptState {
  /** The banner currently on screen, or null. */
  active: ActiveBanner | null
  /** True while the Enable tap is being processed. */
  busy: boolean
  /** Asks for the banner of a given moment. Does nothing if it is not due. */
  request: (moment: BannerMoment, message?: string) => Promise<void>
  /** "Enable" tapped: opens the OS prompt and registers the device. */
  enable: () => Promise<void>
  /** "Not now" tapped: counts towards the no-nagging limit. */
  notNow: () => void
  /** Closes the iOS hint. Not a refusal, so it is not counted. */
  close: () => void
  /** Hides the banner if it no longer has anything to offer — e.g. the user
   *  just enabled notifications from the Profile page instead. */
  revalidate: () => Promise<void>
}

export const usePushPromptStore = create<PushPromptState>((set, get) => ({
  active: null,
  busy: false,

  request: async (moment, message) => {
    const uid = useAuthStore.getState().currentUser?.uid
    if (!uid || get().active) return // signed out, or a banner is already showing

    const history = loadHistory()
    // Cheap check first; reading the push state touches the service worker.
    if (history.shown.includes(moment)) return
    const state = await readPushState(uid)
    if (!canShowBanner(history, moment, state)) return
    if (get().active) return // another request won the race while we awaited

    // No-nagging rule: each moment shows its banner at most once, so it is
    // recorded as shown the instant it appears, whatever the user does next.
    saveHistory({ ...history, shown: [...history.shown, moment] })
    set({
      active: {
        moment,
        message: message ?? DEFAULT_MESSAGES[moment],
        variant: state === 'ios-needs-install' ? 'ios-install' : 'enable',
      },
    })
  },

  enable: async () => {
    const uid = useAuthStore.getState().currentUser?.uid
    if (!uid) return
    set({ busy: true })
    try {
      // ⚠️ Nothing may be awaited before this call: the OS prompt only opens
      // while the tap is still "active" (see enablePush).
      await enablePush(uid)
    } catch (err) {
      console.error('[pushPrompt] enabling notifications failed:', err)
    } finally {
      set({ active: null, busy: false })
    }
  },

  notNow: () => {
    const history = loadHistory()
    saveHistory({ ...history, notNow: history.notNow + 1 })
    set({ active: null })
  },

  close: () => set({ active: null }),

  revalidate: async () => {
    const uid = useAuthStore.getState().currentUser?.uid
    // `busy` = the banner's own Enable is running; it closes itself when done.
    if (!get().active || get().busy) return
    if (!uid) {
      set({ active: null }) // signed out
      return
    }
    const state = await readPushState(uid)
    // The banner only makes sense while there is still something to enable.
    if (state !== 'prompt' && state !== 'ios-needs-install') set({ active: null })
  },
}))

// The banner is not the only way to enable notifications (Profile toggle,
// Parameters button). pushService announces every change it makes; listening
// here closes a banner that has just become pointless. Registered once, when
// this module is first imported — a store is a singleton, so no cleanup needed.
onPushStateChange(() => void usePushPromptStore.getState().revalidate())

/** Shorthand for non-React code and event handlers. Fire-and-forget. */
export function requestPushPrompt(moment: BannerMoment, message?: string): void {
  void usePushPromptStore.getState().request(moment, message)
}
