// pushService.ts — registers / unregisters THIS device for push notifications.
//
// Vocabulary (docs/NOTIFICATIONS_SPEC.md §2.1):
//   permission    the OS-level "may this site notify me". Belongs to the device,
//                 survives sign-out, and only the user can revoke it.
//   subscription  the browser's push channel for this installation, held by the
//                 service worker. Created when a token is obtained.
//   FCM token     Firebase Cloud Messaging's address for that subscription. The
//                 Cloud Function sends to it. Stored at
//                 users/{uid}/fcmTokens/{token} — one document per device.
//   opt-out flag  localStorage `notifOptOut:{uid}`: "I turned notifications off
//                 on this device". Without it, the token refresh on the next
//                 app open would silently turn them back on.
//
// No React in this file: components use the usePushState hook, which calls it.

import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import { app, db } from '@/services/firebase'
import { derivePushState, type PushState } from '@/notifications/utils/pushState'
import { getLanguage } from '@/i18n'

/** Where this installation remembers the token it registered, and for whom. */
const TOKEN_KEY = 'notifToken'
const optOutKey = (uid: string) => `notifOptOut:${uid}`

interface StoredToken {
  uid: string
  token: string
}

/** True once getToken() succeeded since the page loaded (see removeDeviceToken). */
let tokenObtainedThisSession = false

// --- small helpers -----------------------------------------------------------

/** iPhone / iPad / iPod. iPadOS reports itself as a Mac, hence the touch check. */
export function isIos(): boolean {
  const ua = window.navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1)
}

/** True when running as an installed app (Home Screen / standalone window). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // Safari on iOS sets this when launched from the Home Screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function pushApisPresent(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

/** Resolves to `fallback` if the promise takes longer than `ms`. Never rejects. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

/**
 * The app's service worker registration, or null if there is none.
 *
 * `navigator.serviceWorker.ready` never resolves when no worker is registered
 * — which is the case under `pnpm dev` (vite-plugin-pwa only builds one for
 * production). So check for a registration first, then wait with a bound.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  if (!existing) return null
  return withTimeout<ServiceWorkerRegistration | null>(navigator.serviceWorker.ready, 5000, null)
}

function readStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as StoredToken) : null
  } catch {
    return null
  }
}

// --- change notifications ----------------------------------------------------
// The state lives in the browser (permission, subscription, localStorage), not
// in React. Hooks subscribe here to re-read it after this module changed it.

const listeners = new Set<() => void>()

export function onPushStateChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitChange() {
  listeners.forEach((l) => l())
}

// --- reading the state -------------------------------------------------------

export function isOptedOut(uid: string): boolean {
  return localStorage.getItem(optOutKey(uid)) === '1'
}

/**
 * Reads the device's push state LIVE (§2.2): the OS or the browser can change
 * the permission or drop the subscription behind the app's back, so none of it
 * is cached in app state.
 */
export async function readPushState(uid: string): Promise<PushState> {
  const supported = pushApisPresent() && (await isSupported().catch(() => false))
  let hasSubscription = false
  if (supported && Notification.permission === 'granted') {
    const reg = await getSwRegistration()
    hasSubscription = (await reg?.pushManager.getSubscription().catch(() => null)) != null
  }
  return derivePushState({
    ios: isIos(),
    standalone: isStandalone(),
    supported,
    permission: supported ? Notification.permission : 'default',
    optedOut: isOptedOut(uid),
    hasSubscription,
  })
}

// --- token registration ------------------------------------------------------

/** Drops the browser's push subscription. Works offline; FCM then reports the old token as dead. */
async function unsubscribeBrowser(): Promise<void> {
  const reg = await getSwRegistration()
  const sub = await reg?.pushManager.getSubscription().catch(() => null)
  await sub?.unsubscribe().catch(() => false)
}

/**
 * Obtains this device's FCM token and stores it under the user.
 * Assumes permission is already granted. Throws if no service worker is active.
 */
