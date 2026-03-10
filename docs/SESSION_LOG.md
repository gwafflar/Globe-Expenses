# GlobeExpenses 🌏 — Session Log

> Append a new entry at the end of each working session.
> Load this file (along with ARCHITECTURE.md, SPEC.md, and DEVELOPER_PROFILE.md) at the start of every new session.
> Keep entries concise — this is a log, not a diary.

---

## 📝 Working Session 001 — February 2026

**Type**: Design & planning (no code written)
**Tools used**: Claude (claude.ai)

### What was discussed

- Introduced the project concept: collaborative travel expense tracker, mobile-first, multi-user, offline-capable.
- Evaluated platform options: PWA vs native app. **Decided: PWA.**
- Evaluated backend options. **Decided: Firebase (Firestore + Auth + Cloud Functions + FCM).**
- Discussed and selected the full technology stack (React 18 + TypeScript + Vite + shadcn/ui + Zustand + Dexie.js).
- Deep-dived into the data model, especially the transaction split model.
- Decided that both `paidBy` and `beneficiaries` are `Split[]` arrays (multi-payer model), each summing to the transaction total. This handles all real-world payment scenarios.
- Decided currency exchange rates are hardcoded for v1, but stored per-transaction at creation time (so the field is future-proof).
- Discussed travel membership: fixed at creation in v1. Dynamic joining with join-date visibility cutoff deferred to v2.
- Discussed offline conflict strategy: last-write-wins in v1. Conflict detection (via `lastModifiedAt` timestamp) and UI warning deferred to v2.
- Decided categories and payment methods are global per user (not per travel), fully customizable.
- Discussed the vibe-coding methodology: Cursor as primary IDE, Claude for architecture/review, work in small verifiable chunks, maintain living spec files, write tests alongside code.

### What was produced

| File | Description |
|------|-------------|
| `TravelLedger_Architecture.docx` | General architecture document (layers, stack, data models, flows, security, roadmap) |
| `TravelLedger_Specification.docx` | Formal product specification (vision, requirements, decision log, out of scope) |
| `DEVELOPER_PROFILE.md` | Developer skills profile for AI context calibration |
| `SESSION_LOG.md` | This file |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 1 | PWA platform | Single codebase Android + iOS, no store fees |
| 2 | Firebase backend | No custom server, offline sync built-in |
| 3 | React 18 + TypeScript | Best AI tooling ecosystem |
| 4 | Vite + vite-plugin-pwa | Fast DX, first-class PWA support |
| 5 | shadcn/ui + Tailwind CSS | Readable generated code, accessible components |
| 6 | Zustand for state | Minimal boilerplate |
| 7 | Dexie.js for IndexedDB | Offline write queue |
| 8 | Hardcoded currency rates (v1) | Rate stored per transaction regardless of source |
| 9 | Multi-payer split model | Both paidBy and beneficiaries are Split[] summing to total |
| 10 | Global categories & payment methods | Per user, across all travels, fully customizable |
| 11 | Fixed travel membership (v1) | Dynamic joining deferred to v2 |
| 12 | Last-write-wins conflict policy (v1) | Detection + UI warning deferred to v2 |
| 13 | Email/password + Google OAuth | No Apple login (not targeting App Store) |
| 14 | No custom server | All backend logic in Cloud Functions |

### Open questions / deferred items

- ~~App name: "TravelLedger" is a placeholder~~ → **Resolved in Session 002: GlobeExpenses 🌏**
- Settlement recording (marking a debt as paid): out of scope v1, to be specced for v2.
- CSV serialization format for Split[] fields: to be defined during implementation.
- Settlement computation location: client-side v1, may move to Cloud Functions v2.
- Per-travel category filtering: deferred (categories are global for now).

---

## 📝 Working Session 002 — February 2026

**Type**: Environment setup
**Tools used**: Claude (claude.ai)

### What was discussed

- Finalized app name: **GlobeExpenses 🌏** (replaces TravelLedger placeholder across all documents).
- Planned the full setup sequence: WSL2, Node, pnpm, Git, Firebase, Cursor, project scaffold.
- Decided to use **WSL2 + Ubuntu** as the development environment on Windows 11, giving a Linux-consistent workflow.
- Decided to use **Node v24 LTS** (current LTS at time of setup) and **pnpm v10**.
- Set up Firebase project: Auth (email/password + Google OAuth), Firestore (production mode), Firebase Hosting, web app registered.

### What was produced

| File | Description |
|------|-------------|
| `GlobeExpenses_Architecture.docx` | Architecture doc renamed from TravelLedger |
| `GlobeExpenses_Specification.docx` | Spec doc renamed from TravelLedger |
| `DEVELOPER_PROFILE.md` | Updated with GlobeExpenses name |
| `SESSION_LOG.md` | This file, updated |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 15 | App name: GlobeExpenses 🌏 | Replaces TravelLedger placeholder |
| 16 | WSL2 + Ubuntu as dev environment | Linux-consistent workflow on Windows 11 |
| 17 | Node v24 LTS + pnpm v10 | Current LTS at time of setup |
| 18 | Firebase project: `globe-expenses` | Auth + Firestore (prod mode) + Hosting configured |

### Open questions

- Firebase project region chosen — confirm which region was selected (for the log).
- Cursor setup: pending (to be done in this session or next).
- Project scaffold: pending (to be done in this session or next).

### Next steps

- [ ] Install Cursor on Windows
- [ ] Scaffold the Vite + React + TypeScript project in WSL
- [ ] Install all dependencies (Firebase SDK, shadcn/ui, Zustand, Dexie.js, vite-plugin-pwa)
- [ ] Set up folder structure per architecture doc
- [ ] Connect app to Firebase (paste config, initialize SDK)
- [ ] First Git commit
- [ ] Place all four context docs in repo root --> edit: see later if a good idea to make it public or not


## 🏗️ Working Session 003 — March 2026

**Type**: Project scaffolding
**Tools used**: Claude (claude.ai) + Cursor

### What was done

- Scaffolded Vite + React + TypeScript project in ~/projects/global-expenses
- Installed and configured Tailwind CSS v4 (new @import syntax, @tailwindcss/vite plugin)
- Installed and configured shadcn/ui (required manual tsconfig.json + tsconfig.app.json path alias setup)
- Installed all dependencies: firebase, zustand, dexie, vite-plugin-pwa, workbox-window, react-router-dom
- Created src/ folder structure per architecture doc (auth, travels, transactions, dashboard, settings, shared, services)
- Initialized Firebase SDK (firebase.ts) with new persistentLocalCache API (replaced deprecated enableIndexedDbPersistence)
- Wired Firebase config via .env (VITE_ prefix)
- Set up React Router with placeholder routes (/login, /travels, 404)
- Created Zustand auth store (useAuthStore) with currentUser and isAuthReady state
- Wired onAuthStateChanged to keep Zustand store in sync with Firebase session
- Configured vite-plugin-pwa with web manifest and Workbox cache strategy
- Pushed to GitHub

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 19 | Tailwind v4 | @import "tailwindcss" syntax, @tailwindcss/vite plugin |
| 20 | Path alias @/ → src/ | Required in both tsconfig.json and tsconfig.app.json |
| 21 | Firebase persistence: persistentLocalCache | Replaces deprecated enableIndexedDbPersistence |
| 22 | PWA: autoUpdate Service Worker strategy | Silent background updates on new deploys |

