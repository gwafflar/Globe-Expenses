# Notifications & Activity Feed — Specification

> Status: **push notifications live in production** (14 November 2026). All device tests
> passed on Android and iPhone. Progress and decisions taken while
> building: `docs/notification-implementation-journal.md`. Manual device tests:
> `docs/NOTIFICATIONS_TEST_PLAN.md`. The Activity Feed UI (§10) is not built.
> Supersedes the short notes in `GlobeExpenses_Specification.md` §3.7 / §3.11 and
> `GlobeExpenses_Architecture.md` §5.6 where they differ.

---

## 1. Scope and ordering

Two features share one event model:

- **Activity Feed**: an in-app, chronological list of events affecting the user (pull).
- **Push notifications**: a subset of those events delivered to the device via
  Firebase Cloud Messaging (FCM), even with the app closed.

The roadmap originally shipped the feed first (v2) and push later (v3). **Push may now
ship first**, but it must be built on the feed's event model so the feed can be added
later without rework:

- From day one, the Cloud Function writes **one activity document per event per
  recipient**, even before any feed UI exists. When the feed UI ships, it reads history
  that already exists.
- The "who is affected by this write" logic exists **once**, in that function.

---

## 2. Platform constraints

Push works on Android and iOS from the same codebase, with these iOS restrictions:

| | Android (Chrome) | iOS (Safari) |
|---|---|---|
| Minimum version | any recent | **iOS 16.4+** |
| Requires Home Screen install | no | **yes**: no push in a Safari tab |
| Permission prompt | any time | **only from a user gesture** (tap) |
| Push without visible notification | tolerated | **forbidden**: may revoke the subscription |
| `tag` (same tag replaces previous notification) | works | **no effect** ([WebKit #258922](https://bugs.webkit.org/show_bug.cgi?id=258922), open as of Jul 2026) |
| `silent`, `renotify`, `vibrate` | supported | **not supported**: every push alerts |
| Notification action buttons | supported | not supported |
| `getNotifications()` + `close()` in service worker | supported | supported (16.4+), **untested on device** |

Consequences:

- **Burst control must happen server-side** (§6). It can't be left to the device,
  because on iOS each push alerts and nothing can update an existing notification in place.
- The "Enable notifications" control must be a button inside the installed app.
  Safari-tab users get an "Add to Home Screen first" hint.

### 2.1 Tokens

- Permission and FCM tokens are **per device** (strictly: per browser storage context,
  §2.2). Stored at `users/{uid}/fcmTokens/{token}`.
- Clients refresh their token on each app open. The Cloud Function deletes tokens that
  FCM reports as invalid.
- **On sign-out, the client deletes this device's token** before signing out.
  Otherwise the next account signed in on that device keeps receiving the previous
  account's notifications, which leaks another user's expenses.
- **OS permission outlives sign-out.** It belongs to the origin on that device, not to
  the account, and a web app cannot revoke it (only the user can, in OS/browser
  settings). On sign-in, if `Notification.permission === 'granted'` and the user has
  not opted out (below), the client silently obtains a new token. No prompt is shown.
- **Explicit opt-out is remembered locally.** Turning the Profile toggle off deletes the
  token **and** sets an opt-out flag in `localStorage`, keyed per account
  (`notifOptOut:{uid}`). Without the flag, the token refresh on the next app open would
  silently re-enable notifications. Turning the toggle on clears it. Sign-out does
  **not** set it.

| Action | Token | Opt-out flag | Next sign-in / app open |
|---|---|---|---|
| Sign out | deleted | unchanged | re-enabled silently if permission still granted |
| Profile toggle → Off | deleted | set | stays off |
| Profile toggle → On | created | cleared | no prompt if already granted |

**Accepted for shared devices:** a second account signing in on a device where the
permission was granted earlier gets notifications without being prompted on that
device. Fine for personal phones, which is the normal case. A stricter variant
(silent re-enable only for the last account that held a token there) was considered
and rejected as unnecessary in v1.

### 2.2 Browser vs installed app

| Platform | Browser and installed app share… | Consequence |
|---|---|---|
| Android (Chrome) | origin, service worker, permission, push subscription | One installation: enabling in either enables both, one token, no duplicates |
| iOS | **nothing**: installed web app has storage separate from Safari | Safari tab can't have push. In the installed app the user signs in again and enables there |
| Desktop Chrome / Edge | same as Android | Nothing to do |
| macOS Safari "Add to Dock" | nothing, but Safari tabs on macOS *can* have push | Enabled in both means two tokens and duplicate notifications. Rare; accepted in v1 |

**Rule:** the device toggle (§9.2) is derived from `Notification.permission` +
"does this installation hold a token" + the local opt-out flag (§2.1). The first two
are always read **live**, never cached in app state: the OS or browser can change them
behind the app's back (e.g. Chrome auto-revokes permission for rarely visited sites).
Since all three live in the storage context, each context shows its own correct state.

### 2.3 Service worker (decided)

Keep vite-plugin-pwa's generated Workbox service worker (`generateSW`) and add a
hand-written `public/push-sw.js` through Workbox `importScripts`. It handles only
`push` (always calls `showNotification()`) and `notificationclick` (opens the
target page). The client passes the existing registration to FCM:
`getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.ready })`.

- One service worker; the existing offline caching is untouched.
- The app controls how every notification is displayed (needed for §6 text, §9.5
  deep links and the §10 lock-screen cleanup).
- Rejected: a separate `firebase-messaging-sw.js` (two service workers, uncertain on
  iOS, Firebase-controlled display) and `injectManifest` (rewriting working caching code).
- The service worker is inactive under `pnpm dev`, and push needs HTTPS. Device
  testing uses a Firebase Hosting preview channel.
- FCM's push payload format is parsed by hand. Confirm it with the first test push.

---

## 3. Architecture

```
Firestore write (tx created/edited/deleted, invite, friend request, ...)
        │
        ▼
Cloud Function: resolve event type + recipients
        │
        ├──► users/{uid}/activity/{eventId}      ← always, every event, every recipient
        └──► push limiter (§6) ──► FCM push      ← only push-worthy events, not muted
```

The per-user activity subcollection is a deliberate **fan-out on write** (one copy per
recipient). It keeps "my unread events" a single-collection query and the security
rule trivial (`uid == request.auth.uid`). Firestore has no joins, so a shared events
table filtered per user would be the wrong fit.

**Prerequisite**: Cloud Functions require the Blaze (pay-as-you-go) plan. Expected usage
is within the free quota.

### 3.1 Activity event document

Path: `users/{uid}/activity/{eventId}`, one document per event per recipient.

```ts
type ActivityKind =
  | 'tx_created' | 'tx_edited' | 'tx_deleted'
  | 'tx_removed_from_split'          // T5
  | 'transfer_received'              // T6
  | 'member_joined' | 'member_left'  // S1, S2; member_joined also covers F3a for the inviter
  | 'space_deleted'                  // S3
  | 'space_invite'                   // F1
  | 'friend_request'                 // F2
  | 'friend_request_accepted'        // F3b
  | 'import_completed'               // §7 summary

interface ActivityEvent {
  eventId: string             // = Cloud Functions event id (idempotency, §3.2)
  kind: ActivityKind
  createdAt: Timestamp        // server time
  actor: { uid: string; name: string }                   // snapshot (§3.2)
  space?: { id: string; name: string; emoji?: string }   // snapshot
  importBatchId?: string      // imported rows + the import_completed summary
  inviteId?: string           // space_invite, friend_request(_accepted): link to /invite/:id
  import?: { rowCount: number; involvingMe: number }   // import_completed only (§7)
  openedAt?: Timestamp        // set by the client when the entry is tapped (§3.3)

  // Transaction kinds only
  tx?: {
    id: string; name: string; type: TransactionType
    totalAmount: number; currency: string; date: string
  }
  myShare?: { paid: number; owed: number }          // recipient's share after the change
  myShareBefore?: { paid: number; owed: number }    // edits only
  changedFields?: string[]                          // edits only
  before?: {                                        // edits only, material scalar fields
    totalAmount?: number; currency?: string; exchangeRate?: number; type?: TransactionType
  }
  material?: boolean                                // edits only (§5.3)
  transferFrom?: string                             // transfer_received only: sender's member name
}
```

`createdAt` is the triggering write's time (the trigger's event time), so it is the
same on a retried trigger and orders the feed by when things happened.

`kind` is a discriminated union: one document shape, optional fields filled by kind,
one renderer per kind in the UI. T5 and T6 are separate kinds (not flags) because the
catalogue, the push text and the feed rendering all treat them as distinct events.

### 3.2 Design rules

- **Snapshot, not reference.** Events copy what they need to render (names, amounts)
  **as they were at that moment**. Firestore has no joins: references would cost one
  extra read per feed entry and break on deleted items. Renaming a person, space or
  transaction later does **not** change old entries (decided).
- **Per-recipient content.** Because each recipient gets their own copy, it carries
  **their** share: "Alice added Dinner €84 · your share €42", and for edits
  "your share €100 → €150" (decided). The share before/after also covers split changes,
  which a field-level diff describes poorly.
- **Actor name** = the actor's **member name in that space** for transaction and
  space events (T*, S*, F3a), and their **profile display name** for invitations and
  friend events (F1, F2, F3b), where the recipient isn't in the space yet and wouldn't
  recognise a space nickname (decided).
- **Actor identity** comes from the trigger's authenticated writer, using the
  `...WithAuthContext` Firestore trigger variants, not from the client-written
  `lastModifiedBy`. It can't be spoofed, and it works for deletes, where the deleted
  document carries no "who deleted me". **Confirmed on a deployed function
  (6 Oct 2026):** writes from the app arrive with `authType: 'api_key'` (the client
  SDK uses the web API key) and `authId` = the writer's Firebase Auth uid, for
  create, update and delete. `api_key` is the expected value for app users; any
  other `authType` (e.g. `service_account` for Admin SDK writes, `system` for
  TTL deletes) has no end-user actor.
  **Emulator finding (step 1):** the Functions emulator fires these triggers for
  create, update and delete, but does **not** supply a real actor: it reports
  `authType: 'unknown'` and a placeholder `authId` even for an authenticated write.
  Real values can only be confirmed on a deployed function. Consequence: the event
  logic takes the actor as an input (unit-testable), and the trigger wrapper is the
  only place that reads `event.authId`.
- **Idempotency.** Firestore triggers are at-least-once. The document ID is the
  trigger's event ID, so a retried trigger overwrites the same document instead of
  duplicating it. A duplicate push on retry is rare and accepted.
- **Dangling links.** Entries outlive what they point to (deleted space or transaction,
  or a space the user left). They still render from the snapshot. Tapping one shows
  "This no longer exists" / "You no longer have access" instead of a broken page.

### 3.3 Seen and read state

Two separate concepts (decided):

| | Meaning | Stored as | Cleared by |
|---|---|---|---|
| **Seen** | Drives the 🔔 badge | `activityLastSeenAt` (watermark, in the private doc §3.5) | Opening the feed |
| **Read** | Entry shown bold until read | `openedAt` on the entry, **or** `createdAt <= activityReadAllAt` (private doc §3.5) | Tapping the entry, or **"Mark all as read"** |

- Badge count = entries with `createdAt > activityLastSeenAt`.
- An entry is read if `openedAt` is set **or** it is older than `activityReadAllAt`.
  The watermark makes "Mark all as read" **one write** instead of one per entry.
- Both watermarks are written with `serverTimestamp()`, so they compare correctly
  with server-set `createdAt` regardless of the device clock.

### 3.4 Security rules

Only the Cloud Function writes events (the Admin SDK bypasses rules). The client reads
its own feed and may only set `openedAt`:

```
match /users/{uid}/activity/{eventId} {
  allow read: if request.auth.uid == uid;
  allow update: if request.auth.uid == uid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['openedAt']);
}
```

Other client-written notification data, all owner-only:

| Path | Client writes | Why |
|---|---|---|
| `users/{uid}/fcmTokens/{token}` | read, create, **update**, delete | register / unregister this device (§2.1). `update` because the refresh on each app open rewrites an existing document |
| `users/{uid}/pushThrottle/{key}` | `count: 0` only, via `setDoc(ref, { count: 0 }, { merge: true })`; no read | reset on open (§6.1). A non-merge set is refused: it would erase `lastEventAt` |
| `users/{uid}/private/notifications` | read, create, update; only the three §3.5 fields | §3.5 |

Implemented in `firestore.rules` and covered by `rules-tests/notifications.rules.test.ts`
(`pnpm test:rules`, Firestore emulator).

### 3.5 Private notification document

`users/{uid}` is **readable by every signed-in user** (`firestore.rules`: needed for
nametag search and friends), so notification state must not live on it. It lives in
`users/{uid}/private/notifications`, readable and writable by the owner only:

```ts
interface NotificationPrefs {
  mutedSpaceIds?: string[]       // §9.1
  activityLastSeenAt?: Timestamp // §3.3, badge watermark
  activityReadAllAt?: Timestamp  // §3.3, "Mark all as read" watermark
}
```

The Cloud Function (Admin SDK) reads it before sending a push.

---

## 4. Event catalogue

| # | Event | Recipients | Feed | Push |
|---|---|---|---|---|
| **Transactions** |||||
| T1 | Transaction created, I am payer or beneficiary | involved members | ✅ | ✅ |
| T2 | Transaction edited, **material** change (§5.3) | involved before ∪ after | ✅ | ✅ |
| T3 | Transaction edited, cosmetic change only | involved members | ✅ | ❌ |
| T4 | Transaction deleted that involved me | involved members | ✅ | ✅ |
| T5 | I was removed from a split (special case of T2) | removed member | ✅ | ✅ |
| T6 | Transfer received (someone recorded paying me back) | receiver | ✅ | ✅ |
| T7 | Transaction not involving me | none | ❌ | ❌ |
| **Space & members** |||||
| S1 | Someone joined / claimed a slot in my space | other members | ✅ | ❌ *(may revisit)* |
| S2 | Someone left my space | other members | ✅ | ❌ *(may revisit)* |
| S3 | Space deleted by someone else | former members | ✅ | ✅ |
| S4 | Settings changed (rates, currency, lists, renames) | none | ❌ | ❌ |
| **Social** |||||
| F1 | Invited to a space | invitee | ✅ | ✅ |
| F2 | Friend request received | target | ✅ | ✅ |
| F3a | My **space invite** accepted ("Bob joined 🇯🇵 Japan") | inviter | ✅ | ✅ |
| F3b | My **friend request** accepted | sender | ✅ | ❌ |
| **Later stages (reserved, not in v1)** |||||
| L1 | New bank-import draft pending (v2) | owner | ✅ | ✅ |
| L2 | Periodic "you owe X" reminder (time-based, scheduled function) | debtor | ❌ | optional |

Guiding rule: **push only what changes my money or needs my action**. The feed records
every event.

---

## 5. Recipient rules

1. **Never notify the actor.** The user who made the write gets no feed entry and no push for it.
2. **Member → user mapping.** Splits reference `travelMemberId`. Recipients are resolved
   through `members[].userId`. Unclaimed slots (`userId == null`) receive nothing.
3. **Material vs cosmetic edits** (diff of before/after from `onDocumentUpdated`):
   - Material: `totalAmount`, `currency`, `exchangeRate`, payer, beneficiaries / split
     amounts, `type`. `exchangeRate` is material because it shifts converted balances.
   - Cosmetic: name, category, payment method, country, city, notes, custom fields.
   - v1 uses this fixed split for everyone. Per-user field choice is a v2 item (§10).
4. **Edit recipients are `involved(before) ∪ involved(after)`**, so a member removed
   from a split is told (T5).
5. **Space deletion produces one event, not one per transaction** (decided).
   - The client deletes **only the space document**. A Cloud Function `onTravelDeleted`
     then deletes the `transactions` subcollection server-side (Admin SDK
     `recursiveDelete()`). This replaces the client-side cascade in `deleteSpace()`
     (`spaceService.ts`) and is the cascade function already planned for v2.
   - **T4 trigger rule:** if the parent space document no longer exists, do nothing.
     The trigger must read the space anyway to map `travelMemberId` → `uid`, so this
     check costs nothing. Since the space is deleted first, every cascaded delete is
     skipped deterministically, with no race.
   - `onTravelDeleted` receives the deleted space's data (members, name, emoji) and
     writes the single S3 `space_deleted` event to every former member except the
     actor (from the auth context).
   - Side benefits: removes the current 500-write `writeBatch` cap (spaces with more
     than 500 transactions can't be deleted today), and deletion works offline (one
     queued write instead of a fetch of every transaction). Orphaned transactions exist
     for a few seconds but are unreadable: rules check the parent space's `memberUids`.

---

## 6. Push limiter (v1)

### 6.1 Rule

One counter per **(recipient, space)**: `users/{uid}/pushThrottle/{spaceId}` with
`{ count, lastEventAt }`. Events with no space (F2 friend request) share the key
`_social`.

```
event arrives for (recipient, space)
  if now - lastEventAt > WINDOW:  count = 0          ← quiet period over, reset
  count < N   → normal push
  count == N  → final push: "<actor>: more changes in <space>, open the app to see them"
  count > N   → no push (feed entry still written)
  count++, lastEventAt = now
```

Values: **N = 2, WINDOW = 60 s** (confirmed; tunable after real use).

The window is **quiet-based**: it resets only after `WINDOW` with no events, so a
continuous stream stays silent until it stops. Accepted: the feed holds everything.

**Reset is lazy.** No timer or job clears the counter. The next event sees a stale
`lastEventAt` and treats `count` as 0.

**Reset on open.** When the recipient opens a space in the app, the client sets that
space's counter back to `count: 0` (a fire-and-forget write to the user's own
`pushThrottle` document). Once they've seen the space, the next change pushes normally.

