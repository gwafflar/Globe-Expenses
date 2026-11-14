# Notifications — Device Test Plan

> What to test by hand, on real devices, before the feature goes to production hosting.
> Everything a machine can check is already automated (see "Already verified" at the end).
> Report back per test: **OK** or **FAIL + what you saw**.

**Test URL (preview channel, expires 14 Dec 2026):**
https://globe-expenses--notifications-6n7f4qze.web.app

Functions and security rules are already live on the production project; only the
web app is on the preview channel. The preview talks to the **real** database, so use
a test space.

## Setup

You need **two accounts** in **one shared space**, each with a claimed member slot:

- **A = actor**: any browser on a computer is easiest (same preview URL).
- **B = recipient**: the phone under test.

A user is never notified of their own actions, so one account alone shows nothing.

The preview URL is a different origin from `globe-expenses.web.app`: sign in again
there, and on iPhone install it to the Home Screen **from the preview URL**.

---

## P1 — Platform (these gate everything else)

### T1. Android: enable and receive
1. On the Android phone (Chrome), open the preview URL, sign in as B.
2. Profile → Preferences → **Notifications on this device** → **Enable** → allow.
3. Expected: the row becomes a switch, **On**.
4. Close the app completely (swipe it away).
5. As A, add an expense in the shared space with B as beneficiary.
6. Expected within ~5 s: a notification on the phone, e.g.
   *"🇯🇵 Japan — Alice added Dinner (€84) · your share €42"*.

Watch for: no notification at all → tell me, I will read the function logs.

### T2. Android: tap opens the transaction
1. Tap the notification from T1 (app closed).
2. Expected: the app opens on the space, Transactions tab, **that transaction expanded**.
3. Repeat with the app **already open** on another page (e.g. Profile): add another
   expense as A, tap the notification.
4. Expected: the open app navigates to the transaction, without reloading.

### T3. iPhone: Safari tab shows the install hint
1. On the iPhone, open the preview URL **in Safari** (not installed), sign in as B.
2. Profile → Preferences.
3. Expected: no Enable button; text explaining "add GlobeExpenses to your Home Screen".

### T4. iPhone: installed app, enable and receive
1. Safari → Share → **Add to Home Screen**. Open the installed app, sign in as B.
2. Profile → Preferences → **Enable** → allow in the iOS prompt.
   - Watch for: **the iOS prompt not appearing at all**. That would mean the tap
     "gesture" was lost before the prompt request — an important failure to report.
3. Lock the phone. As A, add an expense involving B.
4. Expected: notification on the lock screen with the right text.
5. Tap it. Expected: the app opens on that transaction.

### T5. iPhone: no silent pushes
1. Still with T4's setup, wait **at least one minute** after T4's notification (so the
   limiter starts from zero), then as A add **6 expenses quickly** (within a minute),
   all involving B. Keep B's app closed meanwhile.
2. Expected on the phone: **exactly 3** notifications — two normal ones, then
   *"Alice: more changes in 🇯🇵 Japan. Open the app to see them."*, then nothing.
3. Next day (or after an hour): check Profile → the switch is **still On** and a new
   expense still notifies. (iOS can revoke the subscription if a push ever arrives
   without a visible notification; this checks it did not.)

---

## P2 — Behaviour (any one device is enough)

### T6. Limiter reset on open
1. Right after T5 (burst silenced), open the space on B's phone, then close the app.
2. As A, add one more expense.
3. Expected: a **normal** notification again (opening the space reset the counter).
4. Alternative check: wait 60 s with no activity instead of opening → also normal again.

### T7. What pushes and what does not
As A, in the shared space, one action at a time (wait ~1 min between them, or open
the space on B between them, so the limiter does not interfere):

| A does | Expected on B |
|---|---|
| Edit the **amount** of an expense involving B | Push: "edited … · your share €X → €Y" |
| Edit only the **name / category / notes** | **No push** |
| Edit an expense to **remove B** from the split | Push: "removed you from …" |
| **Delete** an expense involving B | Push: "deleted … · your share was …" |
| Add a **transfer** from A to B | Push: "recorded a payment of … to you" |
| Add an expense that does **not** involve B | **No push** |

### T8. Mute one space
1. On B: space → Parameters → Manage space → **Notifications for this space** → Off.
2. As A, add an expense involving B. Expected: **no push**.
3. Turn it back On. As A, add another. Expected: push.

### T9. Master switch off, and it stays off
1. On B: Profile → switch **Off**.
2. Close and reopen the app. Expected: still **Off** (not silently re-enabled).
3. As A, add an expense. Expected: no push.
4. Switch **On** again. Expected: **no** OS prompt this time; pushes resume.

### T10. Sign-out removes the device
1. On B (notifications On): Profile → Sign out.
2. As A, add an expense involving B. Expected: **no push** on that phone.
3. Sign in again as B. Expected: Profile shows **On** without any prompt; pushes resume.
4. Optional privacy check: sign out B, sign in as a third account C on the same phone.
   A adds an expense involving B. Expected: nothing arrives on the phone.

### T11. Invitations
1. From A: Parameters → Members → invite a **friend** (targeted invite) who has
   notifications on. Expected on the friend's device: "Alice invited you to 🇯🇵 Japan";
   tapping opens the invite page.
2. The friend accepts. Expected on **A's** device: "<name> joined this space".
3. Send a **friend request** to an account with notifications on.
   Expected: "… sent you a friend request"; tapping opens Profile.

### T12. Permission banners
On a device/browser where notifications were **never asked** (or clear site data):

1. As B, open a space where A already added an expense involving B.
   Expected: a blue banner "Alice added … involving you. Get notified next time?"
   with **Enable** / **Not now**.
2. Tap **Not now**. Reload: the same banner does **not** come back.
3. Generate an invite link (Parameters → Members). Expected: a banner once
   ("Get notified when members join your space…"). Tap **Not now** again.
4. After two "Not now", no banner appears anywhere any more; Profile and Parameters
   still offer Enable.

### T13. Deleted transaction link
1. As A, add an expense involving B, then **delete it** before B taps the first notification.
2. On B, tap the "added" notification.
3. Expected: the space opens and, after a few seconds, a notice
   "This transaction no longer exists."

---

## P3 — Only if you have time

### T14. Delete a space
1. As A, create a solo test space with a few transactions, then delete it
   (Parameters → Manage space).
2. Expected: back on the list immediately, space gone. In the Firebase console,
   `travels/{id}/transactions` is empty a few seconds later (server-side cascade).

### T15. Import (feature flag is still off)
Only testable after setting `SHEETS_FEATURE_ENABLED = true` locally. Import a file with
many rows involving B. Expected: **one** push "Alice imported N transactions, K involve you".

---

## If something fails

Tell me the test number and what you saw. Useful extras:

- the time of the action (I match it against the function logs),
- on Android / desktop Chrome: `chrome://serviceworker-internals` shows whether the
  worker received the push.

I can read the server side myself (`firebase functions:log`).

## Already verified (no need to repeat)

- Event rules, recipients, share amounts, limiter decisions, notification texts:
  79 unit tests (`pnpm test:functions`).
- Security rules for every notification path, incl. `importBatches`: 28 tests (`pnpm test:rules`).
- All five triggers end to end in the local emulators: 29 checks (every event kind,
  mute, limiter counter, import summary, delete cascade with no per-transaction event).
- App: 644 tests, typecheck, production build. The preview page loads and its service
  worker activates with the push handlers.

**Not verifiable without a device:** that FCM actually delivers to a real token, the
iOS permission prompt, the lock-screen display, and tap-to-open. That is T1–T5.