### Lessons learned

- shadcn/ui init requires Tailwind and tsconfig path alias to be manually configured first
- Vite splits TS config across tsconfig.json + tsconfig.app.json — path alias needed in both
- Missing .env values don't throw at startup — Firebase only fails on actual network calls
- Service Workers only activate in production builds, not dev mode

### Next steps

- [ ] Replace placeholder PWA icons with real GlobeExpenses icons
- [ ] Build Login and Registration screens (auth/ module)
- [ ] Implement auth flow: redirect to /login if not authenticated, /travels if authenticated
- [ ] Set up Firestore security rules

---

## 🧠 Brainstorming Session 01 — March 2026

**Type**: Feature brainstorming & design (no code written)
**Tools used**: Claude (claude.ai)

### What was discussed

- Explored automatic transaction import via bank APIs and AI agents: a Cloud Function receives a bank webhook, calls an LLM to parse and structure the data, and creates a draft transaction pending user review.
- Surveyed bank API landscape:
  - **Revolut**: native webhook + developer API → best option for push-based import
  - **Wise**: webhook support, more transfer-oriented but workable
  - **N26 / Deblock (fiat)**: no public API; PSD2-compliant → accessible via GoCardless/Nordigen aggregator (polling only)
  - **Deblock (on-chain wallet)**: blockchain transactions are public → real-time webhooks via Alchemy or Moralis; actually the most straightforward integration
  - **GrabPay**: no API, no Open Banking equivalent in SEA → dead end
- Noted that on-chain accessibility is a feature of crypto's public-by-design architecture, not an irony.
- Discussed reaching out to fintech teams (Deblock, Revolut) as a personal growth opportunity: framing the outreach around a concrete use case (not just "do you have an API?") is more likely to open doors and get early access.
- Designed the draft transaction feature end-to-end:
  - **createdBy** extended to a union type: `{ type: 'user', uid }` or `{ type: 'agent', name }` — applies to both transactions and drafts
  - **Draft inbox**: global (all travels), filterable by payment method / source bank
  - **Drafts are pre-filled** with: date, merchant name, amount, currency, country, city (inferred from bank data or past records), payment method, suggested category
  - **Draft lifecycle**: pending → reviewed (committed as transaction) or dismissed
  - **Bulk actions**: multi-select for delete or travel assignment
  - **Travel selection carousel**: horizontal swipe carousel with large cards (travel name + emoji), extending beyond screen edge to hint at scrollability — single focused interaction, not a multi-step wizard
  - **Form editor**: standard pre-filled transaction form, splits expandable at bottom
  - **Manual fetch button**: triggers agent on-demand in case a webhook was missed
- Added **travel emoji** as a v1 feature: optional emoji on Travel document, used in carousel cards and travel lists.
- Decided to design the UI (wireframes) before implementing v2 features to avoid backend rework.
- Deferred recurring/template transactions from a previous transaction → v4 (acknowledged as likely never).

### What was produced

| File | Description |
|------|-------------|
| `GlobeExpenses_Architecture.docx` | Updated: drafts/ module, drafts Firestore collection, Draft data model, bank import agent flow, updated roadmap, new open questions |
| `GlobeExpenses_Specification.docx` | Updated: travel emoji field, createdBy union type, full draft transaction spec (sections 3.4.x), UI design principles, updated decision log |
| `SESSION_LOG.md` | This file, updated |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 23 | createdBy as union type | `{ type: 'user', uid }` or `{ type: 'agent', name }` — backward compatible, applies to transactions and drafts |
| 24 | Travel emoji (v1) | Optional emoji field on Travel; displayed in carousel and travel lists |
| 25 | Draft inbox: global + filter by source | All drafts in one inbox, filterable by payment method / bank source |
| 26 | Carousel for travel selection in drafts | Horizontal swipe carousel, travel name + emoji cards, extends beyond screen edge |
| 27 | Bank import: Revolut preferred for v2 | Native webhook. Fiat aggregator via GoCardless for N26/Deblock. On-chain via Alchemy/Moralis for Deblock wallet. |
| 28 | UI design before backend for complex flows | Wireframes validated before finalizing data models for draft flow and other complex v2 features |

### Open questions / deferred items

- Draft expiry policy: auto-expire unreviewed drafts after N days? Duration and UX TBD (v2).
- Connected accounts management UI: where does the user configure which bank accounts are linked? (settings/ module, v2)
- Outreach to fintech teams (Deblock, Revolut) for early API access — personal action item, not a dev task.
- Recurring transactions from a template → explicitly deferred to v4.

### Next steps (v1 — unchanged)

- [ ] Replace placeholder PWA icons with real GlobeExpenses icons
- [ ] Build Login and Registration screens (auth/ module)
- [ ] Implement auth flow: redirect to /login if not authenticated, /travels if authenticated
- [ ] Set up Firestore security rules
- [ ] Design UI wireframes for the draft transaction flow before speccing v2 backend

---

## 🧠 Brainstorming Session 01.2 — March 2026

**Type**: Feature refinement (no code written)
**Tools used**: Claude (claude.ai)

### What was discussed

- **Draft lifecycle**: decided on soft delete. Drafts are never hard-deleted. On validation, status → 'validated' and `linkedTxId` is set pointing to the created transaction. On dismissal, status → 'dismissed'. Both states are hidden from the inbox but retained in Firestore for audit.
- **Raw data access**: `rawData` (original bank payload) stays on the draft document permanently. The transaction gains a lean `draftId` field pointing to the originating draft — no data duplication. When editing a transaction created via bank import, the UI offers an expandable "View original bank data" panel that fetches `rawData` from the linked draft on demand.
- **User.type field**: the User data model was missing an explicit `type` field. Added as a fixed `'human'` value to clearly document the actor model — agents never have User documents, they only appear in `CreatedByRef`.
- **Activity feed**: designed as a first-class v2 feature, distinct from the Drafts inbox. The Activity tab surfaces collaborative transaction events that affect the current user (created/edited transactions where they are a payer or beneficiary). Pull model in v2; upgrades to push via FCM in v3. Includes deep-links to transactions for quick review and editing.
- **Manual fetch trigger**: the "fetch new transactions" button (on-demand webhook fallback) moved from v2 to v4 — reliable webhooks make it low priority.
- **Notifications (Phase 3)** clarified: the in-app activity feed ships in v2 as pull; FCM push notifications upgrade it in v3.