### 6.2 Concurrency

A burst fires many Cloud Function instances in parallel against the same counter.
The read-decide-write must run inside a **Firestore transaction** (`runTransaction`).
Otherwise concurrent triggers all read the same count and all push (lost update).
`FieldValue.increment()` alone is not enough, because it doesn't return the new value.

- The FCM send happens **after** the transaction commits, never inside it, because the
  transaction callback may be retried.
- If the transaction fails after retries, that trigger skips its push. The feed entry is
  written independently and is never lost.

### 6.3 What v1 deliberately does not do

v1 never **defers** a push. Over the threshold, pushes are dropped, not held. The user
learns about the rest from the final "more changes" push and the feed. See §10 for the
v2 delayed-summary upgrade, which reuses the same counter document.

---

## 7. Imports

**An XLSX import must produce at most one push per recipient, never one per row.**
Every imported row still gets its own feed entry.

Mechanism (decided):

1. Every imported transaction carries **`importBatchId`**, a new optional field on
   `Transaction` (one id per import run).
2. After **all** its write batches have committed, the importer writes one document:
   `travels/{spaceId}/importBatches/{importBatchId}` =
   `{ createdBy: uid, rowCount: number, createdAt: serverTimestamp() }`.
3. A Cloud Function on that document's creation queries
   `transactions where importBatchId == id`, works out each member's involvement, writes
   one `import_completed` feed entry per involved member (actor excluded) and sends
   **one** push each: "Alice imported 120 transactions in 🇯🇵 Japan, 35 involve you".
   Recipients come from the server query, not from client-supplied counts.

