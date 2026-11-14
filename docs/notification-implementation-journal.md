# Notifications — Implementation Journal

Brief log of how the implementation of `docs/NOTIFICATIONS_SPEC.md` went.
Design lives in the spec; device tests in `docs/NOTIFICATIONS_TEST_PLAN.md`.

## Status (14 Nov 2026)

| Step | What | State |
|---|---|---|
| 1 | Functions scaffold, emulators, rules | ✅ done 5–6 Oct, deployed |
| 2 | Device registration, service worker push, Profile toggle | ✅ built, device-tested |
| 3 | Activity writer for transactions | ✅ built, tested, deployed |
| 4 | Push sender: limiter, mute, dead-token cleanup | ✅ built, tested, deployed (real FCM delivery unverified) |
| 5 | Space & social events, `onTravelDeleted`, simplified `deleteSpace()` | ✅ built, tested, deployed |
| 6 | Imports (`importBatchId`, `importBatches`) | ✅ built, tested, deployed (import UI still flagged off) |
| 7 | Space toggle, banners, tap deep link, reset-on-open | ✅ built, device-tested |

Deployed: Firestore rules, 5 functions and the web app, all on production
(14 Nov, after every test in `NOTIFICATIONS_TEST_PLAN.md` passed).

## 14 Nov 2026 — steps 2–7 in one session

**Order worked:** server first (steps 3–6, all testable in the emulator), then client
(steps 2 and 7), then deploy. The device test originally planned between steps 2 and 3
runs at the end instead, on the complete feature.

**Server (`functions/src/`)**
- `events/*.ts` are pure: (what changed, space, actor) → one draft per recipient.
  `index.ts` holds five thin triggers; `activity/publish.ts` writes the feed entries,
  `push/send.ts` does tokens → mute → limiter → FCM → dead-token cleanup.
- Replaced the temporary `smokeTransactionWritten` with `onTransactionWritten`.
- 79 unit tests; a 29-check end-to-end script against the emulators passed.

**Client (`src/notifications/`)**
- `pushService.ts` (token lifecycle), `pushState.ts` (pure state + no-nagging rule),
  a Zustand store for the single permission banner, two toggles, a click handler.
- `public/push-sw.js` added to the generated service worker through `importScripts`.

## Decisions taken during implementation

- **Second Firestore mapping in `functions/`** (the open step-3 decision).
  `functions/src/mapping.ts` maps only what notifications read; `mapping.test.ts` pins
  the legacy-member cases of `normaliseMember()`. Recorded as an explicit exception in
  `CLAUDE.md`. A shared package was rejected: it needs a build step for one small function.
- **`createdAt` = the trigger's event time**, not "now". Same value across trigger
  retries (idempotent) and the feed orders by when things happened.
- **No actor, no event.** Writes with no end user behind them (Admin SDK, console) are
  ignored. This is also what silences the delete cascade.
- **A slot claim is not a `member_joined` event**; only gaining access (`memberUids`)
  is. A join already creates a claimed slot, so the identity-pick step would announce
  the same person twice.
- **F3a comes from the space, not the invite.** The inviter is found through
  `pendingInviteId`. An invite can be marked used without anyone joining.
- **Re-import that updates rows in place does not push either.** Rule: a write that
  stamps a *new* `importBatchId` is an import write. Later manual edits notify normally.
- **`date`, `fees`, `adjustmentMode`, `amountFormula` are cosmetic** (the spec lists
  neither; none changes what anyone owes).
- **Three fields added to the activity document** beyond spec §3.1: `inviteId`
  (deep link), `import: { rowCount, involvingMe }`, `transferFrom`. Spec updated.
- **Data-only FCM messages.** The service worker builds every notification itself,
  as §2.3 requires. Each message carries `title`, `body`, `url`, `kind`.
- **Token removal does not rely on the SDK's `deleteToken()` alone.** Without a prior
  `getToken()` in the session it tries to register a default
  `firebase-messaging-sw.js`. The browser subscription is always dropped as well, which
  works offline; FCM then reports the token dead and the function deletes its document.
- **A token left by another account on the same device forces a new token** on sign-in,
  so two accounts never share one address.
- **The deep link stays in the URL** (`?tx=`) and the focused transaction is derived
  from it, rather than copied into state.

## Findings

- The emulator never supplies an actor (known from step 1). Triggers take an
  emulator-only fallback (`lastModifiedBy` / `createdBy`), guarded by `FUNCTIONS_EMULATOR`.
- `navigator.serviceWorker.ready` never resolves under `pnpm dev` (no worker).
  `pushService` checks for a registration first and bounds every wait.
- The old client-side cascade was harmless for notifications after all: a space can
  only be deleted by its last user, so those deletes had no recipient. The server
  cascade is still worth having (500-write cap, offline, crash safety).
- `pnpm lint` reports 92 problems on this branch before and after: no new ones.

## 14 Nov 2026 (afternoon) — first device results

- **Confirmed on devices:** FCM delivers from the deployed functions to iPhone
  (installed app) and to Firefox on Android; the service worker shows the notification;
  tapping opens the invite page and the transaction. iOS Safari-tab hint and the iOS
  permission prompt from a tap both work.
- **Reported:** most transaction pushes missing. Logs: 7 runs of `onTransactionWritten`,
  1 push sent and delivered, 6 silent exits. The silent exits could not be told apart
  from the logs. Most likely cause, inferred from the code and not yet observed: the
  form's default split is "me only", so those expenses involved nobody else (spec T7).
- **Fix for the blind spot:** `onTransactionWritten` logs one line per run with the
  outcome and counts (no names or amounts); `deliverPush` logs every reason for not
  pushing (no device, muted, limiter). Redeployed.
- **Bug fixed:** the permission banner stayed on screen after enabling notifications
  from Profile. The banner store now listens to `pushService` changes and closes when
  there is nothing left to enable; `enablePush()` announces the granted permission
  before the (slower) token creation.
- **Firefox for Android** delivered a push about a minute late, on unlock. Sent with
  `Urgency: high`; the delay is on the browser's push service side. Chrome is the
  spec's Android target.
- **Open:** Windows Firefox received nothing — not yet explained; the new logs will
  show whether that account was a recipient and had a device registered.

## 14 Nov 2026 (evening) — release

- The user redid T1–T5 with B in the split and ran the rest of the plan: **all tests
  passed**. The earlier missing pushes were the "me only" default split, as inferred.
- Committed as one ✨ feat commit, PR to `main`, production deploy (rules, functions,
  hosting).

## Open points

- **Windows Firefox** received nothing in the first round; not re-observed since the
  reason logging went in. Not a target platform.
- **`mergeMembers()` is a bulk edit**: merging two member slots rewrites every
  transaction that used them, and each rewrite is a material edit. The limiter caps it
  at 3 pushes, but the feed gets one entry per transaction. Could be stamped like an
  import if it proves noisy.
- **Notifications show while the app is open** as well (iOS forbids a push without a
  visible notification, so there is no foreground suppression).
- **Activity Feed UI** (spec §10): entries are written from day one, nothing reads them yet.
- From the spec, unchanged: activity retention, iOS `getNotifications()`/`close()`.