### What was produced

| File | Description |
|------|-------------|
| `GlobeExpenses_Architecture.docx` | v0.3: User model (type field), Transaction model (draftId), Draft model (soft delete, linkedTxId, rawData policy), new section 5.4 Activity Feed Flow, updated roadmap and open questions |
| `GlobeExpenses_Specification.docx` | v0.3: User.type field, Transaction Draft ID field, draft lifecycle section (3.4.3), activity feed section (3.5), section renumbering, updated out-of-scope, 6 new decision log entries (#17–21) |
| `SESSION_LOG.md` | This file, updated |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 29 | Draft soft delete | Drafts never hard-deleted; 'validated' and 'dismissed' states hidden from inbox but retained |
| 30 | Transaction.draftId | Lean pointer to originating draft; raw data fetched on demand, not duplicated on transaction |
| 31 | rawData on draft is permanent | Original bank payload preserved indefinitely for audit and retroactive inspection |
| 32 | User.type = 'human' | Explicit field on User document to document the actor model |
| 33 | Activity feed in v2 (pull) | Separate from Drafts inbox; collaborative events affecting current user; push upgrade in v3 |
| 34 | Manual fetch trigger → v4 | Low priority given reliable webhooks |

### Open questions / deferred items

- Activity feed storage model: top-level `activities/{userId}` collection vs derived from Firestore transaction listeners. TBD in v2 spec.
- Activity feed seen/unseen state: `lastSeenAt` on User document is the likely approach. TBD.
- Draft expiry policy: still open — auto-expire unreviewed drafts after N days? Duration TBD.


## ✨ Working Session 004 — March 2026

**Type**: Feature implementation
**Tools used**: Claude (claude.ai) + Cursor

### What was built

- Zustand auth store (`src/auth/store/useAuthStore.ts`) rewritten with:
  - `onAuthStateChanged` listener owning all auth state
  - Defensive Firestore profile check on sign-in: creates `users/{uid}` document if missing (handles Google OAuth and edge cases)
  - `signOut` action
  - `main.tsx` simplified — auth listener lives only in the store, not duplicated
- `ProtectedRoute` component (`src/auth/components/ProtectedRoute.tsx`):
  - Shows a spinner while `isAuthReady === false` (prevents flash-to-login for authenticated users)
  - Redirects to `/login` if unauthenticated
  - Renders `<Outlet />` for authenticated users
- Login page (`src/auth/pages/LoginPage.tsx`): email/password + Google OAuth, Firebase error mapping, loading states
- Register page (`src/auth/pages/RegisterPage.tsx`): display name + email + password, `updateProfile`, same error/loading pattern. Firestore doc creation deliberately omitted here — handled by auth store.
- Travels list page (`src/travels/pages/TravelsPage.tsx`):
  - Real-time `onSnapshot` listener via `useTravels` custom hook
  - Loading state, empty state, travel cards with emoji and formatted dates
  - "New travel" and "Sign out" buttons
- Create Travel modal (`src/travels/components/CreateTravelModal.tsx`):
  - Form fields: name (required), emoji, description, start date, end date
  - Firestore write via `travelService.ts` service layer
  - Writes both `members: MemberRef[]` and `memberUids: string[]` (dual-field pattern for security rules)
  - Modal closes on success; `onSnapshot` updates list automatically
- Travel types (`src/travels/types.ts`): `Travel` and `MemberRef` interfaces
- Travel service (`src/travels/services/travelService.ts`): `createTravel` function
- Firestore security rules deployed:
  - `users/{userId}`: owner-only read/write
  - `travels/{travelId}`: membership via `memberUids` array
  - `travels/{travelId}/transactions/{txId}`: membership via `get()` on parent travel
- Firestore composite index created: `memberUids (Arrays) + createdAt (Descending)` on `travels` collection

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 35 | Auth spinner pattern | Show spinner while `isAuthReady === false` to prevent flash-to-login |
| 36 | Firestore profile creation in auth store | Defensive check in `onAuthStateChanged` — creates doc if missing, handles Google OAuth automatically |
| 37 | memberUids dual-field pattern | `members: MemberRef[]` for UI, `memberUids: string[]` for security rules — Firestore rules cannot inspect fields inside array objects |

### Issues encountered & resolved

- **Infinite spinner after Google sign-in**: caused by Firestore security rules rejecting the `getDoc` call in the auth store before proper rules were deployed. Fixed by deploying rules.
- **`serverTimestamp()` inside arrays**: Firestore forbids `serverTimestamp()` inside array objects. Fixed by using `Timestamp.now()` for `members[0].joinedAt` while keeping `serverTimestamp()` for top-level `createdAt`.
- **Travels not appearing after creation**: caused by missing composite index for `memberUids array-contains + createdAt orderBy` query. Fixed by creating the index in Firebase Console.

### Lessons learned

- Firestore requires a composite index for any query combining `where` on one field with `orderBy` on a different field — including `array-contains` + `orderBy` combinations. Index is not auto-created for this case.
- `onSnapshot` query errors and permission errors can manifest as silent empty results rather than thrown exceptions.
- `serverTimestamp()` is only valid at the top level of a Firestore document, not inside nested objects or arrays.

### Carry-forward items (open)

- [ ] Firestore security rules for `drafts` subcollection not written yet — required before any v2 work
- [ ] `updateProfile` timing: Firestore user doc may be created with empty `displayName` on email/password registration — fix when building profile/settings screen
- [ ] Replace shadcn/ui component stubs with real shadcn components (`npx shadcn add button input label card`) before UI gets more complex
- [ ] Modal form state not reset on Cancel — minor UX fix
- [ ] Composite indexes should be managed via `firestore.indexes.json` in the repo rather than manually in Firebase Console
- [ ] Sign out button is visible on the travels page for testing — move to profile/settings screen in a later session
- [] From now on, add emoji to commit suggested name based on https://gitmoji.dev/ proposal.

### Next steps (Session 005)

- [ ] Travel detail page (`/travels/:travelId`) — clicking a card navigates to the travel
- [ ] Transaction list within a travel (empty for now)
- [ ] Transaction creation form (date, name, amount, currency, paidBy splits, beneficiaries)

## ✨ Working Session 005.1 — March 4th 2026

**Type**: Feature implementation
**Tools used**: Claude (claude.ai)

### What was built

- **`src/shared/utils/exchangeRates.ts`**: hardcoded exchange rates for 15 currencies (EUR base), `getExchangeRate()` cross-rate utility, `SUPPORTED_CURRENCIES` array
- **`src/auth/services/userService.ts`**: `UserProfile` interface, `getUser()` single-read Firestore fetch
- **`src/transactions/services/transactionService.ts`**: `createTransaction()` using `doc()` + `setDoc()` fire-and-forget pattern — returns document ID synchronously without awaiting server confirmation
- **`src/auth/store/useAuthStore.ts`**: extended with `userProfile: UserProfile | null`, loaded once at sign-in and stored globally — avoids per-form Firestore fetches, works offline
- **`src/transactions/hooks/useTransactions.ts`**: exports `TransactionWithStatus` (Transaction + `isPending: boolean`), uses `{ includeMetadataChanges: true }` so the callback fires when `hasPendingWrites` flips to false after sync
- **`src/transactions/components/TransactionForm.tsx`**: **full transaction creation form** (date, name, amount, currency, category, payment method, notes, split placeholders). Fire-and-forget save — closes immediately, passes new doc ID to parent via `onSuccess(newTxId: string)`
- **`src/travels/pages/TravelDetailPage.tsx`**:
  - `PendingBadge` component: detects `isPending true → false` transition via `useRef`, shows `✅ synced` flash for 2s
  - `SaveBanner`: orange (pending) or green (saved), driven by Firestore metadata not `navigator.onLine`
  - `watchedTxId` pattern: parent watches newly created tx ID in the live snapshot to derive banner colour — reliable even when WiFi is off

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 38 | Fire-and-forget transaction writes | `doc()` + `setDoc()` without await — returns ID synchronously, Firestore queues offline |
| 39 | User profile loaded once at sign-in | Stored in Zustand, avoids repeated Firestore reads, works offline |
| 40 | Banner colour driven by Firestore metadata | `hasPendingWrites` from snapshot, not `navigator.onLine` — correctly handles WiFi-off case |
| 41 | `watchedTxId` pattern | Parent tracks new doc ID in live snapshot to detect pending→synced transition |
| 42 | `includeMetadataChanges: true` on onSnapshot | Required for `hasPendingWrites` flip to trigger a re-render |

### Issues encountered & resolved

- **`navigator.onLine` unreliable when WiFi off**: returns `true` on desktop even without connectivity. Fixed by deriving banner state from `hasPendingWrites` in the Firestore snapshot instead.
- **"synced" flash not appearing**: needed `useRef` to detect the `isPending true → false` transition — without it, `useEffect` can't compare previous vs current value.

### Carry-forward items

- [ ] Prompt C — split editor bottom sheet (paidBy and beneficiaries) with equal/custom modes
- [ ] Firestore composite index needed for `date desc + createdAt desc` ordering on transactions — create when deploying
- [ ] `firestore.indexes.json` should be committed and managed via `firebase deploy --only firestore:indexes`
- [ ] Firestore security rules for `drafts` subcollection (required before v2 work)
- [ ] Settings screen: categories and payment methods management (currently always empty dropdowns)
- [ ] Move sign-out button from travels page to a proper profile/settings screen


## ✨ Working Session 005.2 — March 5th 2026

**Type**: Feature implementation
**Tools used**: Claude (claude.ai)

### What was built

**Split editor enhancements (carry-over from Session 005.1 tail):**
- `SplitEditor` mode (`equal`/`custom`) lifted to controlled prop — tab selection persists across drawer open/close
- Custom mode amounts rounded to 2dp throughout (inputs, emit, absorb chip)
- Solo travel: `TravelDetailPage` suppresses "X for you" label, shows main currency amount instead

**Three-tab layout on TravelDetailPage:**
- `TravelTabs` component with tab bar + swipe gesture (horizontal touch drag, 50px threshold)
- Three tabs: **Transactions**, **Balance** (placeholder), **Parameters**
- Transaction list extracted into `TransactionsTab` component (cleaner separation)
- Filter and Display Mode buttons as greyed placeholders with "Coming soon" tooltip

**ParametersTab — fully implemented:**
- Travel name and emoji: inline editing, auto-save on blur
- Members: placeholder
- Currencies: collapsible `CurrencyPicker` — searchable checklist of 42 currencies, persists to `travel.currencies`
- Categories: `EditableLabeledList` — add (emoji + label), inline rename on tap, delete; auto-resets add row after submit
- Payment methods: same `EditableLabeledList`
- Countries: collapsible `CountryPicker` — searchable checklist of ~110 countries with flag emojis, persists to `travel.countries`
- Cities: `EditableLabeledList` — auto-seeded from existing transactions on mount

**Data model extension (per-travel lists):**
- `Travel` type gains `categories: LabeledItem[]`, `paymentMethods: LabeledItem[]`, `countries: LabeledItem[]`, `cities: LabeledItem[]`
- `LabeledItem: { id: string, label: string, emoji?: string }` — new shared type
- `createTravel` initialises all four lists as `[]`
- `useTravels` maps all four fields with `?? []` fallback (backward compatible with old documents)
- `travelService` gains: `updateTravelMeta`, `updateTravelSettings`, `updateTravelList`, `updateTravelCurrencies`, `syncTransactionLocation`

**Smart dropdowns in TransactionForm:**
- Currency defaults to last transaction's currency (falls back to `userProfile.mainCurrency`)
- Currency dropdown: travel currencies ordered by recent use → `+ Add…` opens inline searchable picker → permanently adds to travel
- Country dropdown: travel countries ordered by recent use → `+ Add…` opens inline searchable picker with flags → permanently adds to travel
- Categories and payment methods read from per-travel lists, falling back to `userProfile` global lists
- `onLocationAdded` callback: when a new country/city is introduced via a transaction, `TravelDetailPage` updates local travel state immediately (optimistic) and `syncTransactionLocation` writes to Firestore in the background

**Shared data:**
- `src/shared/data/pickerData.ts` — 42 currencies `[code, symbol, name]` and ~110 countries `[flag, name]`, `getFlagForCountry()` helper; shared by ParametersTab and TransactionForm

### Files created

| File | Path |
|------|------|
| `TravelTabs.tsx` | `src/travels/components/TravelTabs.tsx` |
| `TransactionsTab.tsx` | `src/travels/components/tabs/TransactionsTab.tsx` |
| `BalanceTab.tsx` | `src/travels/components/tabs/BalanceTab.tsx` |
| `ParametersTab.tsx` | `src/travels/components/tabs/ParametersTab.tsx` |
| `pickerData.ts` | `src/shared/data/pickerData.ts` |

### Files modified

| File | Changes |
|------|---------|
| `TravelDetailPage.tsx` | Replaced inline transaction section with `TravelTabs`; added `handleLocationAdded`; passes new props to `TransactionForm` |
| `TransactionForm.tsx` | Smart currency/country dropdowns; `onLocationAdded` callback; reads per-travel categories/paymentMethods |
| `SplitEditor.tsx` | `mode` is now a controlled prop |
| `travels/types.ts` | Added `LabeledItem`, `categories`, `paymentMethods`, `countries`, `cities` to `Travel` |
| `travels/services/travelService.ts` | Added `updateTravelMeta`, `updateTravelCurrencies`, `updateTravelList`, `syncTransactionLocation` |
| `travels/hooks/useTravels.ts` | Maps the four new `LabeledItem[]` fields with `?? []` fallback |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 38 | Per-travel lists | `categories`, `paymentMethods`, `countries`, `cities` stored on travel document; fall back to `userProfile` globals if empty |
| 39 | `LabeledItem` type | `{ id: string, label: string, emoji?: string }` — stable id for array updates, optional emoji |
| 40 | Countries as `CountryPicker` | Replaces free-text `EditableLabeledList`; backed by static list of ~110 countries with flag emojis |
| 41 | Smart currency/country in form | Travel lists ordered by recent use; `+ Add…` adds permanently to travel |
| 42 | `syncTransactionLocation` | After transaction save, new country/city synced to travel document via `arrayUnion`; optimistic local update via `onLocationAdded` |
| 43 | Shared picker data | `src/shared/data/pickerData.ts` single source of truth for currency and country static data |

### Lessons learned / issues resolved

- **Build error: self-import** — a heredoc generation artifact added `import { TravelTabs } from '@/travels/components/TravelTabs'` inside TravelTabs itself. TypeScript TS2303 circular definition error. Always verify imports after generation.
- **`Travel` type extension breaks `useTravels`** — adding required fields to `Travel` causes TS2322 in the hook mapping. Always update hook mapping in the same step as type changes.
- **Emoji `maxLength` blocks mobile emoji** — removing `maxLength` on emoji inputs is necessary; use `Intl.Segmenter` to limit to one grapheme cluster instead.
- **Add row visual reset** — setting controlled state to `''` after `addItem()` doesn't always visually reset inputs if a parent re-render races. Fix: key the add row div on an incrementing counter (`addRowKey`) to force DOM remount.

### Carry-forward items (open)

- [ ] Minor UI polish items noted but deferred (split editor UX, form layout details)
- [ ] Balance tab: implement settlement computation (greedy debt simplification)
- [ ] Filter and Display Mode in Transactions tab (currently placeholders)
- [ ] `updateProfile` timing: Firestore user doc may be created with empty `displayName` on email/password registration — fix when building profile/settings screen
- [ ] Composite indexes should be managed via `firestore.indexes.json` in the repo
- [ ] PWA icons: still placeholder icons from scaffold
- [] Generate new versions of documentations with new updates

### Next steps (Session 006)
- [ ] Solving all issues with TransactionForm
- [ ] Edit transactions tab
- [ ] Profile Page
- [ ] Adding users to a shared travel
- [ ] Export and import to/from csv/xlsx

### Next steps (Session 007-00x)

- [ ] Balance tab: compute net balances per member, derive optimal settlements, display who owes whom
- [ ] Or: dashboard module (spending charts, totals by category)



### Small improvements ideas for the UI:
- New expense: white area at the bottom, hidding some fields (require to scroll down). Let's first finish the form with the splits.
- issue with selecting date on laptop (phone is ok)
- New country : when typing a coutry (option New), suggest from real world country and associated emoji (including faute de frappe en fonction de la distance par rapport a la bonne ecriture ?). Pensez au fait que dans de futures versions si la langue de l'app est differente, alors la liste des pays devra etre dans une autre langue
- order countries based on lastly selected in previous transaction (orderby createdAt). Same for city, but also currency.
- Select Category and Paiment method: drop list with categories/methods (ordered by what ? fixed or last occurences ?), possibility to add a new one or to let empty.
- Click on button Save in case if invalid data: show there is an issue (either label or backgounf flashing once in low opacity red)

### Misc
App has been deployed to firebase. Can be accessed from URL https://globe-expenses.web.app

next steps:
- fix minor UI issues
- manage import (from current transaction list) + export - and check it is fully export-importable
At this point, fully usable for my own usage in my travel. 
- finish the v0.1 : Edit profile, parameters, edit travel and transactions
- make a logo icon, publish v0.1 and celebrate 🎉

- in later phases, tolerate a non correct totalAmount for spliting payerby and paidfor. Show warning. If user confirms, save and send transaction. In TravelDetail all uncorrect transactions are displayed with a red label and :emojiredcross: to show it contains an error. A filter allows to only show those problematic transactions.  In dashboard, show the number of errors. In balance calculation, indicate the range of error due to uncompleteness.

## ✨ Working Session 006 — March 2026

### What was built

**Profile page** (`src/auth/pages/ProfilePage.tsx`)
- **Identity section**: display name inline edit (auto-save on blur), email display, profile avatar (hash-based color)
- **Security section**: "Change password" sends a Firebase reset email; sign out with confirmation dialog (AlertDialog)
- **Preferences section**: main currency picker (ISO 4217 selector)
- **Nametag section**: real-time availability check as you type (debounced 300ms, Firestore prefix query on `nametags/`), claim/change flow with atomic batch write — creates `nametags/{tag}` sentinel + updates `users/{uid}` in one transaction so the claim is all-or-nothing. Zustand store updated in-memory after success. Error states for taken/invalid handles.
- **Friends section**:
  - Nametag search: live prefix search, results with avatars, "Add friend" button per result; sent-request tracked in local state for immediate button feedback
  - Incoming requests: real-time list from `usePendingInvites`, each showing sender avatar + nametag + Accept / Decline buttons
  - Friends list: loaded once on mount, refreshed after each accept; shows avatar + name + nametag for each friend
  - "Share my link" button: generates a multi-use friend invite link via `createShareableInvite()`, copies to clipboard
- **Contact developer section**: collapsible card with mail / Discord / Telegram links

**Friends & invite service layer** (new module `src/friends/`):
- `friendService.ts`: `searchByNametag` (prefix query, excludes self), `createShareableInvite`, `sendFriendRequest`, `acceptFriendRequest` (atomic batch: invite + bidirectional friend entries), `declineFriendRequest`, `sendTravelInvite`, `acceptTravelInvite`, `subscribeToIncomingRequests`, `fetchFriends`
- `usePendingInvites.ts`: real-time `onSnapshot` on `invites` where `toUid == uid && status == active`; exposes `{ invites: Invite[], count: number }`
- `types.ts`: `Invite`, `Friend`, `SearchUser` interfaces
- `InvitePage.tsx`: full acceptance page for `/invite/:inviteId`. Validates invite (exists, active, not expired, not already used by this user, not own invite). Displays sender avatar + name + invite context (friend or travel name). Branches to `acceptFriendRequest` or `acceptTravelInvite` on confirm. Shows accepted state with deep-link to travel or travels list.

**Travel member invite** (via Parameters tab):
- `ParametersTab.tsx` — new `MembersSection`: displays current members with avatars and join dates. "Invite to travel" button calls `createShareableInvite(type='travel_member', travelId)` and copies the link. Reuses `InvitePage` for acceptance.
- `sendTravelInvite`: targeted invite (to a specific friend, type='travel_member')
- `acceptTravelInvite`: batch writes invite update + travel `members`/`memberUids` via `arrayUnion`. Passes `pendingInviteId` on the travel document for the Firestore rule to validate via `get()`. Friendship entries written fire-and-forget after the batch.

**Firestore security rules** — major update covering all new collections:
- `nametags/{tag}`: read = any auth user; create = claiming own UID; delete = owner; update = forbidden
- `invites/{inviteId}`: read = any auth user (token = capability); create = fromUid == self; update = not in usedBy + valid target + fromUid immutable; delete = sender
- `users/{userId}/friends/{friendId}`: read/delete = owner; create/update = owner OR self-addition (enables accepter to write into sender's list)
- `travels/{travelId}`: non-member join rule uses `pendingInviteId` + `get()` for authorization; removed unreliable `arrayUnion` checks on `request.resource.data.memberUids`

**App routing & header polish**:
- `App.tsx`: added `/invite/:inviteId` route pointing to `InvitePage`
- `TravelDetailPage` and `TravelsPage` headers: profile avatar button (hash-based color, initials) with pending-invites badge (red dot, count capped at 9+), navigates to `/profile`
- `auth/services/userService.ts`: extended `UserProfile` with optional `nametag` field; `claimNametag` + `isNametagAvailable` functions

**Transaction editing:**
- `transactionService.ts`: `updateTransaction(travelId, txId, data)` — fire-and-forget `updateDoc`; cleared optional fields (category, paymentMethod, country, city, notes) written with `deleteField()` so they are actually removed from the document rather than left stale
- `TransactionForm.tsx`: dual create/edit mode via `initialValues?: TransactionWithStatus` prop; all `useState` initialisers read from `initialValues` when editing; `detectSplitMode()` reconstructs equal/custom mode from stored split amounts; `handleSave` branches to `updateTransaction` vs `createTransaction`; title of the drawer changes to "Edit expense"
- `TransactionsTab.tsx`: rows now tappable (`cursor-pointer`, hover/active states), fires `onEditTransaction` callback on tap
- `TravelDetailPage.tsx`: `editingTx: TransactionWithStatus | null` state; `handleEditTransaction()` sets it and bumps `formKey` to force form remount; `handleTransactionSaved` skips the save banner in edit mode (transaction already live in snapshot)

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 44 | Nametag claim: atomic batch write | Delete old sentinel + create new + update user doc — all fail together |
| 45 | `deleteField()` for optional fields in updateTransaction | Clearing category/city/notes in edit mode actually removes the Firestore field |
| 46 | Unified create/edit drawer | Same Drawer + TransactionForm, mode driven by `editingTx` state and `initialValues` prop |
| 47 | No save banner for edits | Transaction already in snapshot; banner only shown for new transactions (pending→synced watch) |

### Open questions

- **`updateTravelList` conflict risk (v2)**: when adding a new category or payment method from the transaction form, the full `LabeledItem[]` array is overwritten via `updateDoc`. If two travel members add different items simultaneously while one is offline, the last sync wins and the other's item is lost. Fix in v2: use `arrayUnion` for individual item additions instead of overwriting the full array.

### Carry-forward items (open)

- [ ] CSV / XLSX export (and import)
- [ ] Balance tab: settlement computation (greedy debt simplification)
- [ ] Filter and Display Mode in Transactions tab (currently placeholders)
- [ ] PWA icons: still placeholder icons from scaffold
- [ ] Composite indexes in `firestore.indexes.json` (currently managed manually in Firebase Console)
- [ ] `updateTravelList` conflict: overwrite vs `arrayUnion` — fix in v2
- [ ] Delete transaction (swipe-to-delete or long-press context menu)

### Next steps (Session 007)

- [ ] CSV export: download all transactions for a travel as a spreadsheet
- [ ] Balance tab: per-member net balances + optimal settlement suggestions
- [ ] Delete transaction (swipe-to-delete or long-press context menu)
- [ ] PWA icons: replace scaffold placeholders


## ✨ Working Session 006.2 — March 6th 2026 (Continuation)

**Type**: Bug fixes + documentation
**Tools used**: Claude Code (claude-sonnet-4-6)

### What was fixed

**Travel invite acceptance** — three bugs prevented users from joining a travel via an invite link:

1. **Firestore rules** (`firestore.rules`): non-member join rule checked `request.resource.data.memberUids` after an `arrayUnion` write — but FieldValue transforms are not reflected in `request.resource.data` at rule evaluation time. Rule always failed. Fixed: removed the check, rely solely on the invite token validated via `get()`. Deployed.
2. **Batch isolation** (`friendService.ts`): friendship writes were inside the same batch as the core invite + travel update — a failure there aborted the whole join. Fixed: friendship writes moved outside the batch as fire-and-forget.
3. **InvitePage error state** (`InvitePage.tsx`): catch block always showed "You're already friends" regardless of actual error. Fixed: dedicated `error` state with contextual message and a "Try again" button.

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 43 | arrayUnion not reflected in request.resource.data | FieldValue transforms are evaluated after rules pass. Security rules must not check the post-transform value of an arrayUnion field. Use capability tokens (pendingInviteId + get()) instead. |
| 44 | Invite acceptance: core batch + separate friendship writes | Batch = invite update + travel update (atomic). Friendship writes = fire-and-forget outside batch (cannot abort travel join). |

### Documentation updated

- `docs/GlobeExpenses_Architecture.md` → v0.5: integrated pending appendix, added friends/invite system (Invite + Friend models, nametags collection, updated security rules section, updated flows, updated roadmap and open questions)
- `docs/GlobeExpenses_Specification.md` → v0.5: added nametag to User, updated Travel membership (invite-based join is v1), added Section 3.5 Friends & Invite System, updated Parameters tab Members section, updated Out of Scope, added 8 new decision log entries (#37–44)

### Next steps (Session 007)

- [ ] CSV export: download all transactions for a travel as a spreadsheet
- [ ] Balance tab: per-member net balances + optimal settlement suggestions
- [ ] Delete transaction
- [ ] PWA icons: replace scaffold placeholders (`public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`)
- [ ] Filter and Display Mode in Transactions tab (currently placeholders)

---

## ✨ Working Session 007 — March 7th 2026

**Type**: UI improvements
**Tools used**: Claude Code (claude-sonnet-4-6)

### What was built

- **Invite link UX**: button renamed to "Generate invite link"; generated URL displayed in a monospace box with auto-copy and manual "Copy" button; "Anyone with this link…" label only shown after generation. Applied to both travel invites (`ParametersTab`) and friend invites (`ProfilePage`).
- **PWA install banner** (`InstallPromptBanner.tsx` + `installPrompt.ts`): shown on `TravelDetailPage` and `ProfilePage`. Android Chrome → native "Install" button; Android Firefox/other → manual menu instructions; iOS Safari → "Tap Share → Add to Home Screen". Hidden when already installed or on desktop. Dismissable (localStorage). `beforeinstallprompt` captured in `main.tsx` before React renders so the component never misses it.
- **Google sign-in fix (Android PWA)**: `LoginPage` now watches `currentUser` from the auth store and navigates as soon as it becomes non-null — fixes the case where Firebase's `onAuthStateChanged` fires after a Custom Tab returns but the page never reacted. Also uses `signInWithRedirect` in standalone mode with `getRedirectResult` on mount.
- **Password eye toggle**: Eye/EyeOff button in the password field on Login and Register pages.
- **App icon & HTML meta** (`index.html`): favicon → `icon-192.png`, `apple-touch-icon` link, PWA meta tags, title → `GlobeExpenses`.

### Files created

| File | Description |
|------|-------------|
| `src/shared/components/InstallPromptBanner.tsx` | PWA install banner component |
| `src/shared/utils/installPrompt.ts` | Early-capture module for `beforeinstallprompt` event |

### Files modified

| File | Changes |
|------|---------|
| `src/main.tsx` | Side-effect import of `installPrompt.ts` before React renders |
| `src/auth/pages/LoginPage.tsx` | Eye toggle, Google redirect fix, `currentUser` watcher |
| `src/auth/pages/RegisterPage.tsx` | Eye toggle |
| `src/auth/pages/ProfilePage.tsx` | Friend invite link display + install banner |
| `src/travels/components/tabs/ParametersTab.tsx` | Travel invite link display |
| `src/travels/pages/TravelDetailPage.tsx` | Install banner |
| `index.html` | Title, favicon, apple-touch-icon, PWA meta tags |

### Carry-forward items (open)

- [ ] CSV export
- [ ] Balance tab: settlement computation
- [ ] Delete transaction
- [ ] PWA icons: still scaffold placeholders — provide `public/icon-192.png` (192×192), `public/icon-512.png` (512×512), `public/apple-touch-icon.png` (180×180)
- [ ] Filter and Display Mode in Transactions tab

---

## ✨ Working Session 008 — March 8th 2026

**Type**: Feature — xlsx import/export
**Tools used**: Claude Code (claude-sonnet-4-6)

### What was built

**xlsx Export** — `exportTravelToXlsx(travel, transactions)` runs entirely in the browser (no server). Generates a styled 5-tab workbook:

| Tab | Content |
|-----|---------|
| ⚙️ Parameters | Main currency, member slots (`Member_1`…`Member_N`), exchange rate table |
| 📃 Expenses | One row per transaction, sorted by date. VLOOKUP formulas for cost in main ccy, ✔️/✅ check columns |
| ⚖️ Balance | 2 000 pre-filled VLOOKUP rows, one 5-col block per member (cost/paid local, cost/paid main, balance) |
| 💸 Balance Summary | SUM totals per member from Balance sheet |
| 📊 Analysis | SUMPRODUCT+CHOOSE formulas for spending by country and category, member-selector cell |

Styling matches the reference template exactly:
- Dark navy `1F3864` headers with white bold text; section-specific accent colours (`1F4E79`, `375623`, `7B2D8B`, `843C0C`)
- Per-member 6-colour pastel palette cycling (`DDEBF7`, `FCE4D6`, `E2EFDA`, `FFF2CC`, `E8D5F5`, `FCE4F3`)
- Light blue `EBF3FB` for all computed/formula cells; grey `F2F2F2` for key/label cells
- Thin/medium borders, Calibri 10pt, column widths tuned to the template

Uses `xlsx-js-style` (CJS drop-in fork of SheetJS that supports writing cell styles). The community `xlsx` package is kept for parsing in import.

**xlsx Import** — 2-function API:
- `parseSheetFile(file)` — pure parse, no Firestore writes. Detects N dynamically from Parameters tab (`Member_N` pattern). Handles date formats: JS Date, Excel serial, DD/MM/YYYY string. Returns `ParseResult` with rows + active `SheetMemberSlot[]`.
- `importParsedRows(...)` — calls `createTransaction` (fire-and-forget) per valid row. Optional fields spread conditionally to avoid `undefined → Firestore` error. Reports `{ imported, skipped, errors }`.

**ImportXlsxDialog** — 3-step wizard:
1. Upload (drag-and-drop), format notice ("GlobeExpenses files only"), parse preview
2. Member mapping table: auto-match on display name, duplicate mapping blocked (red banner), skip warning (yellow banner), member count mismatch warning
3. Result: imported count, skipped count, collapsible error list per row

### Files created

| File | Description |
|------|-------------|
| `src/shared/utils/sheetColumns.ts` | `buildColumnMap(N)` + `colLetter()` shared by import and export |
| `src/shared/utils/sheetExport.ts` | `exportTravelToXlsx()` — 5-tab styled workbook generation |
| `src/shared/utils/sheetImport.ts` | `parseSheetFile()` + `importParsedRows()` |
| `src/shared/components/ImportXlsxDialog.tsx` | 3-step import wizard dialog |
| `src/components/ui/dialog.tsx` | Radix UI Dialog wrapper in shadcn style |

### Files modified

| File | Changes |
|------|---------|
| `src/travels/components/tabs/TransactionsTab.tsx` | `members` prop → `travel` prop; Export + Import buttons in toolbar |
| `src/travels/components/TravelTabs.tsx` | Passes full `travel` to `TransactionsTab` |
| `package.json` / `pnpm-lock.yaml` | Added `xlsx` (parse) + `xlsx-js-style` (styled write) |

### Key decisions

- `xlsx-js-style` used for export (style writing); `xlsx` kept for import (parse only — no dep on style fork).
- Column layout fully dynamic via `buildColumnMap(N)` — scales from N=1 to N=6+ without any hardcoded letters.
- Optional fields omitted from `createTransaction` payload using conditional spread (`...(x !== undefined && { key: x })`), not passed as `undefined` (which Firestore rejects).
- Format note in import Step 1 makes clear only GlobeExpenses-exported files are supported.

### open problem
Sheet re-import deduplication and write optimization (v1/v2)
On export, tx.txId is written into col A of the Expenses sheet instead of a sequential integer; on re-import, rows carrying a Firestore-shaped ID use setDoc(..., { merge: true }) to overwrite the existing document rather than creating a duplicate, while rows without one fall back to createTransaction. Redundant writes for unchanged rows are accepted in v1 — a pre-read diff (fetch all existing transactions, compare field by field, skip unchanged rows) is deferred to v2, where it becomes the foundation for full bidirectional sync between the app and a Google Sheets-hosted version of the standard sheet.

### Carry-forward items (open)

- [ ] Balance tab: settlement computation
- [ ] Delete transaction
- [ ] PWA icons: `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## 🐛 Bugfix Session 008.1 — March 9th 2026

**Type**: Bug fix (code only)

### What was fixed

- **Travel invite acceptance broken**: `handleAccept` in `ProfilePage.tsx` was calling `acceptFriendRequest()` for all invite types. Travel invites (`type='travel_member'`) now correctly dispatch to `acceptTravelInvite()`, which atomically writes the travel membership.
- **UI separation**: pending invites section split into "Travel invitations" (shows travel name + Join button) and "Friend requests" (unchanged).

### Files modified

| File | Changes |
|------|---------|
| `src/auth/pages/ProfilePage.tsx` | Import `acceptTravelInvite`; fix `handleAccept` dispatch; split invite UI into two sections |

---

## 🐛 Bugfix Session 008.2 — March 9th 2026

**Type**: Bug fix (code only)

### What was fixed

- **Transaction create silently failing**: `setDoc()` throws synchronously on `undefined` field values. Optional fields built as `x || undefined` in `handleSave` propagated into `createTransaction`, causing a synchronous throw that bypassed the `.catch()` handler — leaving the form open with no feedback. Fixed in `transactionService.ts` by stripping `undefined` entries from `data` before the `setDoc` call (`Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))`). `updateTransaction` was unaffected as it already uses `deleteField()`.

| File | Changes |
|------|---------|
| `src/transactions/services/transactionService.ts` | Strip `undefined` fields from `data` spread before `setDoc` call |

---

## ✨ Working Session 009 — March 11th 2026

**Type**: Feature implementation + bug fix
**Tools used**: Claude Code (claude-sonnet-4-6)

### What was built

**TravelMember refactor** — replaced the UID-based `MemberRef` model with a stable `travelMemberId`-based `TravelMember` model that decouples travel membership from Firebase Auth. Enables unclaimed (name-only) members, claim/unclaim flows, and a post-invite identity resolution screen.

**Data model changes:**
- `travels/types.ts`: removed `MemberRef`, added `TravelMember` (`travelMemberId: string`, `userId: string | null`, `allowRename: boolean`, `joinedAt`). Added `normaliseMember()` for backward-compat with legacy Firestore docs.
- `transactions/types.ts`: `Split.uid` → `Split.travelMemberId` (never a Firebase Auth UID).

**Service layer:**
- `travelService.ts`: added `serialiseMember()` helper (strips `undefined` for Firestore); `createTravel` now generates a nanoid `travelMemberId` for the creator; added `addUnclaimedMember`, `renameTravelMember`, `claimTravelMember` (transfer semantics — nulls prior slot), `unclaimTravelMember`, `setMemberAllowRename`. `memberUids` is access-control only — never modified by claim/unclaim.
- `friendService.ts`: `acceptTravelInvite` now adds a full `TravelMember` shape (with nanoid) via batch; returns `TravelInviteResult { travelId }`.

**Read path updates:**
- `useTravels.ts`, `TravelDetailPage.tsx`: `normaliseMember()` applied to all members on snapshot/fetch.

**Transaction components:**
- `SplitEditor.tsx`, `SplitSummaryRow.tsx`, `TransactionForm.tsx`: all `uid` references replaced with `travelMemberId`. `currentUserTravelMemberId` derived from `members.find(m => m.userId === currentUser.uid)`.
- `TransactionsTab.tsx`: derives `currentUserTravelMemberId` via `useMemo`; `buildPayerLabel` and `getSplitIcon` use `travelMemberId`.

**ParametersTab — MembersSection rewrite:**
- Member avatars: coloured for claimed (hue from `userId`), grey for unclaimed.
- "No slot" nudge for users in `memberUids` with no claimed slot.
- Claim / unclaim / rename / allowRename toggle / add unclaimed member UI.

**Export/Import:**
- `sheetExport.ts`: `deriveSplitLabel`, `derivePaidByLabel`, member loop — all use `travelMemberId`.
- `sheetImport.ts`: `slotToTravelMemberId` param; `beneficiaries`/`paidBy` keyed by `travelMemberId`.
- `ImportXlsxDialog.tsx`: `slotToTravelMemberId` state; `buildInitialMapping` and dropdown options use `m.travelMemberId`.

**Post-invite identity resolution screen (`InvitePage.tsx`):**
- After `acceptTravelInvite` commits the batch (user now in `memberUids`), reads the travel document to fetch unclaimed slots.
- If unclaimed slots exist, shows a "Who are you in this trip?" screen with one card per slot + "None of these — I'm a new person" option.
- Selecting a slot calls `claimTravelMember`; skipping goes straight to the accepted screen.

### Bug fixed — `acceptTravelInvite` permissions error

The original implementation did a `getDoc(travelRef)` *before* the batch write to check `memberUids` and collect unclaimed slots. This read failed with `Missing or insufficient permissions` because the user was not yet in `memberUids`. Fix: removed the pre-read entirely. The batch write goes straight through (Firestore rule uses `pendingInviteId + get()` for authorization). After the batch, `InvitePage` reads the travel — now permitted — to fetch unclaimed slots.

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 48 | `travelMemberId` as stable split key | nanoid, never changes. Decoupled from Firebase Auth UID. |
| 49 | `memberUids` is access-control only | Written on travel creation and invite acceptance only. Never touched by claim/unclaim. |
| 50 | Claim = transfer semantics | `claimTravelMember` nulls the user's previous slot before claiming new one — one slot per user enforced. |
| 51 | Post-invite identity read deferred until after batch | Pre-read would fail (not yet a member). Read after batch commit, when user is in `memberUids`. |

### Files modified

| File | Changes |
|------|---------|
| `src/travels/types.ts` | `MemberRef` → `TravelMember`, `normaliseMember()` |
| `src/transactions/types.ts` | `Split.uid` → `Split.travelMemberId` |
| `src/travels/services/travelService.ts` | `serialiseMember`, updated `createTravel`, 5 new member ops |
| `src/friends/services/friendService.ts` | `acceptTravelInvite` returns `TravelInviteResult { travelId }`, removed pre-read |
| `src/travels/hooks/useTravels.ts` | Apply `normaliseMember` on snapshot |
| `src/travels/pages/TravelDetailPage.tsx` | Apply `normaliseMember` in `fetchTravel` |
| `src/transactions/components/SplitEditor.tsx` | `travelMemberId` throughout |
| `src/transactions/components/SplitSummaryRow.tsx` | `travelMemberId` throughout |
| `src/transactions/components/TransactionForm.tsx` | `myTravelMemberId` derived from members |
| `src/travels/components/tabs/TransactionsTab.tsx` | `currentUserTravelMemberId` via `useMemo` |
| `src/travels/components/tabs/ParametersTab.tsx` | Full MembersSection rewrite |
| `src/shared/utils/sheetExport.ts` | `travelMemberId` in split derivation |
| `src/shared/utils/sheetImport.ts` | `slotToTravelMemberId` param |
| `src/shared/components/ImportXlsxDialog.tsx` | `slotToTravelMemberId` state + mapping |
| `src/friends/pages/InvitePage.tsx` | Identity pick screen, post-batch travel read |

### Carry-forward items (open)

- [ ] Balance tab: settlement computation (greedy debt simplification)
- [ ] Delete transaction
- [ ] PWA icons: `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`