Rules:

- **"No push for imported rows" applies to the create trigger only.** `importBatchId`
  stays on the transaction forever, so a later edit of an imported transaction
  notifies normally (T2/T3).
- Imported rows still get their own `tx_created` feed entries, carrying `importBatchId`
  so the feed UI can group them under the summary.
- Security: a space member may **create** an `importBatches` document only with
  `createdBy == request.auth.uid`. No update or delete.

Edge cases:

| Case | Behaviour |
|---|---|
| Import > 500 rows (several batches) | Batch document written after the last batch, so it fires once |
| Offline import | The client's queued writes reach the server in order, so the batch document arrives after its rows |
| App closed mid-import | Rows written so far have feed entries, no push. Accepted |

Must be in place before import (`SHEETS_FEATURE_ENABLED` in `TransactionsTab.tsx`) and
push are both live. Bonus: `importBatchId` makes a future "undo this import" trivial.

---

## 8. Offline-synced writes

Writes queued offline (planes, roaming off) arrive in bursts on reconnect. Their
triggers spread over **a few seconds**, well inside the limiter's `WINDOW`.

**v1: no special handling.** The §6 limiter already caps an offline burst at N + 1
pushes (the first N as normal pushes, then one "more changes" push). Offline detection
would only reduce that to a single push, so it moves to §10.

