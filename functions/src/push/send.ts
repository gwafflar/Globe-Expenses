/**
 * Push delivery: device tokens → mute check → limiter → FCM → token cleanup
 * (docs/NOTIFICATIONS_SPEC.md §2.1, §6, §9.1).
 *
 * This is the impure half of the push path. The decisions it relies on
 * (limiter.ts, text.ts) are pure and unit-tested.
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Messaging } from 'firebase-admin/messaging'
import { logger } from 'firebase-functions'
import type { ActivityBody, PushPlan } from '../model'
import { decidePush, type PushDecision } from './limiter'
import { buildFinalPushMessage, buildPushMessage } from './text'

/** FCM error codes that mean "this token will never work again". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/**
 * Reads, decides and updates the limiter counter atomically (§6.2).
 *
 * A burst fires several function instances at once against the same counter.
 * Without a transaction they would all read the same count and all push. A
 * Firestore transaction re-runs its callback when the document it read was
 * changed by someone else in the meantime, so each event sees a fresh count.
 * That retry is also why NOTHING with a side effect (the FCM send) may happen
 * inside the callback.
 */
async function takePushSlot(db: Firestore, uid: string, throttleKey: string): Promise<PushDecision> {
  const ref = db.doc(`users/${uid}/pushThrottle/${throttleKey}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data()
    const last = data?.lastEventAt as Timestamp | undefined
    const { decision, next } = decidePush(
      snap.exists ? { count: (data?.count as number | undefined) ?? 0, lastEventAtMs: last?.toMillis() ?? null } : null,
      Date.now(),
    )
    tx.set(ref, { count: next.count, lastEventAt: Timestamp.fromMillis(next.lastEventAtMs ?? Date.now()) })
    return decision
  })
}

/**
 * Sends the push for one activity entry to every device of one recipient.
 * Never throws: a failed push must not fail the trigger — the feed entry is
 * already written and is the source of truth (§6.2).
 */
export async function deliverPush(
  db: Firestore,
  messaging: Messaging,
  recipientUid: string,
  body: ActivityBody,
  plan: PushPlan,
): Promise<void> {
  try {
    // 1. Devices. No token = notifications are off everywhere for this user;
    //    stop before touching the limiter.
    const tokenSnap = await db.collection(`users/${recipientUid}/fcmTokens`).get()
    if (tokenSnap.empty) return
    const tokens = tokenSnap.docs.map((d) => d.id) // the token IS the document id

    // 2. Per-space mute, stored in the recipient's private document (§3.5).
    if (plan.muteSpaceId) {
      const prefs = await db.doc(`users/${recipientUid}/private/notifications`).get()
      const muted = (prefs.data()?.mutedSpaceIds as string[] | undefined) ?? []
      if (muted.includes(plan.muteSpaceId)) return
    }

    // 3. Limiter.
    const decision = await takePushSlot(db, recipientUid, plan.throttleKey)
    if (decision === 'none') return
    const message = decision === 'final' ? buildFinalPushMessage(body, plan.throttleKey) : buildPushMessage(body)

    // 4. Send. DATA-only message: FCM shows nothing by itself; our service
    //    worker (public/push-sw.js) receives it and calls showNotification().
    //    FCM data values must all be strings.
    const result = await messaging.sendEachForMulticast({
      tokens,
      data: { title: message.title, body: message.body, url: message.url, kind: body.kind },
      webpush: {
        // Urgency high: deliver now even if the phone is dozing.
        // TTL: if the device is offline, keep trying for a day, then give up.
        headers: { Urgency: 'high', TTL: '86400' },
      },
    })

    // 5. Drop tokens FCM says are dead (app uninstalled, permission revoked,
    //    signed out while offline…), so they are not retried forever (§2.1).
    const dead: string[] = []
    result.responses.forEach((r, i) => {
      if (r.success) return
      const code = r.error?.code ?? ''
      if (DEAD_TOKEN_CODES.has(code)) dead.push(tokens[i])
      else logger.warn('push: send failed', { recipientUid, code, message: r.error?.message })
    })
    await Promise.all(dead.map((t) => db.doc(`users/${recipientUid}/fcmTokens/${t}`).delete()))

    logger.info('push: sent', {
      recipientUid,
      kind: body.kind,
      decision,
      devices: tokens.length,
      delivered: result.successCount,
      removedTokens: dead.length,
    })
  } catch (err) {
    logger.error('push: delivery failed', { recipientUid, kind: body.kind, err })
  }
}