async function registerToken(uid: string): Promise<void> {
  const reg = await getSwRegistration()
  if (!reg) throw new Error('no-service-worker')

  // A token left behind by ANOTHER account on this device (its sign-out
  // cleanup could not reach the server): drop the subscription so FCM issues a
  // fresh token. Otherwise both accounts would share one address, and the
  // previous user's notifications would arrive here (§2.1).
  const stored = readStoredToken()
  if (stored && stored.uid !== uid) await unsubscribeBrowser()

  // We pass our own service worker registration. By default FCM would register
  // a second worker (firebase-messaging-sw.js); the app keeps a single one,
  // with the push handlers in public/push-sw.js (§2.3).
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: reg,
  })
  tokenObtainedThisSession = true

  // FCM rotated the token: remove the document of the old one.
  if (stored && stored.uid === uid && stored.token !== token) {
    deleteDoc(doc(db, 'users', uid, 'fcmTokens', stored.token)).catch(() => {})
  }

  // Fire-and-forget, like every other write in the app. merge: true because
  // this runs on every app open and usually rewrites an existing document.
  setDoc(
    doc(db, 'users', uid, 'fcmTokens', token),
    {
      token,
      lastSeenAt: serverTimestamp(),
      userAgent: navigator.userAgent,
      standalone: isStandalone(),
      // UI language of this device: the Cloud Function writes each device's
      // push text in it. Stored per device rather than read from the profile
      // because 'auto' resolves differently on each browser. ProfilePage calls
      // refreshPushToken() after a language change to rewrite it.
      language: getLanguage(),
    },
    { merge: true },
  ).catch((err: unknown) => console.error('[pushService] saving the token failed:', err))

  localStorage.setItem(TOKEN_KEY, JSON.stringify({ uid, token } satisfies StoredToken))
}

/**
 * Turns notifications ON for this device (Profile toggle, banners, Parameters).
 *
 * ⚠️ Must be called directly from a tap handler, and requestPermission() must
 * be the FIRST thing it does: iOS only shows the permission prompt while a user
 * gesture is "active", and an `await` before it ends that.
 */
export async function enablePush(uid: string): Promise<PushState> {
  if (!pushApisPresent()) return readPushState(uid)
  const permission = await Notification.requestPermission() // no prompt if already granted
  if (permission === 'granted') {
    localStorage.removeItem(optOutKey(uid)) // turning it on clears the opt-out
    // Announce the granted permission right away: creating the token below can
    // take a few seconds, and anything still offering "Enable" (the banner)
    // should disappear now, not then.
    emitChange()
    try {
      await registerToken(uid)
    } finally {
      emitChange()
    }
  } else {
    emitChange()
  }
  return readPushState(uid)
}

/**
 * Called on every app open / sign-in. If the permission is already granted and
 * the user has not opted out, (re)registers the token silently — no prompt.
 * This is also what re-enables notifications after a sign-out + sign-in (§2.1).
 */
export async function refreshPushToken(uid: string): Promise<void> {
  try {
    if (!pushApisPresent() || Notification.permission !== 'granted') return
    if (isOptedOut(uid)) return
    if (!(await isSupported())) return
    await registerToken(uid)
    emitChange()
  } catch (err) {
    // Expected under `pnpm dev` (no service worker) and when offline.
    console.debug('[pushService] token refresh skipped:', err)
  }
}

/**
 * Removes this device's token: the Firestore document, the FCM registration and
 * the browser subscription. Every step is bounded, so this never hangs offline.
 */
async function removeDeviceToken(uid: string): Promise<void> {
  const stored = readStoredToken()
  if (stored && stored.uid === uid) {
    // Awaited (with a bound): on sign-out the delete must reach the server
    // while the user is still authenticated.
    await withTimeout(deleteDoc(doc(db, 'users', uid, 'fcmTokens', stored.token)), 4000, undefined)
  }
  localStorage.removeItem(TOKEN_KEY)

  // Tell FCM the token is gone. Needs the network; if it fails, dropping the
  // browser subscription below still kills the token (FCM reports it dead on
  // the next send and the Cloud Function deletes the document).
  //
  // Only when getToken() ran in this session: the SDK's deleteToken() needs to
  // know which service worker to use, and learns it from getToken(). Without
  // that it would try to register its own default worker
  // (/firebase-messaging-sw.js), which this app deliberately does not have.
  if (tokenObtainedThisSession) {
    await withTimeout(deleteToken(getMessaging(app)), 4000, false)
    tokenObtainedThisSession = false
  }
  await withTimeout(unsubscribeBrowser(), 2000, undefined)
}

/**
 * Profile toggle → Off. Deletes the token AND remembers the choice, so the next
 * app open does not turn notifications back on. The OS permission stays granted.
 */
export async function disablePush(uid: string): Promise<PushState> {
  localStorage.setItem(optOutKey(uid), '1')
  await removeDeviceToken(uid)
  emitChange()
  return readPushState(uid)
}

/**
 * Sign-out: delete the token BEFORE signing out, or the next account on this
 * device would keep receiving this account's notifications. Does NOT set the
 * opt-out flag — signing back in re-enables silently (§2.1).
 */
export async function removePushTokenOnSignOut(uid: string): Promise<void> {
  try {
    await removeDeviceToken(uid)
  } catch (err) {
    console.warn('[pushService] sign-out cleanup failed:', err)
  }
}