---

## 9. Preferences and UI

### 9.1 Preference levels

| Level | Question | Stored in | Shown in |
|---|---|---|---|
| **Device** (master switch) | Can *this device* receive pushes? | OS permission + `users/{uid}/fcmTokens/{token}` | Profile → Preferences |
| **Space** | Do I want pushes from *this space*? | `mutedSpaceIds: string[]` in `users/{uid}/private/notifications` (§3.5) | Space → Parameters → Manage space |
| **Field** (v2) | Which edits matter to me? | (§10) | (§10) |

- If the device level is off, the other levels have no effect on that device.
- All levels filter **push only**. The feed always records every event.
- Space mute is stored **on the user's private document (§3.5), not the space**: it's personal, other members
  shouldn't see it, and a per-user write avoids rewriting the shared space document
  (and triggering every member's listener) on each toggle. The Cloud Function checks
  `mutedSpaceIds` before sending.
- Spaces are **not** listed in Profile. The per-space setting lives only in the space.

### 9.2 Profile → Preferences: device toggle

The toggle has four states, driven by live state (§2.2):

```
iOS in a Safari tab (push impossible):
  🔔 Notifications
     To get notifications on iPhone, add GlobeExpenses to your
     Home Screen: Share ⎋ → "Add to Home Screen"

Not asked yet:
  🔔 Notifications on this device            [ Enable ]

Granted:
  🔔 Notifications on this device            [ ●━━ On ]

Blocked (user denied the OS prompt; the browser won't prompt again):
  🔔 Notifications are blocked on this device.
     Re-enable them in your phone's settings → GlobeExpenses.
```

Turning it off deletes this device's token and sets the opt-out flag. The OS
permission stays granted, so turning it back on needs no prompt (§2.1).

### 9.3 Space → Parameters → Manage space

```
Device enabled:
  🔔 Notifications for this space            [ ●━━ On ]
     Want to turn off all notifications? Profile settings →

Device not enabled:
  🔔 Enable notifications on this device     (tap → OS prompt directly)
     Want to turn off all notifications? Profile settings →
```

### 9.4 When to ask for permission

**The OS permission prompt never opens on its own.** It only follows a user tap on an
in-app banner or button. The same process applies on Android and iOS. The only
difference: on iOS in a Safari tab, banners say "Add to Home Screen first" instead of
offering Enable.

Banner moments:

| | Moment | Message (draft) |
|---|---|---|
| a | First time the user invites someone, by any method (link, friend, member slot) | "Get notified when members join your space and add or edit transactions." |
| b | Joining a space that has at least one other claimed member (includes accepting an invite on `/invite/:id`) | "Get notified when members add or edit transactions involving you." |
| c | Parameters, tapping the option (§9.3) | (no banner, direct) |
| d | Space creation onboarding, **only** if "invite people" is tapped | same as a |
| e1 | First time the user sees a transaction someone else added that involves them | "Alice added Dinner (€42) involving you. Get notified next time?" |
| e2 | First launch of the installed app on iOS, if the user is in a shared space | same as b. Needed because Safari-tab users could not enable earlier |

**No-nagging rule:** each moment shows its banner **at most once**. After two
"Not now" answers in total, all banners stop and only c) and the Profile toggle remain.

