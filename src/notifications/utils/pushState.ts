// pushState.ts — "can this device receive push notifications right now?"
//
// Pure logic, no browser APIs: the caller reads the live facts and passes them
// in, which keeps every branch unit-testable. See docs/NOTIFICATIONS_SPEC.md
// §2.2 and §9.2.

/**
 * - `unsupported`        this browser has no web push at all
 * - `ios-needs-install`  iPhone/iPad in a Safari tab: push only exists in the
 *                        app added to the Home Screen
 * - `prompt`             supported, the OS permission was never asked
 * - `on`                 permission granted and this installation is subscribed
 * - `off`                permission granted, but notifications are off here
 *                        (the user opted out, or no subscription exists yet)
 * - `blocked`            the user denied the OS prompt; the browser won't ask again
 */
export type PushState = 'unsupported' | 'ios-needs-install' | 'prompt' | 'on' | 'off' | 'blocked'

export interface PushFacts {
  /** iPhone / iPad / iPod. */
  ios: boolean
  /** Running as an installed app (Home Screen), not in a browser tab. */
  standalone: boolean
  /** Notification + service worker + PushManager all exist. */
  supported: boolean
  /** `Notification.permission`. */
  permission: NotificationPermission
  /** The per-account "I turned it off" flag in localStorage (§2.1). */
  optedOut: boolean
  /** The service worker currently holds a push subscription. */
  hasSubscription: boolean
}

export function derivePushState(f: PushFacts): PushState {
  // Checked before `supported`: in an iOS Safari tab the push APIs are simply
  // absent, and "add to Home Screen" is a more useful answer than "unsupported".
  if (f.ios && !f.standalone) return 'ios-needs-install'
  if (!f.supported) return 'unsupported'
  if (f.permission === 'denied') return 'blocked'
  if (f.permission === 'default') return 'prompt'
  // Permission granted. It belongs to the device and outlives sign-out, so
  // whether notifications are actually ON is a separate question.
  return !f.optedOut && f.hasSubscription ? 'on' : 'off'
}

// ---------------------------------------------------------------------------
// Permission banners — the no-nagging rule (§9.4)
// ---------------------------------------------------------------------------

/**
 * The moments at which a banner may suggest enabling notifications.
 *  a  first invite sent            b  joined a shared space
 *  d  "invite people" at creation  e1 first transaction someone else added for me
 *  e2 first launch of the installed app on iOS
 * (c, the Parameters option, is a direct button and has no banner.)
 */
export type BannerMoment = 'a' | 'b' | 'd' | 'e1' | 'e2'

/** Stored per device in localStorage, like the permission it leads to. */
export interface BannerHistory {
  /** Moments whose banner was already shown: each shows at most once. */
  shown: BannerMoment[]
  /** How many times the user answered "Not now", across all moments. */
  notNow: number
}

export const EMPTY_BANNER_HISTORY: BannerHistory = { shown: [], notNow: 0 }

/** After this many "Not now" answers, banners stop for good on this device. */
export const MAX_NOT_NOW = 2

export function canShowBanner(history: BannerHistory, moment: BannerMoment, state: PushState): boolean {
  // Only when there is something to offer: an Enable button, or the iOS
  // "add to Home Screen first" hint. Not when on, off (a deliberate choice),
  // blocked or unsupported.
  if (state !== 'prompt' && state !== 'ios-needs-install') return false
  if (history.notNow >= MAX_NOT_NOW) return false
  return !history.shown.includes(moment)
}