Banner state ("already shown" per moment, "Not now" count) is stored **per device**
in `localStorage`, like the permission it leads to. A new device starts fresh.

### 9.5 Tapping a notification

- Transaction events open the space on that transaction (reuse the existing
  `watchedTxId` pattern in `TravelDetailPage`, to be confirmed at implementation).
- Space-level pushes ("more changes", import finished, member joined) open the space.
- Space deleted opens the spaces list.

### 9.6 Reserved for the Activity Feed

A 🔔 header icon with an unread badge, next to the profile avatar (which already
carries the pending-invites badge). v1 must not use that spot for anything else.

---

## 10. Later versions

| Item | Notes |
|---|---|
| **Delayed summary push** | Replace the "no push" branch of §6.1 with a Cloud Tasks job (`onTaskDispatched`, `scheduleDelaySeconds`) that sends an exact summary ("Alice: 12 changes in Japan") after a quiet window. Needs re-scheduling on new events and duplicate protection (at-least-once delivery). Build only if the v1 "more changes" message proves insufficient. |
| Activity Feed UI | Reads `users/{uid}/activity`. May visually group runs of events, while storage stays one document per event. |
| Service-worker lock-screen cleanup | Close older notifications for the same space before showing a new one (`getNotifications()` + `close()`). Verify on a real iPhone first. |
| **Per-user, per-field notification preferences** | Each user chooses which fields, including the space's custom fields, trigger a push when edited. This replaces the fixed material/cosmetic split of §5.3 for that user. Not a priority. |
| **Offline-burst detection** | `createdAt` / `lastModifiedAt` use `serverTimestamp()`, which is resolved when the write *reaches the server*, so they can't reveal offline queuing. Add a client-side `clientModifiedAt` (`Date.now()` at write time) on create and update. If `triggerTime - clientModifiedAt > 2 min`, the event enters the limiter at `count == N` and sends one "<actor> synced changes in <space>" push. This cuts an offline burst from N + 1 pushes to 1. |
| S1/S2 push | Revisit after real use. |
| L1, L2 | See §4. |

---

## 11. Implementation notes (November 2026)

Points the design left open, as built. Reasons are in the journal.

- **Involved** = listed as payer or beneficiary with a non-zero amount (any listed
  member on a zero-total transaction). A recipient must also still be in `memberUids`.
- **Cosmetic fields** also include `date`, `fees`, `adjustmentMode`, `amountFormula`.
  An edit that changes no visible field writes no event.
- **S1 fires on gaining access** (`memberUids` grows), not on claiming a slot.
  **F3a** is that same `member_joined` event, pushed to the inviter only; the inviter
  is read from the invite named by `pendingInviteId`.
- **No end-user actor, no event** (Admin SDK or console writes). The delete cascade
  relies on this as well as on the missing parent space.
- **Imports:** a write that stamps a new `importBatchId` never pushes, so a re-import
  that updates rows in place is covered too. The summary's counts come from the server
  query; the client's `rowCount` is ignored.
- **Limiter keys:** F1, F2 use `_social`; everything tied to a space the recipient is
  in uses the space id, including the import summary and F3a.
- **Tap targets:** transaction events → `/spaces/:id?tx=:txId`; deleted transaction,
  member and import events → `/spaces/:id`; space deleted → `/spaces`; space invite →
  `/invite/:inviteId`; friend events → `/profile`.
- **Notifications also show while the app is open**: iOS forbids a push without a
  visible notification, so nothing is suppressed in the foreground.
- **Known gap:** merging two member slots rewrites many transactions and reads as many
  material edits (3 pushes at most, one feed entry each).

---

## 12. Open questions

- **Retention (deferred, to fix later):** activity documents are kept forever for now.
  Revisit once real volumes are known (~1 KB per event per recipient; Firestore
  storage is free up to 1 GiB, then ~$0.18/GiB/month).