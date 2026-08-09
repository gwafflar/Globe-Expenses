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

## ✨ Working Session 009 — March 10th 2026

**Type**: Refactoring + Feature implementation
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


## ✨ Working Session 009.2 — March 10th 2026
### What was built

**Formula mode for amount encoding in `TransactionForm`:**

- **`src/shared/utils/formulaUtils.ts`**: safe arithmetic formula evaluator — no `eval()`. Implements a recursive-descent parser supporting `+`, `-`, `*`, `/`, parentheses, decimal numbers (dot and comma). Returns `null` on invalid input or division by zero. Exports `evaluateFormula(raw: string): number | null` and `isValidFormula(raw: string): boolean`.

- **`src/shared/utils/formulaUtils.test.ts`**: 16 unit tests covering basic arithmetic, operator precedence (`*` before `+`), parentheses, the real-world roti chanai example (`2*2.5 + 1.5 = 6.5`), comma as decimal separator, and all invalid input edge cases.

- **`src/transactions/components/FormulaBar.tsx`**: self-contained inline formula editor. Expands **above** the amount row when formula mode is active. Layout: operator chip row (`( ) * / + -`) → `= [text input]` → live evaluated preview. Chips insert at cursor position (not just end of string). Input auto-focuses on open. Red border + error message on invalid formula. Accepts `value`/`onChange`/`onEvaluated` props — parent receives computed number, not raw string.

- **`src/shared/components/FormulaBadge.tsx`**: small `fx` pill badge shown on transaction list items when `amountFormula` is set. Shows the raw formula in a hover tooltip (`= 2*2.5 + 1.5`).

**Changes to existing files:**

- **`src/transactions/types.ts`**: added `amountFormula?: string` to the `Transaction` interface. Optional field — display-only, never used in any computation. Non-breaking (old transactions simply lack the field).

- **`src/transactions/components/TransactionForm.tsx`**:
  - Added `formulaMode: boolean` and `formulaStr: string` state variables.
  - 🧮 toggle button inserted between amount input and currency selector. Highlighted (primary tint) when active, muted when inactive.
  - When formula mode is ON: `FormulaBar` renders above the amount row; amount input replaced by a read-only display of the evaluated result.
  - When formula mode toggled OFF: `amountStr` is pre-filled with the last evaluated result; formula bar closes.
  - `amountFormula` conditionally spread into the Firestore payload on save (omitted if empty).
  - "📷 Encode a transaction from a ticket" greyed-out placeholder button added below the amount row, with a hover tooltip: *"Coming in v2 — snap a photo of your receipt and let the AI fill in the transaction for you."*

- **`src/travels/components/tabs/TransactionsTab.tsx`**: `FormulaBadge` rendered inline next to the amount when `transaction.amountFormula` is set.

**Testing infrastructure restored:**
- Vitest was missing from the project. Installed: `vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
- Added `test` block to `vite.config.ts` (`environment: 'jsdom'`, `globals: true`).
- Added `/// <reference types="vitest" />` to top of `vite.config.ts`.
- Added `test`, `test:watch`, `test:ui` scripts to `package.json`.


---

## ✨ Working Session 010 — March 17th 2026

### What was built

**Dashboard tab — read-only analytics view inside TravelDetailPage.**

A new fourth tab "Dashboard" was added between Balance and Parameters in `TravelTabs`. All statistics are computed client-side from the `transactions` array already in memory — no new Firestore queries.

---

#### New files

**`src/travels/components/tabs/dashboardHelpers.ts`** — pure TypeScript, no React. All helper functions for the Dashboard. Pure functions only, enabling easy unit testing without a DOM environment.

Key exports:
- `PeriodFilter` discriminated union: `all | today | days:n | custom(from, to)`
- `filterTransactions(txs, period)` — returns only transactions in the active window
- `getTripDurationDays(travel, txs)` — trip length from travel dates → tx span → 30-day fallback
- `computeMemberStats(txs, travelMemberId)` — sums consumed (beneficiaries) and paid (paidBy) for a member, in main currency via `* exchangeRate`
- `normalizeTransactionSplits(txs, members)` — backward-compat: remaps pre-refactor `split.uid` → `split.travelMemberId` using the members list as lookup (see bug fix section below)
- `categoryColor(name)` / `CATEGORY_PALETTE` — deterministic 6-colour palette from a simple hash
- `formatAmount(amount, currency)` — `€ 42.50` style with symbol map
- `formatDayLabel(dateStr)` — Today / Yest. / Mar 12 (input is DD-MM-YYYY)
- `dateRangeLabel`, `numberOfDaysInRange` — hero card subtitle helpers

**`src/travels/components/CollapsibleCard.tsx`** — reusable collapsible card component with title, summary line, and chevron toggle. Used by Dashboard; designed to be reused by the Balance tab later.

**`src/travels/components/tabs/DashboardTab.tsx`** — main Dashboard component.

Props: `travel`, `transactions`, `currentUserUid`, `isSolo`.

Six cards:
1. **Hero** (always visible) — total spent (large), avg/day, focus-member stat (consumed bold + paid muted), transaction count
2. **Spending over time** (CollapsibleCard) — day-by-day bar chart using plain `div`s; always shows group totals regardless of member filter; "not enough data" fallback
3. **Recent days by category** (CollapsibleCard) — configurable look-back (1/3/7/15d presets + custom range slider capped at trip duration); per-day horizontal category bars (width ∝ amount, 160px max, colour from `categoryColor`)
4. **By category** (CollapsibleCard) — sorted category list with coloured dot, amount, and percentage; Uncategorized row always last
5. **Per person** (CollapsibleCard, hidden when `isSolo`) — member rows with avatar circle, progress bar, consumed (bold) + paid (muted); current user floats to top; highlighted amber left-border for selected member
6. **Currencies** (CollapsibleCard) — grouped by `tx.currency`, pill per currency with converted total; "≈" suffix for non-main currencies

**Controls bar** (above all cards):
- Period filter pills: All · Today · 7d · 30d · Custom. Custom opens an inline date-range panel with two `input[type="date"]` fields and an Apply button.
- Member picker button (hidden when `isSolo`): shows "👤 All" or selected member's avatar + name. Opens a vaul `Drawer` (bottom sheet) — `Sheet` component is not installed. Sheet rows: "All members" + one row per `travel.members` entry with checkmark on active selection. Selecting a row sets `selectedTravelMemberId` and closes the sheet.

Member selection (`selectedTravelMemberId: string | null`) affects: hero focus stat, category chart, recent days bars, currencies card, and the accent row in per-person card. Does **not** affect spending-over-time (always group totals).

`MemberAvatar` — small inline component (local to DashboardTab): initials circle coloured by member index via `CATEGORY_PALETTE`. Used in member picker button, sheet rows, and per-person card.

**`src/travels/components/tabs/__tests__/dashboardHelpers.test.ts`** — 19 unit tests (40 total in suite including formula tests).

Describe blocks:
- `filterTransactions` — all / today / days:7 / custom inclusive
- `getTripDurationDays` — travel dates / tx span / no data fallback
- `computeMemberStats` — consumed+paid / member not present / multi-beneficiary / exchangeRate applied
- `normalizeTransactionSplits` — same-reference when no change needed / remaps legacy uid / computeMemberStats finds paid after normalization / fallback to raw uid
- `categoryColor` — deterministic / palette variety / never out-of-palette
- `parseTxDate` — DD-MM-YYYY parsing

---

#### Modified files

| File | Changes |
|------|---------|
| `src/travels/components/TravelTabs.tsx` | Added `{ id: 'dashboard', label: 'Dashboard' }` to `TABS` (between balance and parameters); render branch for `DashboardTab` |

---

#### Bug fixed — pre-refactor split IDs producing paid=0

**Root cause:** Transactions created before the Session 009 TravelMember refactor stored splits as `{ uid: 'firebase-auth-uid', amount: X }`. `useTransactions` casts Firestore data as `Split[]` (TypeScript cast, no field transformation), so `split.travelMemberId` is `undefined` at runtime for old documents. `normaliseMember` correctly maps `uid → travelMemberId` for the member list, but splits inside transactions were never normalized. `computeMemberStats` checked `split.travelMemberId === member.travelMemberId` → `undefined === 'uid-string'` → false → `paid = 0` for all pre-refactor paidBy splits.

**Why consumed could still be non-zero:** a user whose paying transactions pre-date the refactor but whose consuming (beneficiary) splits come from newer transactions would see consumed > 0 but paid = 0.

**Fix:** `normalizeTransactionSplits(txs, members)` remaps any split where `travelMemberId` is absent but `uid` is present, using `member.userId === split.uid` as the lookup key. Applied as the first `useMemo` in `DashboardTab` before all downstream computations. Returns the same array reference when no remapping is needed (avoids unnecessary `useMemo` invalidations).

---

#### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 52 | Dashboard is client-side only | All stats computed from the in-memory `transactions` array. No new Firestore queries. |
| 53 | `travelMemberId` is the member selector key | `selectedTravelMemberId: string \| null` (not Firebase Auth UID) — matches `Split.travelMemberId` directly. |
| 54 | Spending-over-time always shows group totals | Member filter does not affect the time chart — keeps time context intact. |
| 55 | Split normalization at read time (dashboard layer) | `normalizeTransactionSplits` in DashboardTab. Not in `useTransactions` (which has no members access). Handles pre-refactor `{ uid }` splits transparently. |
| 56 | Member picker uses vaul Drawer, not Sheet | `Sheet` component not installed. Vaul `Drawer` (direction=bottom) provides equivalent bottom-sheet UX. |

---

### Carry-forward items (open)

- [ ] Balance tab: settlement computation (greedy debt simplification) — `CollapsibleCard` is ready to reuse
- [ ] Delete transaction
- [ ] PWA icons: `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## 💄 Working Session 011 — March 17th 2026

**Type**: UI transactions redesign + bug fixes
**Tools used**: Claude Web (design) + Claude Code (claude-sonnet-4-6, implementation)

### What was built

**TransactionsTab — full visual redesign** (`src/travels/components/tabs/TransactionsTab.tsx`)

Replaced the flat click-to-edit card list with a day-grouped accordion list. All sub-components live inside the single file (no new files created).

**Day-grouped structure:**
- `groupByDay()` — pure function, groups the date-desc sorted transaction list into `DayGroup[]` buckets by the `date` field (DD-MM-YYYY)
- `DayGroupHeader` — thin separator row above each day showing: formatted date (e.g. "Mar 16"), unique country flag emojis (extracted from `"🇹🇭 Thailand"` format, up to 3, deduplicated), unique city names joined with " · " (up to 3). Country display is defensive — strings without an emoji prefix (legacy entries stored as plain "Thailand") are silently skipped via a code-point check (`cp <= 0x00FF → ''`).

**Collapsed row (`TransactionRow`):**
- Category emoji + bold transaction name + `PendingBadge` (unchanged logic)
- Category label as a small pill badge
- Beneficiary avatars (group travel only): up to 3 overlapping 18×18 initials circles, deterministic colour from a 6-slot palette (`AVATAR_BG_COLORS` / `AVATAR_TEXT_COLORS`) keyed by position in `travel.members`
- Right side: primary amount (`totalAmount` + currency symbol), "your share" line (group only, shown when the user's beneficiary share ≠ full amount), converted amount in main currency (omitted when `currency === mainCurrency`)
- Clicking the row toggles the accordion. One card open at a time (`useState<string | null>` in `TransactionsTab`).

**Expanded panel (`TransactionDetail`):**
- Big amount + optional formula pill (defensive `(transaction as any).formula` read)
- Exchange rate toggle (⇄): local `rateDirection` state per card, cycles between `"1 THB = 0.026 €"` and `"1 € = 38.5 THB"`; hidden when `currency === mainCurrency`
- Arrow line `→ 11.70 €` (main currency total)
- 2-column meta grid: Category / Payment method / Country / City
- Notes section (rendered only when `transaction.notes` is non-empty)
- Paid by / Split sections (`SplitSection` shared component): avatar + name + "(you)" label + amount per entry; hidden entirely when `isSolo`
- Actions row: **Edit** button (full-width minus delete) calls `onEditTransaction(txId)`; **Delete** button (destructive, fixed width) calls `onDeleteTransaction(txId)`

**Currency helpers (exported for testing):**
- `currencySymbol(code)` — symbol map for 10 currencies, fallback to ISO code
- `formatAmount(amount, code)` — space-separated thousands, no decimals for integers, 2dp otherwise

**Props changes:**
- `onEditTransaction` signature changed from `(tx: TransactionWithStatus) => void` to `(txId: string) => void`
- Added `onDeleteTransaction: (txId: string) => void`
- Added `mainCurrency: string`

**Legacy split normalization:**
- Pre-Session 009 transactions stored splits as `{ uid: '...', amount }`. `TransactionsTab` now applies `normalizeTransactionSplits` (imported from `dashboardHelpers.ts`) as a `useMemo` before grouping, so old transactions resolve member names and avatars correctly instead of displaying `"?"`. Same approach already used by `DashboardTab`.

**Wiring (`TravelTabs.tsx`, `TravelDetailPage.tsx`):**
- `TravelTabs`: added `mainCurrency`, `onDeleteTransaction`; `onEditTransaction` type updated; all passed through to `TransactionsTab`
- `TravelDetailPage`: added `handleEditById(txId)` (looks up full tx, calls existing `handleEditTransaction`); added `handleDeleteTransaction(txId)` stub (`console.warn` — actual deletion in a follow-up); passes `mainCurrency={userProfile?.mainCurrency ?? 'EUR'}`

### Files created

| File | Description |
|------|-------------|
| `src/travels/components/tabs/__tests__/transactionsTab.test.ts` | 25 Vitest unit tests for `currencySymbol`, `formatAmount`, `groupByDay` |

### Files modified

| File | Changes |
|------|---------|
| `src/travels/components/tabs/TransactionsTab.tsx` | Full redesign — day groups, accordion, TransactionDetail, currency helpers, split normalization |
| `src/travels/components/TravelTabs.tsx` | Added `mainCurrency`, `onDeleteTransaction`; updated `onEditTransaction` type |
| `src/travels/pages/TravelDetailPage.tsx` | `handleEditById`, `handleDeleteTransaction` stub, `mainCurrency` prop |

### Small fixes applied during session

- **"native" label removed**: green `"native"` badge on transactions in the travel's main currency was removed — no information value.
- **Country emoji extraction**: `extractCountryEmoji` now returns `''` for strings that don't start with a Unicode emoji (code point ≤ U+00FF), fixing legacy country entries stored as plain names (e.g. `"Thailand"`) that were rendering as `"ThailandMalaysia"` in the day header.
- **isSolo — Paid by / Split hidden**: in solo travel, the expanded detail panel no longer renders the Paid by and Split sections (single member, no split info needed).

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 57 | Accordion replaces click-to-edit | Clicking a row expands it in-place; Edit button inside the expanded panel opens the form drawer |
| 58 | Delete button in expanded panel (no confirmation for now) | Calls `onDeleteTransaction(txId)` directly; confirmation dialog deferred to the deletion implementation session |
| 59 | `onEditTransaction` takes `txId: string` | Tab layer passes only the ID; `TravelDetailPage` does the tx lookup — cleaner interface |
| 60 | `normalizeTransactionSplits` applied in TransactionsTab | Reuses the same helper as DashboardTab; fixes "?" member display for pre-refactor transactions |

### Carry-forward items (open)

- [x] ~~Delete transaction~~ (done in commit f14f7f4, between sessions)
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## ✨ Working Session 011.2 — March 17th 2026

**Type**: Feature implementation + hidden joke
**Tools used**: Claude Code (claude-opus-4-6)

### What was built

**Balance tab — full implementation** (`src/travels/components/tabs/BalanceTab.tsx`)

Replaced the placeholder with a working balance & settlement view:

- **`src/travels/utils/balanceUtils.ts`**: two pure functions (no React, no Firebase):
  - `computeBalances(transactions, members)` → `MemberBalance[]` (net per member in main currency)
  - `computeSettlements(balances)` → `Settlement[]` (greedy debt simplification, 0.01 tolerance)
  - Uses `travelMemberId` as identity key (Session 009 refactor fully landed)
- **`src/travels/utils/balanceUtils.test.ts`**: 7 Vitest tests (2-member, 3-member restaurant example, balanced, solo, floating-point 100/3, exchange rate, settlement output)
- **Net balances section**: per-member rows with coloured avatar (deterministic palette), name, "paid X · share Y" subtitle, net amount (green/orange/muted), proportional bar
- **Settlements section**: one card per settlement with from/to avatars, names, arrow, amount
- **Copy button**: plain-text settlement summary to clipboard with "Copied!" feedback (1.5s)
- **Solo view**: upsell card ("Travelling solo?") when `isSolo`
- **Empty state**: muted message when no transactions

**Settlement currency selector** (`src/travels/components/SettlementCurrencyDrawer.tsx`)

- Dialog (popup) with searchable currency picker, exchange rate input (pre-filled via `getExchangeRate`), Apply/Reset buttons
- Settlement amounts and copy text use the selected currency and rate; net balances always in mainCurrency
- State (`settlementCurrency`, `settlementRate`) lives in `TravelDetailPage`, threaded via `TravelTabs` → `BalanceTab`
- `useEffect` resets to mainCurrency when `userProfile` loads
- Includes a satirical USD jurisdiction and Strait of Hormuz jokes (though Claude didn't get the second one)

**Static assets reorganised**

- Moved `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` from `public/` to `public/images/`
- Updated references in `index.html` and `vite.config.ts` (PWA manifest icons)
- Deleted unused `public/vite.svg` (Vite scaffold leftover, not referenced anywhere)

### Files created

| File | Description |
|------|-------------|
| `src/travels/utils/balanceUtils.ts` | Pure balance & settlement computation |
| `src/travels/utils/balanceUtils.test.ts` | 7 Vitest tests |
| `src/travels/components/SettlementCurrencyDrawer.tsx` | Settlement currency dialog |

### Files modified

| File | Changes |
|------|---------|
| `src/travels/components/tabs/BalanceTab.tsx` | Full rewrite — net balances, settlements, solo view, empty state, copy button, currency selector integration |
| `src/travels/components/TravelTabs.tsx` | Props for BalanceTab (members, isSolo, mainCurrency, travelName, settlement currency state) |
| `src/travels/pages/TravelDetailPage.tsx` | `settlementCurrency`/`settlementRate` state, reset effect, threading to TravelTabs |
| `index.html` | Icon paths updated to `/images/` |
| `vite.config.ts` | PWA manifest icon paths updated to `/images/` |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 61 | `travelMemberId` as balance identity key | Split refactor fully landed; no uid fallback needed |
| 62 | Greedy debt simplification algorithm | Sort creditors desc / debtors asc, match largest pairs, 0.01 tolerance |
| 63 | Settlement currency is UI-only | Conversion applied at display time; core computation always in mainCurrency |
| 64 | Static assets in `public/images/` | All images consolidated; `vite.svg` deleted |

### Carry-forward items (open)

- [ ] Delete transactions
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## ✨ Working Session 012.1 — March 21st 2026

### What was built
**Delete transaction** 

  - `transactionService.ts`: added
  `deleteTransaction(travelId, txId)` — fire-and-forget
  `deleteDoc`
  - `TravelDetailPage.tsx`: replaced `console.warn` stub
  with `AlertDialog` confirmation + `deleteTransaction()`
  call
  - No new Firestore rules needed — existing `allow read,
  write` on transactions subcollection already covers delete

--- 

## ✨ Working Session 012.2 — March 21st 2026

**Type**: Feature implementation
**Tools used**: Claude Code (claude-opus-4-6)

### What was built

**Travel management — leave, delete, archive, date removal**

Three new travel lifecycle operations and several UX improvements.

---

#### Leave travel (multi-user)

When a user leaves a multi-user travel:
- Their UID is removed from `memberUids` via `arrayRemove` — **revokes Firestore read/write access**
- Their member slot is **unclaimed** (`userId → null`), **NOT removed** — preserves `travelMemberId` references in existing transaction splits
- If the leaving user is the `createdBy`, the role is reassigned to a random remaining user from `memberUids`
- User is navigated back to `/travels` after leaving

**Impact on `memberUids`:** YES — `arrayRemove(uid)` revokes access. The user will no longer see the travel in their `useTravels` query.
**Impact on `members`:** slot is unclaimed (`userId → null`), NOT removed. `travelMemberId` stays intact for split integrity.

#### Delete travel (solo / last user)

When the user is the only person in `memberUids`:
- All transactions in the subcollection are batch-deleted client-side (`getDocs` + `writeBatch`)
- The travel document itself is then deleted via `deleteDoc`
- User is navigated back to `/travels`

**Known limitation (v1):** subcollection cleanup is client-side. If the client crashes mid-deletion, orphaned transaction documents may remain under the deleted travel. These are invisible (security rules check `memberUids` on the parent, which no longer exists) but still consume Firestore storage. See carry-forward items.

**Edge case — batch size:** Firestore batches are limited to 500 operations. Travels with 500+ transactions would fail. Acceptable for v1 (unlikely scenario).

#### Archive / Unarchive (per-user)

- New field `archivedByUids: string[]` on the travel document (absent on older docs, read as `[]`)
- Each user can independently archive/unarchive a travel without affecting other members
- **No impact on `memberUids` or `members`** — purely additive field

**UI:**
- **TravelsPage:** archived travels shown in a collapsible "directory-style" card (Archive icon + "Archived (N)" label). Clicking expands to show dimmed travel cards.
- **TravelDetailPage:** amber banner at top for archived travels: "This travel is archived." with an "Unarchive" link. Shows "Unarchiving..." during operation, then green confirmation banner (10 seconds).
- **ParametersTab:** "Manage travel" section at bottom with:
  - Archive/Unarchive button with loading state ("Archiving..."/"Unarchiving...") and feedback banner (10 seconds)
  - Leave/Delete button (label depends on `memberUids.length`) with confirmation dialog

#### Removed `startDate` / `endDate`

- Removed from `Travel` interface, `createTravel` service, `CreateTravelModal` form, `useTravels` hook, `TravelDetailPage` header, `TravelsPage` cards
- `getTripDurationDays()` in `dashboardHelpers.ts` simplified — only uses transaction date span now
- **Backward compatible:** existing Firestore docs with these fields are unaffected (fields simply ignored on read, no migration needed)

#### Create travel → navigate to new travel

- `createTravel()` now returns the Firestore document ID
- `CreateTravelModal` accepts `onCreated` callback
- `TravelsPage` navigates to `/travels/{newId}` after successful creation

#### "Only user" check fix

- Changed from counting `members.filter(m.userId !== null)` to using `memberUids.length`
- A user in `memberUids` who hasn't claimed a member slot still counts as a real user with access
- Creator reassignment on leave also picks from `memberUids` (not just claimed member slots)

---

### Files modified

| File | Changes |
|------|---------|
| `src/travels/types.ts` | Removed `startDate`, `endDate`. Added `archivedByUids: string[]` |
| `src/travels/services/travelService.ts` | Removed date fields from `createTravel` (now returns `string`). Added `leaveTravel()`, `deleteTravel()`, `archiveTravel()`, `unarchiveTravel()` |
| `src/travels/hooks/useTravels.ts` | Returns `{ activeTravels, archivedTravels }` instead of `travels`. Reads `archivedByUids`, removed date fields |
| `src/travels/pages/TravelsPage.tsx` | Removed date display. Added archived directory card with `Archive` icon. `onCreated` wiring for navigation |
| `src/travels/pages/TravelDetailPage.tsx` | Removed date references. Added `ArchiveBanner` component (loading + green confirmation). Reads `archivedByUids` |
| `src/travels/components/CreateTravelModal.tsx` | Removed date fields. Added `onCreated` callback prop |
| `src/travels/components/tabs/ParametersTab.tsx` | Added "Manage travel" section with archive/leave/delete buttons, confirmation dialogs, loading/feedback states |
| `src/travels/components/tabs/dashboardHelpers.ts` | Removed `startDate`/`endDate` branch from `getTripDurationDays()` |
| `src/travels/components/tabs/__tests__/dashboardHelpers.test.ts` | Updated tests: removed date-based test, added `archivedByUids` to fixture |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 65 | Leave = unclaim slot, not remove | Member slot kept with `userId: null` to preserve `travelMemberId` references in transaction splits. `memberUids` is modified (arrayRemove). |
| 66 | Delete = client-side subcollection cleanup (v1) | `getDocs` + `writeBatch` before `deleteDoc`. Cloud Function cascade deferred to v2. |
| 67 | Archive is per-user via `archivedByUids` | Each member archives independently. No impact on access or membership. Client-side filtering in `useTravels`. |
| 68 | "Only user" check uses `memberUids.length` | Not `members.filter(userId !== null).length`. A user in `memberUids` without a claimed slot still has access. |
| 69 | Creator reassignment on leave | If the leaving user is `createdBy`, reassign to a random remaining UID from `memberUids`. |
| 70 | Removed `startDate` / `endDate` from Travel | No use case in v1. Existing Firestore docs unaffected (fields ignored on read). |

### Edge cases documented

- **User leaves → re-invited later:** works fine. UID re-added to `memberUids`. Old unclaimed slot still exists; user can claim it or a new one.
- **Orphaned transactions after failed delete:** if client crashes between transaction batch delete and travel doc delete, orphaned subcollection docs are invisible (parent doc gone, security rules fail) but consume storage. Cloud Function cleanup is the proper fix (v2).
- **Batch limit:** Firestore batch max is 500 ops. Travels with 500+ transactions would fail the client-side delete. Acceptable for v1.

### Carry-forward items (open)

- [ ] **Cloud Function `onTravelDeleted`**: Firestore `onDelete` trigger on `travels/{travelId}` to cascade-delete the `transactions` subcollection server-side. Replaces the client-side `getDocs` + `writeBatch` approach. Handles crash recovery, >500 transactions, and retroactive cleanup of any orphaned subcollections. (v2)
- [ ] PWA icons: `public/images/icon-192.png`, `public/images/icon-512.png`, `public/images/apple-touch-icon.png`
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## 📝 Working Session 012.3 — March 2026

**Type**: Feature development (UI enhancements)
**Tools used**: Claude Code (claude-opus-4-6)

### What was done

#### Feature 1 — Day total in Transactions tab header

Added the sum of all transactions for each day (in main currency) to the `DayGroupHeader` component. The total is right-aligned on the same line as the date, country flags, and cities.

**Files changed:** `src/travels/components/tabs/TransactionsTab.tsx`

#### Feature 2 — Stacked horizontal bar chart in Dashboard "Recent days" card

Replaced the per-category vertical bar list with a single stacked horizontal bar per day. Each day is one line with colored segments proportional to category amounts. Overall bar width scales to the maximum day total across the window (not percentage per day). Minimum segment width of 3px ensures tiny categories remain visible.

Added interactive features:
- **Tap a segment** → info panel shows category name, date, total, and a list of that category's transactions for the clicked day (name, local amount, main currency amount).
- **Hide category** → "Hide all" button excludes the entire category from the chart; `recentMaxTotal` rescales.
- **Hide individual transaction** → eye toggle per transaction in the info panel; excluded from data and rescaling.
- **Edit transaction** → pencil icon per transaction opens the `TransactionForm` drawer (same as Transactions tab). `onEditTransaction` prop threaded from `TravelDetailPage` → `TravelTabs` → `DashboardTab`.
- **Hidden items pills** → hidden categories (with color dot) and individual transactions shown as re-show pills below the chart.

**Files changed:** `src/travels/components/tabs/DashboardTab.tsx`, `src/travels/components/TravelTabs.tsx`

#### Feature 3 — Formula display in expanded transaction card

The `amountFormula` field (raw formula string like "2*2.5 + 1.5") is now displayed in the expanded transaction detail with a 🧮 emoji prefix.

**Bug fix:** `amountFormula` was never read from Firestore in `useTransactions` — added it to the document mapping.

**Files changed:** `src/travels/components/tabs/TransactionsTab.tsx`, `src/transactions/hooks/useTransactions.ts`

#### Feature 4 — Formula mode persistence on edit

When editing a transaction that has a saved formula:
- The formula bar opens automatically (`formulaMode` initialized to `true`).
- The formula string is pre-populated from `initialValues.amountFormula`.
- Formula is now saved on update (not just create) — added `amountFormula` to `UpdateTransactionData` and the `updateDoc` call with `deleteField()` cleanup when cleared.

**Files changed:** `src/transactions/components/TransactionForm.tsx`, `src/transactions/services/transactionService.ts`

### Files changed (summary)

| File | Description |
|------|-------------|
| `src/travels/components/tabs/TransactionsTab.tsx` | `DayGroupHeader`: added `mainCurrency` prop, day total (right-aligned). `TransactionDetail`: reads `amountFormula` directly (removed defensive cast), added 🧮 prefix |
| `src/travels/components/tabs/DashboardTab.tsx` | Stacked horizontal bar chart, tap-to-inspect info panel, hide category/transaction, edit transaction, hidden items pills |
| `src/travels/components/TravelTabs.tsx` | Passed `onEditTransaction` prop to `DashboardTab` |
| `src/transactions/hooks/useTransactions.ts` | Added `amountFormula` to Firestore document mapping |
| `src/transactions/components/TransactionForm.tsx` | Initialize `formulaMode`/`formulaStr` from `initialValues.amountFormula` on edit. Moved `amountFormula` into `sharedData` (used by both create and update paths) |
| `src/transactions/services/transactionService.ts` | Added `amountFormula` to `UpdateTransactionData` type and `updateDoc` call |

### Carry-forward items (open)

- [ ] **Cloud Function `onTravelDeleted`**: cascade-delete transactions subcollection (v2)
- [ ] PWA icons (still scaffold placeholders)
- [ ] Filter and Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## 📝 Working Session 012.4 — 22 March 2026

**Type**: Feature — Dashboard drill-down
**Tools used**: Claude Code (claude-opus-4-6)

### What was done

Extended the tap-to-inspect pattern (already in "Recent days" card) to two more Dashboard cards + X- and Y-axis grid lines in two cards.

- **Spending over time (Card ②):** Clicking a day bar opens a panel listing that day's transactions grouped by category. Each category group has a "Hide all" toggle; each transaction has edit + hide buttons. Hidden items are excluded from `perDayTotals`, rescaling the bar chart.
- **By category (Card ④):** Clicking a category row opens a panel listing all transactions for that category in the selected period, with edit + hide per transaction and a "Hide all" button that removes the entire category from the chart. Percentages recalculate.

Each card maintains independent hidden sets (`hiddenSpendingTxIds` / `hiddenSpendingCategories` for Card ②, `hiddenCategoryTxIds` / `hiddenCategoryNames` for Card ④).

- **Axis grid lines:** Added Y-axis labels + horizontal dashed grid lines to Card ② and X-axis labels + vertical dashed grid lines to Card ③. Tick values are auto-computed using a 1/2/5 nice-number algorithm (~4 ticks, values like 50/100/200/500/1k). Values ≥1000 display as `Nk`.

**Files changed:** `src/travels/components/tabs/DashboardTab.tsx`

---

## ✨ Working Session 012.5 — 22 March 2026

**Type**: Feature — Transaction filter & search
**Tools used**: Claude Code (claude-opus-4-6)

### What was built

**Client-side filter & search for the Transactions tab.** All filtering operates on the in-memory transaction array — zero extra Firestore reads.

#### Filter hook (`src/transactions/hooks/useTransactionFilters.ts`)

Custom hook managing filter state, search query, and filtered output via `useMemo`.

- **7 filter dimensions**: category, currency, country, city, paymentMethod, paidBy, beneficiaries
- **Search bar**: case-insensitive substring match on transaction name + numeric amount matching (prefix)
- **Filter logic**: OR within a dimension, AND across dimensions
- **"Undefined" option**: for optional fields (category, country, city, paymentMethod), an `__undefined__` sentinel is appended when some transactions lack the field — lets users filter for "no value set"
- **Cross-filtering** (`availableOptions`): for each dimension, applies all *other* active filters, then collects which values still have matching transactions. Unavailable values are greyed out in the UI (line-through + muted). Short-circuits when no filters are active.

Extracted helper functions: `matchesDimension()`, `matchesSearch()`, `extractDimensionValues()` — reused by both the main filter and the cross-filter computation.

#### Filter panel (`src/transactions/components/FilterPanel.tsx`)

- Search bar with 🔍 icon
- Horizontal scrollable dimension chips (Category, Currency, Country, City, Payment, Paid by, For)
- Tap a chip → expands multi-select toggle buttons; unavailable values shown with line-through
- "Undefined" option styled with italic + dashed border
- Active filter badges (removable); "Undefined" badges prefixed with dimension label ("Category: Undefined")
- Result count (`12 / 45`) + "Clear all" button
- `paidBy`/`beneficiaries` hidden in solo travels; dimensions with no options hidden

#### TransactionsTab integration

- Filter toggle button replaces old disabled placeholder; shows active filter count badge
- Filter panel slides in below the toolbar
- Day-grouped list renders from the filtered array
- "No transactions match your filters" empty state with "Clear all filters" button

### Files created

| File | Description |
|------|-------------|
| `src/transactions/hooks/useTransactionFilters.ts` | Filter/search hook with cross-filtering |
| `src/transactions/components/FilterPanel.tsx` | Collapsible filter & search UI |

### Files modified

| File | Changes |
|------|-------------|
| `src/travels/components/tabs/TransactionsTab.tsx` | Replaced filter placeholder with `FilterToggleButton`; integrated `useTransactionFilters` hook and `FilterPanel`; added "no results" empty state |

### Carry-forward items (open)

- [ ] **Cloud Function `onTravelDeleted`**: cascade-delete transactions subcollection (v2)
- [ ] PWA icons (still scaffold placeholders)
- [ ] Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## ✨ Working Session 014 — 25 March 2026

**Type**: Design, planning & implementation
**Tools used**: Claude Code (claude-opus-4-6)

### Wallet Tracker — Privacy Note

Wallet data (withdrawals, adjustments, remaining balances) is stored in the shared `travels/{travelId}/transactions/` subcollection alongside regular expenses. This means all travel members can technically read each other's wallet events via Firestore.

In v1, the UI only displays each user's own wallet balances — other members' wallet data is never rendered. A disclaimer informs users of this.

In a future phase, **per-member transaction visibility** will allow marking transactions as private (`private: true`), with Firestore security rules enforcing read access to the owner only. This is a broader feature that benefits wallet events, personal notes, and any member-specific data. It requires restructuring the transactions subcollection or adding a filtered subcollection — scoped to v2.

### What was done

Implemented a per-travel wallet tracker (cash simulator) that lets users track remaining balances for any payment method. Core mechanism: transactions gain a `type` field (`'expense' | 'withdrawal' | 'adjustment'`); wallet balance is computed client-side from the existing transaction list — no new Firestore collections, rules, or indexes needed.

#### Data model changes

- `Transaction.type?: TransactionType` — optional for backward compat (`undefined` = expense)
- `Transaction.fees?: number` — withdrawal fees (same currency), deducted from wallet balance
- `Transaction.adjustmentMode?: AdjustmentMode` — `'expense'` (counts in stats) or `'balance_only'`
- `getTransactionType(tx)` canonical helper handles the `undefined` → `'expense'` fallback
- `countsAsSpending(tx)` predicate controls what appears in spending analytics

#### Wallet balance computation (`walletHelpers.ts`)

Pure functions: `computeWalletBalances()` takes full tx list + travelMemberId + pmLabelMap → returns `WalletBalance[]` per (paymentMethod, currency) pair. Only PM/currency pairs with at least one withdrawal become wallets. `computeReconciliationDiff()` computes signed difference for reconciliation.

#### New components

| File | Purpose |
|------|---------|
| `WithdrawalForm.tsx` | Simplified form for wallet top-ups (no category, country/city, splits, formula bar). Auto-sets paidBy/beneficiaries to current user. Sets `type: 'withdrawal'`. |
| `ReconciliationDialog.tsx` | Bottom-sheet for reconciling wallet balance. Shows computed remaining, input for actual, diff display, two action buttons (create expense / adjust balance only). |

#### Integration

- **TransactionsTab**: type emoji (🏧 withdrawal, ⚖️ adjustment), badge pills, fees in detail view, type filter dimension
- **DashboardTab**: `spendingTxs` memo filters non-spending transactions from all analytics; wallet balances card with per-PM remaining
- **BalanceTab**: settlement computation uses `countsAsSpending()` filter
- **TravelDetailPage**: WithdrawalForm drawer, edit routing by type (`handleEditById`)
- **FilterPanel**: Type dimension chip (📋) with Expense/Withdrawal/Adjustment options
- **useTransactionFilters**: `'type'` added to `FilterDimension` union
- **useTransactions**: reads `type`, `fees`, `adjustmentMode` from Firestore snapshot
- **transactionService**: `type`, `fees`, `adjustmentMode` in `UpdateTransactionData` with `deleteField()` fallback

#### Design decisions

- Per-travel (not cross-travel) — matches per-travel `paymentMethods: LabeledItem[]`
- Shared subcollection (privacy = UI-only, structural privacy v2)
- Adjustment sign convention: signed `paidBy.amount` (positive = wallet gains, negative = wallet loses)
- Withdrawal fees deducted from deposited amount (`totalAmount - fees`)
- XLSX export unchanged — wallet events export as regular rows; imports always create expenses

### Carry-forward items (open)

- [ ] **Cloud Function `onTravelDeleted`**: cascade-delete transactions subcollection (v2)
- [ ] PWA icons (still scaffold placeholders)
- [ ] Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`
- [ ] Unified TransactionForm with type selector (merge WithdrawalForm into TransactionForm) — prompt written, to implement next session
- [ ] Per-travel field customization (hideable/showable fields + custom data fields) — future session

---

## 💄 Working Session 014.2 — 29 March 2026

**Type**: UI refinement
**Tools used**: Claude Code (claude-opus-4-6)

### What was done

Redesigned the wallet balances card in DashboardTab and fixed day totals in TransactionsTab.

#### DashboardTab — Wallet card redesign

Replaced the flat wallet balance list with a richer interactive component:

1. **Horizontal carousel** — scrollable row of compact wallet sub-cards. Each shows PM emoji (extracted from stored string), label, remaining balance (color-coded green/red), currency. Tap to select/deselect.

2. **Drill-down detail** — when a wallet card is tapped:
   - Summary block: total deposited, total spent, adjustments
   - "Since last top-up" section: date, net amount, balance after top-up, spent since, estimated remaining
   - "Not the amount you have?" label + "Reconcile with current amount" button

3. **Top-up list** — scrollable list (max 200px) of withdrawal transactions. Default: all wallets. When a card is selected: filtered to that wallet only. Each row shows emoji, date, name, amount (green `+`), fees.

4. Removed summary line from CollapsibleCard header (redundant with carousel).

New data layer: `withdrawalTxs` memo (all user withdrawals sorted desc), `selectedWalletDetail` memo (drill-down stats including "balance after last top-up" approximation via `remaining + spentSinceLastTopup`).

#### TransactionsTab — Day total fix

Day group header totals now use `countsAsSpending()` filter — excludes withdrawals and balance-only adjustments from daily spending sums.

#### Prompt for next session

Wrote a full implementation prompt for **unified TransactionForm with type selector** (merge WithdrawalForm into TransactionForm, type-aware field visibility, designed for future per-travel field customization).

### Files modified

| File | Changes |
|------|---------|
| `src/travels/components/tabs/DashboardTab.tsx` | Wallet card: carousel + drill-down + top-up list; added `isWithdrawal` import, `selectedWalletKey` state, `withdrawalTxs` and `selectedWalletDetail` memos; emoji extraction from stored PM string |
| `src/travels/components/tabs/TransactionsTab.tsx` | Day total uses `countsAsSpending()` filter; added `countsAsSpending` import |

### Carry-forward items (open)

- [ ] **Unified TransactionForm with type selector** — prompt written (see session notes above)
- [ ] **Per-travel field customization** — hideable/showable fields + user-defined custom data fields (future)
- [ ] Cloud Function `onTravelDeleted` (v2)
- [ ] PWA icons
- [ ] Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## 🐛 Working Session 015 — March 2026

**Type**: Bug fixes — XLSX import/export pipeline
**Tools used**: Claude Web, Claude Code (CLI)

### Summary

Fixed 6 bugs in the import/export round-trip pipeline, plus 2 small UI fixes. All discovered during user testing of a 1400-row travel import.

### Fixes applied

1. **Zero-amount skip** (`sheetImport.ts`): Changed row-skip condition from `!row.totalAmount` to `row.totalAmount === null || row.totalAmount === undefined`. Zero-amount rows (cash withdrawals, transfers) are now imported correctly.

2. **Batch writes** (`sheetImport.ts`): Replaced per-row `createTransaction()` with `writeBatch` chunked at 500. 1400 rows → 3 batch commits instead of 1400 individual pending writes. Added `onProgress` callback for UI progress bar.

3. **Data preview step** (`ImportXlsxDialog.tsx`): New Step 3 of 4 between member mapping and import. Shows unique countries/cities/categories/payment methods as green (matched) or amber (new) pills. Uses `CollapsibleCard`, read-only.

4. **Date sort order** (`TransactionsTab.tsx`): Added `parseTxDate`-based sort before `groupByDay()`. Fixes lexicographic `"DD-MM-YYYY"` string sort (e.g. Jan 31 appearing after Feb 01). `createdAt` as tiebreaker within same day.

5. **Date encoding** (`sheetExport.ts`, `sheetImport.ts`): Export now writes dates as Excel serials with `z: 'DD/MM/YYYY'` numFmt (via new `dat()` helper + `dateToSerial()`). Import's `parseDate` rewritten to handle JS Date, Excel serial (epoch 1899-12-30), and DD/MM/YYYY or DD-MM-YYYY strings.

6. **Exchange rate column** (`sheetColumns.ts`, `sheetExport.ts`, `sheetImport.ts`): Added col I `Exch. rate` between Currency and Cost (main). Export writes `tx.exchangeRate` as a number. Import reads it and falls back to `getExchangeRate()` for older files. All formulas changed from `VLOOKUP(currency, rateTable)` to `amount * exchangeRate`. Fixes 100 000 VND → 100 000 EUR bug for unsupported currencies.

7. **Travel list sync on import** (`ImportXlsxDialog.tsx`): After import, new categories/countries/cities/paymentMethods/currencies are synced to the travel via `arrayUnion`. Reuses `uniqueValues()` and `matchesLabeledList()` from the preview step.

8. **Emoji spacing** (`TransactionsTab.tsx`): `DayGroupHeader` country flags joined with `' '` instead of `''`.

9. **Re-import dedup** (`sheetExport.ts`, `sheetImport.ts`, `sheetColumns.ts`): Export writes `tx.txId` in a hidden column. Import reads it and uses `doc(collection, txId)` + `batch.set(merge: true)` to update in-place instead of creating duplicates. `ImportResult` now reports `imported` (new) and `updated` (existing) separately.

### Files modified

| File | Changes |
|------|---------|
| `src/shared/utils/sheetColumns.ts` | Added `exchangeRate` (col I) and `txId` (hidden) to `ColumnMap`; shifted all downstream columns +1 |
| `src/shared/utils/sheetExport.ts` | Date cells as Excel serials with numFmt; exchange rate column; txId hidden column; formulas use `amount*rate` instead of VLOOKUP |
| `src/shared/utils/sheetImport.ts` | Zero-amount fix; batch writes with progress; `parseDate` rewrite; reads `exchangeRate` and `txId` columns; `ImportResult.updated` field |
| `src/shared/components/ImportXlsxDialog.tsx` | 4-step wizard (upload→mapping→preview→result); `PreviewStep` component; progress bar; travel list sync via `arrayUnion`; updated/imported counts |
| `src/travels/components/tabs/TransactionsTab.tsx` | `parseTxDate`-based sort before `groupByDay()`; emoji spacing fix |
| `src/shared/utils/__tests__/sheetColumns.test.ts` | New: `buildColumnMap` tests for column positions |
| `src/shared/utils/__tests__/sheetImport.test.ts` | New: `parseDate` tests (JS Date, serial, strings, edge cases) |
| `src/travels/components/tabs/__tests__/transactionsTab.test.ts` | Added cross-month and cross-year sort order tests |

### Carry-forward items (open)

- [x] **Unified TransactionForm with type selector** — implemented in Session 016
- [ ] **Per-travel field customization** — hideable/showable fields + user-defined custom data fields (future)
- [ ] **Travel list sync verification** — console log added to confirm `updateDoc` runs; remove after confirmed working
- [ ] Cloud Function `onTravelDeleted` (v2)
- [ ] PWA icons
- [ ] Display Mode in Transactions tab
- [ ] Move composite indexes to `firestore.indexes.json`

---

## ✨💄 Working Session 016 — 29–30 March 2026

**Type**: Feature + UI redesign
**Tools used**: Claude Code (CLI)

### Summary

Unified TransactionForm with 4-type selector (expense / transfer / withdrawal / adjustment), full UI redesign from Drawer to full-screen overlay, and new "transfer between participants" transaction type.

### New: Transfer type

Added `'transfer'` to `TransactionType`. Transfers represent person-to-person money movements (settlements, loans, reimbursements). Key characteristics:

- **`countsAsSpending: false`** — not included in spending analytics (totals, category breakdown, charts)
- **`affectsBalance: true`** — shifts inter-member balance (who owes whom)
- **No wallet impact** — transfers are interpersonal, not payment-method-based
- **Encoding**: `paidBy = [sender]`, `beneficiaries = [receiver(s)]`, `totalAmount = transfer amount`
- **1→many supported**: single sender, multiple receivers via standard SplitEditor

New predicate `affectsBalance()` introduced in `walletHelpers.ts`. BalanceTab now uses `affectsBalance()` instead of `countsAsSpending()` to correctly include transfers in settlement computation without counting them as spending.

### TransactionForm redesign

1. **Full-screen overlay** — replaced Drawer (bottom sheet) with `position: fixed, inset: 0` overlay. Sticky top bar (✕ / title / Save). Own scroll area.
2. **4-pill type selector** — Expense 💸 | Transfer 🤝 | Withdrawal 🏧 | Adjustment ⚖️. Switching type preserves shared field values.
3. **Declarative field visibility** — `FIELD_TYPES` config maps each field to which types show it. Single `fieldVisible(fieldName)` helper checks type + travelSettings. Future per-travel overrides layer on easily.
4. **Amount row reorder** — `[🧮 formula] [amount input] [EUR € pill]`. Formula button moved left. Currency is a prominent pill/chip (visually distinct, users can't miss it).
5. **Split section moved up** — Paid by / Split appear before optional fields (core data).
6. **Transfer split UI** — "From" single-person dropdown + "To" standard SplitEditor (reused as-is).
7. **Solo travel + transfer** — only type selector + CTA shown. All other fields and Save buttons hidden/greyed. CTA: "Save & add friends →" (saves tx, navigates to Parameters).
8. **2-column grid** for optional fields — Country+City row, Category+PaymentMethod row. Missing fields cause partner to expand full width.
9. **Close confirmation** — AlertDialog on dirty close. Edit mode: "Discard changes?" vs create: "Discard transaction?"
10. **Bottom action bar** — Save + Close buttons at bottom for thumb reach. Delete button in edit mode.
11. **Adjustment mode labels** — contextual explanation below pills ("Only corrects wallet balance…" / "Counts toward spending analytics…").
12. **Camera icon** placeholder moved from form to FAB area (greyed, v2 tooltip).

### Merged WithdrawalForm

WithdrawalForm.tsx deleted. All withdrawal behavior (fees field, auto-name, required PM, self-directed splits) handled by type-conditional logic in the unified form. TravelDetailPage routing simplified — no more `getTransactionType` dispatch to choose which form to open. `initialType` prop lets DashboardTab open the form pre-set to 'withdrawal'.

### Bug fix: createdAt null crash

`serverTimestamp()` is `null` locally for pending fire-and-forget writes. The sort in TransactionsTab crashed on `.toMillis()`. Fixed with null-safe access — pending transactions treated as "most recent".

### Files modified

| File | Changes |
|------|---------|
| `src/transactions/types.ts` | Added `'transfer'` to `TransactionType` union |
| `src/transactions/utils/walletHelpers.ts` | Added `isTransfer()`, `affectsBalance()`; updated `countsAsSpending()`; skip transfers in `computeWalletBalances()` |
| `src/transactions/components/TransactionForm.tsx` | Full rewrite: full-screen overlay, 4-type selector, declarative field visibility, transfer UI, solo CTA, close confirmation, bottom action bar, adjustment mode labels |
| `src/transactions/components/WithdrawalForm.tsx` | **Deleted** (merged into TransactionForm) |
| `src/transactions/components/FilterPanel.tsx` | Added 'Transfer' to type label map |
| `src/transactions/hooks/useTransactionFilters.ts` | Added `'transfer'` to type ordering |
| `src/travels/pages/TravelDetailPage.tsx` | Removed WithdrawalForm/Drawer; simplified edit routing; added `initialType` + `onDelete` props; camera icon on FAB |
| `src/travels/components/tabs/TransactionsTab.tsx` | Transfer emoji 🤝, purple badge, "From"/"To" labels, suppressed "your share"; null-safe `createdAt` sort |
| `src/travels/components/tabs/BalanceTab.tsx` | Switched from `countsAsSpending` to `affectsBalance` |
| `src/travels/components/tabs/DashboardTab.tsx` | Wallet card info note about transfers |

### Carry-forward items (open)

- [ ] **Per-travel field customization** — hideable/showable fields via Parameters; `FIELD_TYPES` config ready for extension
- [x] **`onNavigateToParameters` prop** — wired: `TravelDetailPage.tsx:585` passes `() => setRequestTab('parameters')`
- [ ] Cloud Function `onTravelDeleted` (v2)
- [x] PWA icons — real branded icons in `public/images/` (globe + "GlobeExpense" logo)
- [ ] Display Mode in Transactions tab — dropped from v1 (see Status Board)
- [x] Move composite indexes to `firestore.indexes.json` — 3 indexes in place covering all composite queries

---

## ♻️ Working Session 017.1 — 30 March 2026

**Type**: Architecture refactor
**Tools used**: Claude Code (CLI)

### Summary

Moved `mainCurrency` from per-user (`UserProfile.mainCurrency`) to per-travel (`Travel.mainCurrency`). Previously, each user's transactions computed `exchangeRate` and `totalAmountMain` against their own personal mainCurrency, creating inconsistent balances in multi-user travels. Now every transaction in a travel uses the same reference currency.

### Problem

- `mainCurrency` lived in `UserProfile` — in a shared travel, two users with different mainCurrency settings would store different `exchangeRate`/`totalAmountMain` values for the same transaction, making balances and analytics inconsistent.
- `DashboardTab` and sheet export already used `travel.currencies[0]` as a separate fallback, creating a second inconsistency with the rest of the app.

### Solution: per-travel mainCurrency

- **New field**: `Travel.mainCurrency?: string` (ISO 4217). Optional for backward compat with legacy docs.
- **Set at creation**: `CreateTravelModal` now has a currency dropdown (full `ALL_CURRENCIES` list from `pickerData.ts`), defaulting to the user's `UserProfile.mainCurrency`.
- **Locked after creation**: ParametersTab shows mainCurrency as read-only with "set at creation — cannot be modified" badge. Editable + batch recomputation of all transactions is deferred to v2.
- **Canonical reader**: `getTravelMainCurrency(travel)` helper in `travels/types.ts` — returns `travel.mainCurrency ?? travel.currencies[0] ?? 'EUR'`. All consumers use this.
- **UserProfile.mainCurrency retained** — only used as the default when creating new travels.

### Data flow change

```
BEFORE:  TravelDetailPage → userProfile.mainCurrency → all tabs + form
AFTER:   TravelDetailPage → getTravelMainCurrency(travel) → all tabs + form
```

All downstream consumers (TransactionForm, ReconciliationDialog, DashboardTab, BalanceTab, TransactionsTab, sheet export/import) now receive `mainCurrency` from the travel, not from the user profile.

### Currency architecture (current state for future reference)

- **Exchange rates are hardcoded** in `exchangeRates.ts`: `EXCHANGE_RATES` maps 15 currencies to EUR (e.g. `USD: 0.92` means 1 USD = 0.92 EUR). EUR is the internal pivot.
- **`getExchangeRate(from, to)`** cross-rates via EUR: `EXCHANGE_RATES[from] / EXCHANGE_RATES[to]`. Returns `1.0` for unknown currencies (safe fallback).
- **`SUPPORTED_CURRENCIES`** (15 codes) = keys of `EXCHANGE_RATES`. Used only for currencies with known rates.
- **`ALL_CURRENCIES`** (180+ entries) in `pickerData.ts` = `[code, symbol, name]` tuples. Used for UI pickers.
- **Per-transaction storage**: `currency` (ISO 4217), `exchangeRate` (rate from tx currency → travel mainCurrency), `totalAmountMain` (pre-computed `totalAmount × exchangeRate`).
- **Balance/analytics use `split.amount × tx.exchangeRate`** (recomputed from splits, not `totalAmountMain`) — this ensures per-member attribution is correct.
- **Wallet tracking** uses raw amounts per-currency (no conversion).
- **Settlement currency** is a separate display-only conversion in BalanceTab (user picks currency + rate at view time).

### v2 considerations for currency refactor

- **Editable mainCurrency**: when changed, batch-recompute `exchangeRate` + `totalAmountMain` for all transactions in the travel. Hardcoded rates make this deterministic/idempotent. Needs confirmation dialog + loading state. Firestore `writeBatch` with 500-op batching (same pattern as `deleteTravel`).
- **Live exchange rates**: replace `EXCHANGE_RATES` with an API. Would need rate-at-date storage (historical rates per transaction) and a migration from hardcoded to live.
- **ProfilePage currency picker**: the "coming soon" placeholder in Preferences section is still present. Could be wired to `updateUserProfile(uid, { mainCurrency })` — only affects default for new travel creation.

### Files modified

| File | Changes |
|------|---------|
| `src/travels/types.ts` | Added `mainCurrency?: string` to `Travel`, added `getTravelMainCurrency()` helper |
| `src/travels/services/travelService.ts` | Added `mainCurrency` to `CreateTravelInput` + `createTravel()`, seeds `currencies: [mainCurrency]` |
| `src/travels/components/CreateTravelModal.tsx` | Added currency dropdown (full `ALL_CURRENCIES` list), new `defaultMainCurrency` prop |
| `src/travels/pages/TravelsPage.tsx` | Pass `defaultMainCurrency` to `CreateTravelModal` |
| `src/travels/pages/TravelDetailPage.tsx` | Switched mainCurrency from `userProfile` to `getTravelMainCurrency(travel)`, reads field from Firestore, passes to `TransactionForm` |
| `src/travels/components/TravelTabs.tsx` | Pass `mainCurrency` to `DashboardTab` |
| `src/travels/components/tabs/DashboardTab.tsx` | Accept `mainCurrency` prop, removed local `travel.currencies[0]` computation, pass to `ReconciliationDialog` |
| `src/transactions/components/TransactionForm.tsx` | Accept `mainCurrency` prop, use for exchange rate computation + default currency |
| `src/transactions/components/ReconciliationDialog.tsx` | Accept `mainCurrency` prop instead of `userProfile.mainCurrency` |
| `src/travels/components/tabs/ParametersTab.tsx` | Read-only mainCurrency display + CurrencyPicker guard (main currency cannot be unchecked) |
| `src/shared/utils/sheetExport.ts` | Use `getTravelMainCurrency(travel)` |
| `src/shared/components/ImportXlsxDialog.tsx` | Use `getTravelMainCurrency(travel)` |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 1 | mainCurrency is per-travel, not per-user | Ensures consistent exchange rates across all members |
| 2 | Locked after creation (v1) | Editable + batch recomputation deferred to v2 |
| 3 | UserProfile.mainCurrency retained | Used as default when creating new travels |
| 4 | getTravelMainCurrency() is canonical reader | Fallback chain: mainCurrency → currencies[0] → 'EUR' |
| 5 | CurrencyPicker guards mainCurrency | Cannot uncheck the main currency from travel's currency list |

### Carry-forward items (open)

- [ ] **Editable mainCurrency (v2)** — batch recompute all transactions when changed
- [x] **ProfilePage currency picker** — implemented: full ISO 4217 dropdown wired to `updateUserProfile(uid, { mainCurrency })` with save/loading/success states
- [ ] **Live exchange rates (v2)** — replace hardcoded rates, store historical rate per transaction
- [ ] Per-travel field customization
- [ ] Cloud Function `onTravelDeleted` (v2)
- [x] PWA icons — real branded icons in `public/images/`
- [ ] Display Mode in Transactions tab — dropped from v1 (see Status Board)

---

## ♻️✨ Working Session 017.2 — 30 March 2026

**Type**: Feature — exchange rate refactor
**Tools used**: Claude Code (CLI)

### Summary

Refactored exchange rates from hardcoded-only to per-travel editable default rates with per-transaction override capability. Added same-currency balance optimization to avoid lossy round-trip conversions.

### Problem

- Exchange rates were hardcoded in `exchangeRates.ts` (15 currencies, EUR pivot). Users had no way to adjust rates to match actual rates encountered during travel.
- When settling in the transaction currency (e.g. MYR) with a different rate than was used for individual transactions, the MYR→EUR→MYR round-trip introduced distortion.

### Solution

#### 1. Per-travel `defaultRates`

- **New field**: `Travel.defaultRates?: Record<string, number>` — maps currency codes to rates relative to the travel's mainCurrency (e.g. `{ "USD": 0.92 }` means 1 USD = 0.92 mainCurrency).
- **Seeded at creation**: `buildDefaultRates(mainCurrency)` computes initial rates from the hardcoded table. All new travels start with rates for all 15 hardcoded currencies.
- **Editable in ParametersTab**: new "Exchange rates" section shows each currency in the travel's list (except mainCurrency) with editable rates in both directions (1 local = X main, 1 main = X local). Changes auto-save on blur via `updateTravelDefaultRate()`.
- **Firestore writes**: `updateTravelDefaultRate(travelId, code, rate)` uses dot-notation (`defaultRates.${code}`) for atomic single-key updates.

#### 2. `getExchangeRate()` now accepts travel rates

- Signature: `getExchangeRate(currency, mainCurrency, travelRates?)`.
- Lookup order: `travelRates[currency]` → hardcoded cross-rate → `1.0` fallback.
- All consumers updated to pass `travel.defaultRates` where available.

#### 3. Per-transaction rate override in TransactionForm

- When `currency !== mainCurrency`, a discrete rate hint appears below the amount/currency row: `1 USD = 0.92 EUR ✎`.
- Tapping it expands an inline editor with the current rate, live conversion preview, and two actions:
  - **Save as default rate** — persists the override as the travel's new default for that currency.
  - **Reset** — reverts to the travel's default rate.
- Override is stored in the transaction's `exchangeRate` field (no schema change — field already existed).

#### 4. Same-currency balance optimization

- `getSingleCurrency(transactions)` detects when all balance-affecting transactions use one currency.
- When `singleCurrency === settlementCurrency`, BalanceTab uses `computeBalancesRaw()` (no `exchangeRate` multiplication). This eliminates the lossy round-trip (e.g. all-MYR trip settling in MYR).
- `computeMemberTotals()` also supports raw mode, so paid/share subtotles are consistent.

#### 5. Downstream consumers updated

- **SettlementCurrencyDrawer**: uses `travel.defaultRates` to pre-fill the rate when selecting a settlement currency (inverts the stored rate since settlement is mainCurrency → target).
- **ReconciliationDialog**: uses `travel.defaultRates` for adjustment exchange rates.
- **XLSX export**: rate table on Parameters sheet now reflects `travel.defaultRates` (with hardcoded fallback for currencies not in the travel's rates).
- **XLSX import**: unchanged — uses rate from sheet (locked at export time), falls back to hardcoded. This is correct: imported transactions should keep their original rates.

### Data flow

```
Hardcoded EXCHANGE_RATES (EUR pivot)
    ↓ buildDefaultRates(mainCurrency) at travel creation
Travel.defaultRates (per-travel, user-editable)
    ↓ getExchangeRate(currency, mainCurrency, travelRates)
TransactionForm: shows rate, allows override
    ↓
Transaction.exchangeRate (locked per-transaction)
    ↓
Balance/Dashboard/Export (consumed as before)
    ↓ (optimization)
BalanceTab: raw-amount path when singleCurrency === settlementCurrency
```

### Files modified

| File | Changes |
|------|---------|
| `src/travels/types.ts` | Added `defaultRates?: Record<string, number>` to Travel |
| `src/shared/utils/exchangeRates.ts` | `getExchangeRate()` now accepts `travelRates?` param; added `buildDefaultRates()` |
| `src/travels/services/travelService.ts` | Added `updateTravelDefaultRate()`, seed `defaultRates` in `createTravel()` |
| `src/travels/hooks/useTravels.ts` | Read `mainCurrency` and `defaultRates` from Firestore |
| `src/travels/pages/TravelDetailPage.tsx` | Read `defaultRates` from Firestore, pass to TransactionForm with callback |
| `src/travels/components/tabs/ParametersTab.tsx` | New `ExchangeRateRow` component, new "Exchange rates" section |
| `src/transactions/components/TransactionForm.tsx` | Exchange rate display + override UI, `defaultRates` prop, "save as default" |
| `src/travels/utils/balanceUtils.ts` | Added `computeBalancesRaw()`, `getSingleCurrency()` |
| `src/travels/components/tabs/BalanceTab.tsx` | Same-currency optimization, `defaultRates` prop passthrough |
| `src/travels/components/TravelTabs.tsx` | Pass `travel.defaultRates` to BalanceTab |
| `src/travels/components/SettlementCurrencyDrawer.tsx` | `defaultRates` prop, use travel rates for pre-fill |
| `src/transactions/components/ReconciliationDialog.tsx` | `defaultRates` prop, use travel rates for adjustments |
| `src/travels/components/tabs/DashboardTab.tsx` | Pass `travel.defaultRates` to ReconciliationDialog |
| `src/shared/utils/sheetExport.ts` | Rate table uses `travel.defaultRates` with hardcoded fallback |

### Decisions made (binding)

| # | Decision | Notes |
|---|----------|-------|
| 1 | defaultRates stored per-travel | Seeded from hardcoded, user-editable, independent per travel |
| 2 | Rates stored as "1 currency = X mainCurrency" | Same convention as hardcoded table; invertible for display |
| 3 | Per-transaction override via existing exchangeRate field | No schema change needed |
| 4 | "Save as default" is opt-in | User must explicitly click to persist override as new default |
| 5 | Editing default rate only affects future transactions | Past transactions keep their locked rate |
| 6 | Same-currency optimization uses raw amounts | Avoids lossy MYR→EUR→MYR round-trip when settling in tx currency |
| 7 | Import keeps using sheet rates + hardcoded fallback | Imported transactions should preserve original rates |

### v2 items (structured roadmap)

1. **Live exchange rates — global shared table**
   - New Firestore document `config/exchangeRates` containing daily rates for all currencies (EUR pivot).
   - Updated by a Cloud Function on a daily schedule via a free API (e.g. frankfurter.app).
   - Readable by all authenticated users (no per-travel duplication).
   - **Rate priority chain**: `tx.exchangeRate` (locked per-transaction) → `travel.defaultRates` (user-edited overrides) → global live rates → hardcoded `EXCHANGE_RATES` (offline fallback).
   - `getExchangeRate()` gains a 4th source: `getExchangeRate(from, to, travelRates?, globalRates?)`.
   - Optional per-travel toggle: auto-sync `defaultRates` from global table (overwrite travel defaults with latest global rates on travel open or periodically). When disabled, user's manual rates are preserved.

2. **Per-currency balance tracking** — full `Map<member, Map<currency, amount>>` for accurate settlement in any currency regardless of currency mix. Replaces the current single-currency optimization.
3. **Payment-method-specific rates** — `PaymentMethod.defaultRate?: number` override. Rules: cash = last withdrawal rate, card = card-specific rate.
4. **Editable mainCurrency** — batch recompute all transactions when changed.

### Carry-forward items (open)

- [ ] **Editable mainCurrency (v2)** — batch recompute all transactions when changed
- [x] **ProfilePage currency picker** — implemented (full ISO 4217 dropdown wired to `updateUserProfile`)
- [ ] **Live exchange rates (v2)** — global `config/exchangeRates` doc + Cloud Function + auto-sync toggle
- [ ] **Per-currency balance tracking (v2)** — full multi-currency balance map
- [ ] **Payment-method-specific rates (v2)** — cash/card rate rules
- [ ] Per-travel field customization
- [ ] Cloud Function `onTravelDeleted` (v2)
- [x] PWA icons — real branded icons in `public/images/`
- [ ] Display Mode in Transactions tab — dropped from v1 (see Status Board)


---

## 📝 Working Session 018.1 — 31 March 2026

**Type**: Feature implementation
**Tools used**: Claude Code (claude-code CLI)

### What was done

- **Welcome page (`/welcome`)**: new landing page for unauthenticated users, replacing `/login` as the default entry point.
  - App branding with `icon-512.png`, tagline, 3 action buttons (Sign in, Continue with Google, Create an account).
  - Google "G" color logo (inline SVG) on the Google button.
  - 6 feature highlights in a responsive grid (2 cols mobile, 3 cols wider screens): multi-currency travels, split with friends, cash tracker, works offline, in-depth statistics, open-source & free (with GitHub link).
  - Auto-redirects authenticated users to `/travels`. Forwards `?redirect=` params to login/register.
- **ProtectedRoute** now redirects to `/welcome` instead of `/login`.
- **Register page validation**: client-side field validation with inline red error labels and red input borders. Helper text on display name ("Can be changed later") and password (no password-reset warning). Browser native `type="email"` validation replaced with `type="text" inputMode="email"` so custom errors appear instead of browser tooltip.
- **Login & Register pages**: added "← Back to Welcome" link at the bottom.
- **4 pre-existing TS build errors fixed**: ProfilePage `userProfile` non-null assertion, TransactionForm unused variables, TravelDetailPage `requestTab` union type.

### Files changed

| File | Change |
|------|--------|
| `src/auth/pages/WelcomePage.tsx` | **New** — welcome/landing page |
| `src/App.tsx` | Added `/welcome` route |
| `src/auth/components/ProtectedRoute.tsx` | Redirect to `/welcome` instead of `/login` |
| `src/auth/pages/LoginPage.tsx` | Added back-to-welcome link |
| `src/auth/pages/RegisterPage.tsx` | Client-side validation, helper text, back-to-welcome link |
| `src/auth/pages/ProfilePage.tsx` | Fix TS error (non-null assertion on `userProfile`) |
| `src/transactions/components/TransactionForm.tsx` | Fix TS errors (unused variables) |
| `src/travels/pages/TravelDetailPage.tsx` | Fix TS error (`requestTab` union type) |

## 📝 Working Session 018.2 — 31 March 2026
Tried to fix Google OAuth on PWA
Failed - Code stashed
---

## 📝 Working Session 018.3 — 31 March 2026

**Type**: Feature implementation
**Tools used**: Claude Code (claude-code CLI)

### What was built

**In-app beta feedback form** — allows beta users to submit feedback directly from the app.

### Components created

| File | Description |
|------|-------------|
| `src/feedback/services/feedbackService.ts` | `submitFeedback()` — writes to Firestore `/feedback/{id}`. Accepts authenticated and anonymous users. Awaited (not fire-and-forget) so UI can show success/failure. Image upload code commented out pending Firebase Storage setup. |
| `src/feedback/components/FeedbackForm.tsx` | Reusable form: bilingual label (EN/FR), textarea, send button with loading spinner, success animation. Includes collapsible "Contact developer" card (Discord + GitHub links + "Made with 💜" footer). Image picker commented out. |
| `src/feedback/components/BetaBanner.tsx` | Amber bilingual banner ("Beta — Your feedback is welcome!"). Clicking opens a Dialog with FeedbackForm. |

### Integration points

- **ProtectedRoute** — BetaBanner above `<Outlet />` (visible on all authenticated pages)
- **WelcomePage** — BetaBanner at top + embedded FeedbackForm section at bottom
- **ProfilePage** — Embedded FeedbackForm in "Feedback" section (replaced standalone "Contact developer" card)
- **ParametersTab** — Embedded FeedbackForm before "Manage travel" section

### Other changes

- `src/services/firebase.ts` — Firebase Storage import commented out (pending Storage bucket setup)
- `src/auth/pages/ProfilePage.tsx` — Removed standalone "Contact developer" section (now inside FeedbackForm)
- `vite.config.ts` — Fixed pre-existing missing comma after manifest object (line 39)

### Firestore data model

```
/feedback/{feedbackId}
  - userId: string          // Auth UID or 'anonymous'
  - displayName: string     // User name or 'Anonymous'
  - text: string
  - source: string          // 'ProfilePage' | 'ParametersTab' | 'WelcomePage' | 'BetaBanner'
  - userAgent: string
  - createdAt: serverTimestamp
  - imageUrl?: string       // (future, when Storage is configured)
```

### Firestore security rule required

```
match /feedback/{feedbackId} {
  allow create: if true;    // allows anonymous feedback from WelcomePage
}
```

### Decisions made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Anonymous feedback allowed | Users who can't authenticate should still be able to report issues |
| 2 | Image upload deferred | Firebase Storage free tier requires US region; project Firestore is in Europe. Bucket creation fails. Code is commented out, ready to uncomment. |
| 3 | `setDoc` awaited (not fire-and-forget) | Unlike transactions, feedback needs success/failure shown to the user |
| 4 | BetaBanner opens Dialog (not scroll-to) | Form is only embedded on 3 pages but banner is on all pages — dialog works everywhere |
| 5 | Contact developer card inside FeedbackForm | Single source of truth, visible everywhere the form appears |

### Deferred / v2

- [ ] Image upload — enable when Firebase Storage bucket is configured (all code commented out, ready)
- [ ] 5 MB limit + image/* MIME enforcement (client-side + Storage rules)
- [ ] Firebase Storage security rules (authenticated, size limit, content type)


---

## 📝 Working Session 018.4 — 31 March 2026

**Type**: Feature implementation + UX improvements
**Tools used**: Claude Code (claude-code CLI)
**Commits**: `e340cbe`

### What was built

**Settlement buttons in BalanceTab**
- "Mark as paid" button on each suggested settlement opens `TransactionForm` in transfer mode, pre-filled with amount, currency, sender, and receiver.
- General "Add a settlement" button at the bottom opens a blank transfer form.

**UX improvements**
- **Loading screen**: 2-second delayed amber banner with `WifiOff` icon — advises users on flaky connections to try airplane mode to load cached data.
- **Travel header**: emoji + name area is now tappable (navigates to Parameters tab) with a subtle opacity hover effect.

### Files changed

| File | Change |
|------|--------|
| `src/transactions/components/TransactionForm.tsx` | Accept pre-filled `initialValues` for transfer mode |
| `src/travels/components/tabs/BalanceTab.tsx` | Settlement buttons with pre-fill, "Add settlement" CTA |
| `src/travels/pages/TravelDetailPage.tsx` | Loading banner (delayed 2s), tappable header |
| `src/travels/components/TravelTabs.tsx` | Minor tab wiring updates |

---

## 📝 Working Session 019 — 1 April 2026

**Type**: Feature implementation + UX improvements
**Tools used**: Claude Code (claude-code CLI)
**Commits**: `4066c26`, `da8ab86`

### What was built

#### Google OAuth UX improvements (`4066c26`)

- **`GoogleLogo.tsx`** (new): shared Google "G" SVG component used across all 3 auth pages.
- **RegisterPage**: added "Continue with Google" button (now consistent across Welcome, Login, Register).
- **Post-login redirect fix**: removed immediate `navigate()` call; redirect is now handled by `useEffect` watching auth state, preventing a bounce.
- **`GooglePwaHint.tsx`** (new): sessionStorage-persisted help box for users experiencing Google sign-in issues in PWA mode. Shows copy-link button + inline feedback form. Survives the OAuth redirect round-trip via sessionStorage flag.

#### Welcome page onboarding steps + PWA installation guide (`da8ab86`)

- **"Empower your travel in just 5 steps"** section with color-coded step cards:
  - Steps 1–3 required (account → travel → transactions)
  - Step 4 (add friends) visually marked as optional
  - Step 5 shows two outcomes: track spending + see friends' debt
  - Discrete gradient separators between sections
- **PWA installation banner**: multi-platform support (Android, iOS, Windows, macOS, Linux). Collapsible "Know More" tutorial with detailed per-platform installation instructions.

### Files changed

| File | Change |
|------|--------|
| `src/auth/components/GoogleLogo.tsx` | **New** — shared Google "G" SVG |
| `src/auth/components/GooglePwaHint.tsx` | **New** — sessionStorage-persisted PWA hint box |
| `src/auth/pages/LoginPage.tsx` | Use `GoogleLogo`, fix redirect bounce |
| `src/auth/pages/RegisterPage.tsx` | Add Google button, use `GoogleLogo` |
| `src/auth/pages/WelcomePage.tsx` | Onboarding steps section, PWA install banner |
| `src/travels/components/tabs/ParametersTab.tsx` | Minor fixes |
| `src/travels/components/tabs/TransactionsTab.tsx` | Minor fixes |
| `src/travels/pages/TravelDetailPage.tsx` | Minor fixes |
| `src/travels/pages/TravelsPage.tsx` | Minor fix |
| `src/feedback/components/FeedbackForm.tsx` | Minor fix |

---

## 📋 Carry-Forward Status Board — 5 April 2026

> Consolidated verification of all carry-forward items across sessions 003–019.
> Each item code-verified. Items resolved but never explicitly marked done are noted.

### ✅ Resolved — implicitly or never explicitly closed

| Item | First raised | Resolution |
|------|-------------|------------|
| Balance tab settlement computation | Session 007 | Session 011.2 — `balanceUtils.ts`, full BalanceTab rewrite |
| Delete transaction | Session 007 | Session 012.1 + commit `f14f7f4` — `deleteTransaction()` fire-and-forget + AlertDialog confirmation |
| Transaction filter (7 dimensions + search) | Session 007 | Session 012.5 — `useTransactionFilters.ts` + `FilterPanel.tsx` |
| Unified TransactionForm + type selector | Session 014 | Session 016 — full-screen overlay, 4-type selector, `FIELD_TYPES` config, `WithdrawalForm.tsx` deleted |
| PWA icons | Session 003 | Done at some point (no explicit session note). `public/images/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` are real branded icons (globe + "GlobeExpense" logo). |
| `onNavigateToParameters` prop | Session 016 | Done without session note. `TravelDetailPage.tsx:585` passes `onNavigateToParameters={() => setRequestTab('parameters')}`. Solo-travel CTA correctly redirects. |
| ProfilePage currency picker | Session 017.1 | Done without session note. `ProfilePage.tsx` has a full currency dropdown (lines 118–513) wired to `updateUserProfile(uid, { mainCurrency })` with save/loading state. |
| Composite indexes in `firestore.indexes.json` | Session 007 | Done without session note. File contains 3 composite indexes covering all composite queries: `transactions (date↓, createdAt↓)`, `travels (memberUids contains, createdAt↓)`, `invites (toUid, status, createdAt↓)`. |

### 🔴 Still open — v1

#### 1. Display Mode in Transactions tab — dropped from v1, moved to v2
**Location:** `TransactionsTab.tsx:800` — `<PlaceholderButton label="⊞ Display" />` (placeholder kept as visual affordance)  
**Status:** The day-grouped accordion layout introduced in Session 011 (with inline expanded detail, split summary, edit/delete actions) satisfies the core need that Display Mode was meant to address. No additional layout toggle is desired for v1.  
**v2 scope (if ever):** Could allow grouping by category, by person, or a compact/dense list mode for power users. Would need a UX spec before implementation. Not a priority.

#### ~~2. Travel list sync debug log~~ ✅ Fixed
`console.log('[ImportXlsxDialog] syncing travel lists:', ...)` removed from `ImportXlsxDialog.tsx`. Error log (`console.error`) retained.

### 🟡 Still open — v2

#### 3. Cloud Function `onTravelDeleted`
**What:** Firestore `onDelete` trigger on `travels/{travelId}` that cascade-deletes the `transactions/` subcollection server-side.  
**Why needed:** The current client-side approach (`getDocs` + `writeBatch` in `deleteTravel()`) has two known failure modes: (a) if the client crashes between the transaction batch delete and `deleteDoc` on the travel, orphaned transaction documents remain in Firestore consuming storage (invisible since security rules check `memberUids` on the now-deleted parent); (b) travels with 500+ transactions exceed Firestore batch limit and the delete fails silently.  
**Scope:** Cloud Functions, requires `firebase-functions` package + deploy.

#### 4. Editable `mainCurrency` + batch recompute
**What:** Allow changing `travel.mainCurrency` after creation. When changed, recompute `exchangeRate` and `totalAmountMain` for every transaction in the travel using the new rate.  
**Why locked:** A batch recompute touching every transaction is a destructive operation. Needs a confirmation dialog, a loading state, and `writeBatch` calls chunked at 500 ops (same pattern as `deleteTravel`). With hardcoded rates, the recompute is deterministic and idempotent — so the operation is safe.  
**Impact:** `ParametersTab` shows mainCurrency as read-only with "set at creation" badge. `getTravelMainCurrency()` is already the canonical reader.

#### 5. Live exchange rates
**What:** Replace the hardcoded `EXCHANGE_RATES` table with daily rates fetched from a free API (e.g. `frankfurter.app`). Stored in a shared Firestore document `config/exchangeRates` updated by a Cloud Function on a daily schedule.  
**Rate priority chain (designed):** `tx.exchangeRate` (locked per-transaction) → `travel.defaultRates` (user edits) → global live rates → hardcoded fallback.  
**Optional toggle:** per-travel auto-sync of `defaultRates` from the global table.  
**`getExchangeRate()` signature** would gain a 4th param: `getExchangeRate(from, to, travelRates?, globalRates?)`.

#### 6. Per-currency balance tracking
**What:** Replace the current single-mainCurrency balance computation with a full `Map<travelMemberId, Map<currency, amount>>`. Would allow precise settlement in any currency for mixed-currency travels (e.g. a trip that mixes EUR, MYR, and THB transactions).  
**Current state:** The same-currency optimization (`getSingleCurrency` + `computeBalancesRaw`) partially addresses this for the common case where all transactions share one currency. The full multi-currency map is needed for the general case.  
**Replaces:** The same-currency optimization becomes a special case of the general solution.

#### 7. Payment-method-specific exchange rates
**What:** Allow per-payment-method rate overrides. Rules: cash wallet = last withdrawal's exchange rate; card = card-specific configured rate.  
**Motivation:** Cash transactions and card transactions often use different rates. A cash EUR→MYR withdrawal at the airport exchange desk has a worse rate than a card payment. Tracking them separately gives more accurate analytics.

#### 8. Per-member transaction privacy (wallet data)
**What:** Add `private: boolean` field to transactions. Firestore security rules enforce that only the owner can read private transactions. Wallet events (withdrawals, adjustments) are the primary use case.  
**Current state (v1):** All travel members can technically read each other's wallet events via Firestore. UI only renders each user's own wallet balances. A disclaimer is shown.  
**Requires:** Restructuring the transactions subcollection or adding a per-member filtered subcollection. Significant security rule change.

#### 9. Per-travel field customization
**What:** Allow hiding/showing fields in the transaction form on a per-travel basis (e.g. disable country/city for a city trip, hide payment method if not relevant). Potentially also user-defined custom data fields.  
**Current state:** `FIELD_TYPES` config in `TransactionForm.tsx` already maps each field to which transaction types show it — it's designed to accept per-travel overrides as a third condition. The `travel.settings.trackLocation: boolean` field already controls country/city visibility.  
**What remains:** Expose the controls in ParametersTab UI. Define which fields are customizable. Decide on data model for custom fields.

### 🔵 Deferred — external dependency

#### 10. Image upload in Feedback form
**What:** Allow users to attach a screenshot to their feedback submission.  
**Blocked by:** Firebase Storage bucket setup. The project's Firestore is in the EU region; Firebase Storage free tier (Spark plan) requires the US region. Creating a Storage bucket fails.  
**Current state:** All code is written and commented out in `feedbackService.ts` and `FeedbackForm.tsx`. Ready to uncomment once a Storage bucket is available (paid plan or region change).  
**Required when unblocked:** Firebase Storage security rules (authenticated, 5 MB limit, `image/*` MIME type).

---

## 📝 Working Session 020 — 24 July 2026

**Type**: Review + bug fix + tests (retroactively closes out unlogged prior work)
**Tools used**: Claude Code (claude-code CLI)
**Commit**: `9a26868`

### Context

At session start, the working tree had a substantial, uncommitted members/invites overhaul sitting on top of commit `85aead1` (5 April 2026) — `MEMBERS_SYSTEM_ANALYSIS.md` and `MEMBERS_UX_SPEC.md` (self-labeled "Session 019" inside the spec, but distinct from the logged Session 019 above, which only covered Google OAuth + the welcome page). That members session was never committed or logged. This session reviewed it, found and fixed one remaining gap, added tests, and committed everything together.

### What was reviewed (built in the prior, unlogged session)

**`ParametersTab.tsx` — Members section overhaul**, per `MEMBERS_UX_SPEC.md`:
- "🎯 This is me" / "❌ This is not me" claim/unlink language, replacing ambiguous claim/unclaim buttons
- Rename lock (`canRename()`): a member can lock their own name against edits by others; creator cannot override another member's lock (closes Analysis Issue #5)
- Solo-travel simplified UI: "Members: You" + an educational callout, no claim/rename clutter until a second member exists
- Unified 4-tab "Add member" modal (`AddMemberModal`): add by name, invite a friend, invite by @username (new), generate shareable link
- **Member merge/reconciliation tool**: select two duplicate slots → confirm which to keep → `mergeMembers()` rewrites `paidBy`/`beneficiaries` across every transaction and reassigns `createdBy` if needed, in one Firestore batch
- "This is not me" modal: forces a choice (claim another unclaimed slot, or create + claim a new one) — no zero-slot state possible

**`InvitePage.tsx`**: the post-accept identity-pick screen gained an inline "I'm someone new — add me with a name" option (`handleCreateAndClaim`), creating and auto-claiming a new slot without leaving the page.

**`travelService.ts`**: new `mergeMembers(travelId, keepId, deleteId, currentMembers, currentCreatedBy)` — see above.

**Minor cleanups bundled in the same working tree**: stray `console.log` removed from `ImportXlsxDialog.tsx`; a flagged inline comment left on `avatarHue()` in `TravelDetailPage.tsx` (`// why the f*ck did claude put this here?? to clean later`) — noted but not addressed this session.

### What was found missing and fixed this session

**Duplicate member slot on re-accepted invites** (Analysis Issues #1 and #6, `MEMBERS_SYSTEM_ANALYSIS.md`): `acceptTravelInvite()` in `friendService.ts` always `arrayUnion`'d a brand-new `TravelMember` into `members[]`, with no check for whether the accepter was already in `memberUids`. Re-clicking an invite link, or receiving a targeted invite after already being a member some other way, silently created a second, duplicate slot for the same person — the exact bug the new merge tool exists to clean up after the fact, but the root cause was still live.

**Fix**: `acceptTravelInvite()` now pre-reads the travel document before building the batch.
- Read **denied** (permission error) → the Firestore rule only allows travel reads once `auth.uid` is in `memberUids`, so denial means a genuinely new member → unchanged behavior, creates a new slot.
- Read **succeeds** and `memberUids` already contains the uid → skip the `members`/`memberUids` arrayUnion entirely; only mark the invite as used.
- `TravelInviteResult` gained `alreadyMember: boolean`; `InvitePage.handleAccept()` uses it to skip straight to the "accepted" screen instead of re-reading the travel and showing identity-pick (nothing new was created to claim).

### Tests added

- `src/travels/services/travelService.test.ts` (9 tests) — `mergeMembers()` split-rewriting logic: rename-only case, sum-both-present case, untouched-third-member case, no-op when neither id present, only rewriting the affected side (`paidBy` vs `beneficiaries`), multiple transactions in one batch, `members[]` filtering, `createdBy` reassignment (both branches), single batch commit.
- `src/friends/services/friendService.test.ts` (8 tests) — `acceptTravelInvite()` dedup branch: new-member path, already-member path, invite still marked used either way, friendship writes still fire either way, defensive edge case (read succeeds but uid not actually in `memberUids`), missing `travelId` throws, single batch commit.
- Both suites mock `firebase/firestore` (via `vi.hoisted()`, required because `vi.mock()` factories are hoisted above normal `const` declarations) rather than hitting live Firestore.
- Full suite: 180/180 passing. `tsc --noEmit` and `eslint` clean.

### Files changed

| File | Change |
|------|--------|
| `src/travels/components/tabs/ParametersTab.tsx` | Members section overhaul (see above) — from the prior unlogged session |
| `src/friends/pages/InvitePage.tsx` | Inline create-and-claim on identity pick (prior session) + `alreadyMember` handling (this session) |
| `src/travels/services/travelService.ts` | New `mergeMembers()` (prior session) |
| `src/friends/services/friendService.ts` | `acceptTravelInvite()` dedup fix (this session) |
| `src/shared/components/ImportXlsxDialog.tsx` | Removed stray `console.log` (prior session) |
| `src/travels/pages/TravelDetailPage.tsx` | Flagged but unresolved comment on `avatarHue()` (prior session) |
| `src/travels/services/travelService.test.ts` | **New** — `mergeMembers()` tests (this session) |
| `src/friends/services/friendService.test.ts` | **New** — `acceptTravelInvite()` dedup tests (this session) |
| `docs/MEMBERS_SYSTEM_ANALYSIS.md` | **New** — moved from repo root to `docs/` before commit |
| `docs/MEMBERS_UX_SPEC.md` | **New** — moved from repo root to `docs/` before commit |
| `.gitignore` | Added `docs/Audit report.md` and `docs/scale-up cost analysis.md` — unrelated local working docs, not meant for the repo |

### Not done / still open

- **Friend-vs-travel-invite visual distinction** (Analysis Issue #3): no changes made — still no special UI treatment when a travel invite arrives from someone already a friend.
- **`avatarHue()` comment in `TravelDetailPage.tsx`** flagged but not investigated — the function itself looks fine (deterministic hue from a UID for avatar coloring); the comment just questions why it's placed where it is.
- Component-level tests for `ParametersTab.tsx` / `InvitePage.tsx` UI flows (merge modal steps, claim/unclaim buttons) were not written — no existing React Testing Library harness in this repo to build on; flagged for a future session if wanted.
- `.gitignore` change and the two newly-ignored docs were not yet committed as of this log entry (pending user confirmation) — commit separately, and do not add those files to git even if `git add -A` is used elsewhere.
- Local branch is 5 commits ahead of `origin/main`, not yet pushed.

## 🐛 Working Session 021 — 24 July 2026

**Type**: Currency/exchange-rate audit + critical bug fix + tests
**Tools used**: Claude Code (claude-code CLI)

### Context

User asked for a full analysis of how currencies/exchange rates are managed (docs vs. actual code, every UI touchpoint), followed by a proposal for improvements — analysis only, no code changes yet. Doc coverage of the layered rate system (hardcoded table → travel `defaultRates` → per-transaction override) turned out to be accurate. Four smaller gaps were found and approved for immediate fixing ("Tier 1", items 1–3; item 4 — defaulting new users to a locale-derived currency instead of hardcoded `'EUR'` — explicitly declined, keep as-is).

### Critical finding (surfaced mid-implementation, not part of the original Tier 1 list)

While fixing Tier 1 item 1 (a `pickerData.ts` currency missing from `exchangeRates.ts`), re-deriving the correct value exposed that **`getExchangeRate()`'s hardcoded-table fallback and `buildDefaultRates()` were computing the reciprocal of the correct cross-rate** — i.e. backwards.

`EXCHANGE_RATES[code]` stores "units of `code` per 1 EUR" (standard EUR-base forex quote convention), but the file's own doc comment and the cross-rate formula (`fromRate / toRate`) assumed the opposite ("1 unit of `code` = X EUR"). Correct formula is `toRate / fromRate`.

Verified against the AED/USD peg, fixed at exactly 3.6725 AED = 1 USD since 1997 (a hard real-world constant, immune to any staleness in the hardcoded table): the old formula gave `getExchangeRate('AED', 'USD') ≈ 3.673` (should be `1/3.6725 ≈ 0.2723`) — a ~13.5× error in the wrong direction. For currency pairs far from EUR/USD in magnitude (e.g. JPY, VND) the old formula's error was orders of magnitude larger.

**Why this likely went unnoticed in real use**: the bug only lives in the *hardcoded fallback* and the *seeding* of `Travel.defaultRates` at travel creation — not in any rate a user typed in by hand. A freshly seeded default that "looks wrong" (e.g. "1 JPY = 130 EUR") is exactly the kind of number a careful user would manually correct in ParametersTab before real use, which fixes it locally per-travel without the systemic direction bug ever being identified. Already-stored `Transaction.exchangeRate` / `totalAmountMain` values are unaffected (frozen at creation time) regardless of source.

### Fixes applied

1. **`src/shared/utils/exchangeRates.ts`**:
   - Fixed `getExchangeRate()` and `buildDefaultRates()` to use `toRate / fromRate` (previously `fromRate / toRate`).
   - Corrected the file's doc comments to state the real convention ("units of currency per 1 EUR"), with the AED/USD peg cited as the verification method.
   - Refreshed `EXCHANGE_RATES` from live data (`https://open.er-api.com/v6/latest/EUR`, fetched 2026-07-24) — replaces the old, undated hardcoded snapshot. `KPW` (North Korea, no real forex market) kept as a manually-flagged placeholder since it's absent from the live source.
   - Added `SSP` and `UZS` — both were selectable in `pickerData.ts`'s `ALL_CURRENCIES` but missing from `EXCHANGE_RATES`, silently forcing a 1:1 fallback rate for any travel/transaction using them (Tier 1 item 1).
   - Removed the unused `SUPPORTED_CURRENCIES` export (Tier 1 item 3 — dead code, zero references anywhere in `src`).
   - Added `hasExchangeRate(currency, mainCurrency, travelRates?)` — lets callers detect the "about to silently fall back to 1:1" case instead of only a `console.warn` nobody sees in production (Tier 1 item 2).
2. **`src/transactions/components/TransactionForm.tsx`**: surfaced `hasExchangeRate()` as a visible amber warning next to the rate hint when a transaction's currency has no known rate against the travel's mainCurrency, so a bad conversion is caught before saving rather than silently stored.
3. **`src/shared/utils/exchangeRates.test.ts`**: updated all tests that had baked in the old (backwards) formula as "expected" behavior; added an AED/USD peg regression test (both on `getExchangeRate` and `buildDefaultRates`) to lock the correct direction in going forward; added a sync test asserting every `pickerData.ts` currency has a matching `EXCHANGE_RATES` entry, to catch future drift between the two files automatically.

Full suite: 183/183 passing. `tsc -b` clean.

### Stale-data follow-up: existing travels still had backwards rates

The formula fix only changes the hardcoded fallback and future `buildDefaultRates()` seeding — it does not touch already-persisted `Travel.defaultRates` in Firestore, and `getExchangeRate()` always checks `travelRates[currency]` before the hardcoded table. So any currency added to a travel before this fix kept its old (backwards) stored rate, which the user confirmed while sanity-checking a VND-denominated travel (rate looked flipped because it was still reading the pre-fix seeded value).

Considered and rejected: a firebase-admin migration script (would need the user's own credentials — out of scope for this session/tooling) and manual per-travel correction in the UI (tedious, error-prone). Went with a **one-time client-side repair on travel load** instead:

- **`findStaleDefaultRates(defaultRates, mainCurrency)`** (`exchangeRates.ts`) — pure function. For each stored rate, computes the currently-correct hardcoded-table rate and compares the stored value's log-distance to that correct value vs. to its reciprocal (±30% tolerance band). Only flags entries that sit close to the reciprocal and clearly not close to correct — this avoids "fixing" a rate the user has since hand-corrected (which would sit close to the correct value, not its reciprocal) or one that's merely stale from normal market movement (stays in the same order of magnitude, not inverted). 6 new tests covering: reciprocal detection, already-correct (untouched), manually-customized-but-plausible (untouched), mainCurrency itself (skipped), unknown codes (skipped, can't verify), multiple entries in one travel (mixed flag/no-flag).
- **`TravelDetailPage.tsx`**: new effect (guarded by a `rateRepairDone` ref so it runs once per travel load, not on every re-render) runs `findStaleDefaultRates()` against the freshly-loaded travel, persists any corrections via the existing `updateTravelDefaultRate()`, updates local state, and shows a new dismissible `RateRepairBanner` (auto-hides after 12s) naming the corrected currency codes. Already-stored `Transaction.exchangeRate`/`totalAmountMain` values are untouched — this only repairs the *default* rate used for future transactions.

Full suite: 189/189 passing. `tsc -b` and `eslint` clean on all touched files.

### Tier 2 discussion (not yet implemented)

Discussed and deferred to a future session:
- **Live exchange rates**: approved direction — a Cloud-Function-refreshed `config/exchangeRates` Firestore doc (daily), inserted into the existing fallback chain as `tx override → travel defaultRates → global live rates → hardcoded table`. Already on the v2 roadmap; this session just confirmed the priority order.
- **`mainCurrency` editability**: staying locked in v1 per existing decision. Future v2 design note, if picked up: editing `mainCurrency` should be an explicit **batch-recompute action** (re-run `exchangeRate`/`totalAmountMain` for every existing transaction against the new mainCurrency, behind a preview/confirmation step) — not a quiet field edit, since every stored `totalAmountMain` silently becomes wrong the moment `mainCurrency` changes underneath it. High blast-radius, do not treat as a simple settings toggle.
- **Persisting settlement currency/rate per travel** (currently local-only React state in `BalanceTab`, so each member picks their own display currency independently): flagged as low-effort (two more `Travel` fields, same fire-and-forget `updateDoc` pattern used everywhere else) but low-priority — cosmetic only, doesn't affect underlying balance math. No decision made on whether to build it.

### Not done / still open

- Tier 1 item 4 (locale-derived default currency for new users) — explicitly declined by user, `UserProfile.mainCurrency` stays hardcoded to `'EUR'` at first sign-in.
- Tier 2 items not yet implemented (see above) — this session was analysis + critical-fix only.
- Changes not yet committed as of this log entry.

## ♻️ Working Session 022.1 — 27 July 2026

**Type**: Refactor — Space refactor Phase 1 (Travel → Space rename)
**Tools used**: Claude Code (claude-code CLI)

### Context

`docs/SPACE_REFACTOR_SPEC.md` was added, generalising the app's container concept from "Travel" (trip-specific: countries, cities, cash wallets, multi-currency always on) to "Space" (also usable for flatshares, couple budgets, personal tracking) via a future config/preset system. This session executed **Phase 1 only**: a pure rename across the codebase, docs, and routes — no behaviour change, no data-model change, no config/preset system yet (that's Phase 2+, see decision log entries #83–92 in `GlobeExpenses_Specification.md`).

### The one rule this session was built around

Firestore collection paths and stored field keys are frozen as legacy even though every TypeScript type, function, folder, and UI string now says "Space". A blind find-and-replace across the repo would have silently corrupted production data (e.g. `doc(db, 'travels', id)` → `doc(db, 'spaces', id)` compiles fine but points at a nonexistent collection). Every file was therefore hand-reviewed (or scripted with protected placeholders around frozen substrings, then diff-reviewed) rather than mechanically substituted in bulk.

**Frozen (unchanged) — confirmed and left exactly as-is:**
- Firestore collection paths `travels/{travelId}` and `travels/{travelId}/transactions/{txId}`
- Firestore field keys: `travelMemberId` (on `SpaceMember` and `Split`), `memberUids`, `archivedByUids`
- Stored string values: the invite `type` discriminator `'travel_member'`, and `Invite.travelId` / `Invite.travelName` (fields on the `invites/{id}` documents)
- Existing `localStorage` keys (untouched, out of scope)

**Special case resolved**: `Travel.travelId` was checked against `createTravel()`/`useTravels` and confirmed **derived-only** — never written into the document body (always `snapshot.id`). Per the spec's decision rule, this made it safe to rename the TypeScript property freely: `Space.spaceId`.

**Renamed everywhere else**: types (`Travel`→`Space`, `TravelMember`→`SpaceMember`, `TravelSettings`→`SpaceSettings`), functions (`createTravel`→`createSpace`, `updateTravelMeta`→`updateSpaceMeta`, `leaveTravel`→`leaveSpace`, `deleteTravel`→`deleteSpace`, `archiveTravel`/`unarchiveTravel`→`archiveSpace`/`unarchiveSpace`, `claimTravelMember`→`claimSpaceMember`, `renameTravelMember`→`renameSpaceMember`, `unclaimTravelMember`→`unclaimSpaceMember`, `getTravelMainCurrency`→`getSpaceMainCurrency`, `updateTravelList`/`updateTravelCurrencies`/`updateTravelDefaultRate`→`updateSpace*`, `sendTravelInvite`→`sendSpaceInvite`, `acceptTravelInvite`→`acceptSpaceInvite`, `exportTravelToXlsx`→`exportSpaceToXlsx`, `TravelInviteResult`→`SpaceInviteResult` with its `travelId` field renamed to `spaceId` since it's a plain client-side return type, not a stored key), props/variables (`travel`→`space`, `travelId`→`spaceId`, `travelSettings`/`travelCategories`/`travelPaymentMethods`/`travelCurrencies`/`travelCountries`/`travelCities`→`space*`, `onTravelChange`→`onSpaceChange`), routes (`/travels`→`/spaces`, `/travels/:travelId`→`/spaces/:spaceId`), and all user-facing English UI strings.

**Exception preserved per spec §2.4**: identifiers built on the frozen `travelMemberId` key kept their names unchanged — `currentUserTravelMemberId`, `myTravelMemberId`, `selectedTravelMemberId`, `slotToTravelMemberId`, and by the same logic `currentTravelMemberId` / `focusTravelMemberId` (local variables in `DashboardTab.tsx` / `ReconciliationDialog.tsx`).

### Files moved (`git mv`)

`src/travels/` → `src/spaces/`, with `travelService.ts`→`spaceService.ts`, `useTravels.ts`→`useSpaces.ts`, `TravelDetailPage.tsx`→`SpaceDetailPage.tsx`, `TravelsPage.tsx`→`SpacesPage.tsx`, `TravelTabs.tsx`→`SpaceTabs.tsx`, `CreateTravelModal.tsx`→`CreateSpaceModal.tsx`. Tab components, `CollapsibleCard.tsx`, `dashboardHelpers.ts`, and all test files kept their filenames per the prompt's file table.

### Bugs caught during self-review (not shipped)

Working file-by-file with diff review after each script pass caught three real mistakes before they landed:
1. A scripted word-boundary rename briefly turned `doc(db, 'travels', id)` into `doc(db, 'spaces', id)` in `SpaceDetailPage.tsx` (the bare, unquoted collection literal isn't protected by `\btravels\b` regex boundaries the way `travelMemberId` is) — caught by diffing the file before moving on, fixed immediately.
2. `space.travelId` (a leftover from before the `Space.spaceId` rename propagated) in two places in `ImportXlsxDialog.tsx` and one in `DashboardTab.tsx`'s `ReconciliationDialog` call — caught by TypeScript-shaped review of each diff, fixed to `space.spaceId`.
3. An import path collapsed to `@/spaces/services/travelService` (the old filename) in `ParametersTab.tsx` because the generic word regex ran before the explicit full-path string replace — fixed, and the ordering (exact import-path replacements before generic word regex) was corrected for every subsequent file.

### Residual `ravel` grep (post-refactor, expected to remain)

`grep -rn "ravel" src/ --include=*.ts --include=*.tsx` returns ~495 hits, all confirmed legitimate:
- ~337 — the frozen `travelMemberId` field/property name (types, comments, Split literals, test fixtures)
- ~84 — the frozen-by-convention compound identifiers (`currentUserTravelMemberId`, `myTravelMemberId`, `selectedTravelMemberId`, `slotToTravelMemberId`, `currentTravelMemberId`, `focusTravelMemberId`)
- ~29 — the bare Firestore collection literal `'travels'` inside `doc()`/`collection()` calls
- ~30 — the frozen invite `'travel_member'` discriminator and `Invite.travelId`/`Invite.travelName` fields
- 1 explanatory comment in `App.tsx`'s legacy-redirect routes (`/travels` — the old path being redirected *from*, correctly still spelled `travels`)

No stray `Travel`/`travel` identifiers, UI strings, or import paths remain outside these categories.

### Docs updated

- `GlobeExpenses_Architecture.md` — §3.1 module list, §4.1 collection table (added an explicit frozen-legacy note), §4.2 data model (`Travel`→`Space`, `TravelMember`→`SpaceMember`), §5.4/5.7 flow names, §6 security rules commentary, §7 roadmap.
- `GlobeExpenses_Specification.md` — §3.2/§3.4/§3.5.5 section titles, function-name references, decision log entries #79–92 appended (renamed-container decisions + the Phase 2+ config/preset decisions from the spec, marked accordingly).
- `CLAUDE.md` — "Per-travel lists" → "Per-space lists"; added two new Key Conventions bullets about the frozen Firestore keys and the (future) `getSpaceConfig()` / `presetOrigin` rule.

### Verification

- Full residual grep reviewed line-by-line (see above) — clean.
- `pnpm tsc --noEmit`, `pnpm test`, `pnpm build`, and the manual smoke-test checklist from the prompt were run after this log entry — see next entry or commit message for results if not captured here.

### Not done / still open

- Phase 2 (config foundation: `SpaceConfig`, `getSpaceConfig()`, presets, per-field tiers) — next phase, not started.
- Changes not yet committed as of this log entry (pending user review).

## 🐛 Working Session 022.2 — 27 July 2026

**Type**: Bug fix + tests (Space refactor Phase 4.1 and 4.2)
**Tools used**: Claude Code (claude-code CLI)

### Context

Following the Space refactor's Phase 4 (preset-based creation flow, not logged in this file — see `docs/SPACE_REFACTOR_SPEC.md` for phase status), manual verification surfaced three bugs in quick succession, fixed across two prompts.

### Bug 1 — a space's config did not match the preset chosen at creation (04.1)

Opening Parameters on a freshly created `solo`/`custom` space showed sections the preset should have hidden (Countries, Cities, Exchange rates, Currencies). `travel` looked correct only because its toggles are all `true`, which happens to be `getSpaceConfig()`'s fallback value.

Root cause: `SpaceDetailPage.tsx`'s `fetchSpace()` rebuilt the `Space` object field-by-field from the Firestore doc and never mapped `config`/`presetOrigin`. It type-checked fine since both are optional on `Space`. `space.config` was therefore always `undefined` for every opened space, and the resolver silently fell back to full travel-mode defaults regardless of what preset was actually written. The write path and the `getSpaceConfig()` consumer path were both already correct — only this one reconstruction was missing the fields. Fixed by adding `config`/`presetOrigin`/`startDate`/`endDate` to that mapping (and to `useSpaces.ts`'s snapshot mapping for the two new date fields, for consistency — it already mapped `config` correctly).

### Bug 2 — space creation hung offline (04.1)

`createSpace()` was `async`/awaited since its very first commit (confirmed via `git log -p`) — a long-standing gap, not a Phase 4 regression. Awaiting a Firestore write hangs forever offline because the write promise only resolves on server acknowledgment. Converted `createSpace()` and `createShareableInvite()` to the fire-and-forget pattern (`doc()` generates the id client-side; `setDoc()` is not awaited) — same pattern as `createTransaction()`.

### Bug 3 — permission-denied race on newly created spaces, online (04.2)

Bug 2's fix introduced a new failure mode: navigating to a freshly created space now happens before the parent `travels/{id}` document has synced to the server. The `transactions` subcollection security rule does a `get()` on that parent to check `memberUids`; against a not-yet-existent parent, that `get()` denies the read, and `useTransactions()` surfaced a permission error even though the space and its data were fine (confirmed by reloading). Fixed with a bounded retry in `useTransactions()`: `permission-denied` gets up to 3 retries with ~500ms/1s/2s backoff before surfacing an error; every other error code still surfaces immediately, with no retry. Audited every other `onSnapshot` listener in the app (`useSpaces`, `usePendingInvites`/`subscribeToIncomingRequests`) — neither is exposed to this race, since neither queries a subcollection gated by a `get()` on a possibly-just-created parent document.

### Convention added

`CLAUDE.md`: stripping fields before a Firestore write must test `v !== undefined` explicitly, never filter by truthiness.

### Tests added

- `spaceService.test.ts` — `createSpace` returns a string synchronously (not a `Promise`); solo-preset config toggles are written with explicit `false` (asserted with `toBe(false)`, not truthiness); a custom field with `enabled: false` survives serialization; the write is not awaited.
- `useSpaces.test.ts` (new) — snapshot mapping produces a `Space.config` deep-equal to the stored document; legacy documents with no `config` map to `undefined`.
- `useTransactions.test.ts` (new) — permission-denied retries then succeeds with no error surfaced; a different error code surfaces immediately with no retry; permission-denied on every attempt surfaces an error after the 3-attempt budget; unmounting mid-backoff clears the timer, detaches the listener, and updates no state; `spaceId` change resets the attempt counter. Uses fake timers.
- `SpaceCreatePage.test.tsx` — mocks updated from `mockResolvedValue` to `mockReturnValue` to match the new synchronous contract (the old mock shape would have hidden a Promise-vs-string regression); added a test asserting navigation uses the synchronously-returned id.

Full suite: 230/230 passing. `tsc --noEmit` and `pnpm build` clean.

### Not done / still open

- **Denormalize `memberUids` onto transaction documents** (carry-forward). The real fix for Bug 3 is to stop the `transactions` subcollection rule from doing a per-read `get()` on the parent space document at all — copy `memberUids` onto each transaction at write time and rewrite the rule to check the query constraint directly. This removes the creation race entirely (no parent-existence dependency) and eliminates the per-read `get()` cost already flagged as a scalability concern. It needs a security-rules change plus a backfill of every existing transaction document, so it should be scheduled alongside the `batchUpdateTransactions` work (chunked `writeBatch`, 500 docs/batch) already on the roadmap, rather than done piecemeal. Until then, the bounded retry in `useTransactions()` is the mitigation.
- Manual browser verification of the online/offline creation flows (§Verification in the 04.2 prompt) was not performed — no Firebase login session available in this environment. Automated coverage (tests above) verifies the logic; a real click-through is still recommended before treating this as fully closed.
## ♻️ Working Session 023 — 1 August 2026

**Type**: Refactor — Space refactor Phase 6 (config-driven transactions list and filters)
**Tools used**: Claude Code (claude-code CLI)

### Context

Phase 5 made the transaction *form* config-driven. This session did the same for the *list*: the filter panel, the day headers and the row/detail display stop assuming country/city/category/paymentMethod exist, and enabled custom fields become filterable. See `docs/SPACE_REFACTOR_SPEC.md` §3 (field tiers) and the Phase 6 prompt.

### New pure module — `src/transactions/utils/filterDimensions.ts`

The panel used to hard-code one section per dimension. It now renders generically over a descriptor list:

- `FilterDimension` — `{ key, label, emoji, source, control, options, optionsAreClosed }`. `control` is `'multi'` (core, built-ins, custom select) or `'triState'` (custom boolean: any/yes/no).
- `filterDimensions(space, config, observed?)` — the **config-gated** dimensions: enabled built-ins (category, country, city, paymentMethod) then enabled custom select/boolean fields in definition order. Custom `text` fields are deliberately absent.
- `allFilterDimensions(space, config, isSolo, observed?)` — everything the panel renders, i.e. the above plus the **core** dimensions interleaved in the historical display order: `type, category, currency, country, city, paymentMethod, paidBy, beneficiaries, …custom`.
- `dimensionValues(tx, dim)` / `matchesDimension(tx, dim, selected)` — the single mapping from a transaction onto a dimension. It drives filtering *and* cross-filtered availability, so custom fields get the grey-out behaviour for free.
- `reconcileFilters(filters, dimensions)` — stale-filter purge (§3). Returns the **same reference** when nothing changed.
- `searchableCustomFieldIds(config)` — enabled `text` fields, which feed the search box instead of the panel.

### Three descriptor `source` values, not two

The spec's sketch had `source: 'builtIn' | 'custom'`. A third value, `'core'`, was added for `type`, `currency`, `paidBy` and `beneficiaries`. These are not Tier-2 toggleable fields, but they are still *conditional*:

| Dimension | Condition | Rationale |
|---|---|---|
| `currency` | `features.multiCurrency` | Same visibility rule as the form's currency pill (SPEC §6.2). This is what removes the currency filter from a solo space. |
| `paidBy` / `beneficiaries` | `!isSolo` | Pre-existing rule, unchanged. |
| `type` | always | Deliberately **not** gated on `features.wallets`: existing withdrawals/adjustments stay visible and filterable in a space where wallets were later turned off (SPEC §6.1). |

Without `'core'` these four would have had to be special-cased inside the generic renderer, which is exactly what this phase was meant to eliminate.

### Built-in options stay observation-derived (deliberate divergence from the prompt)

The prompt described built-in `options` as coming from "the space's own list order". That was **not** implemented, because it would have broken legacy parity in two ways: a legacy space with empty per-space lists (which fall back to the user's global profile lists) would offer no filter options at all, and a value stored on transactions but since deleted from the space list would become unfilterable.

Built-in and core options therefore remain derived from the transaction list, exactly as before, with the `UNDEFINED_FILTER` sentinel appended. Custom-field options come from the definition. The difference is made explicit on the descriptor as `optionsAreClosed`, and `reconcileFilters()` only prunes selections on closed dimensions — so a category that momentarily has no transactions never silently clears the user's filter, while a genuinely deleted custom option does.

### Stale filters (§3)

`reconcileFilters()` is applied as a **pure derivation first** (so a filter on a just-disabled field never narrows the current render's results) and the result is then written back to state via the *adjust-state-during-render* pattern rather than a `useEffect`:

```ts
const effectiveFilters = useMemo(() => reconcileFilters(filters, dimensions), [filters, dimensions])
if (effectiveFilters !== filters) setFilters(effectiveFilters)
```

Safe because it is identity-guarded and `reconcileFilters` is idempotent, so it converges after one extra render pass. A `useEffect` here would also have tripped `react-hooks/set-state-in-effect` (the new eslint-plugin-react-hooks v7 rule).

### Display gating (§5)

- `DayGroupHeader` takes `showCountry` / `showCity` (gated **independently**, so a space tracking cities but not countries still gets its city line — the prompt's "date and total only" wording assumes both go together, which the presets do but the toggles don't enforce).
- `TransactionRow`: the leading emoji is `null` for an expense when `category` is off (the emoji is sourced from a hidden field), and the category pill is gated. Flex `gap` means the row closes up with no leftover space.
- `TransactionDetail`: each meta-grid cell (Category / Payment / Country / City) and the Notes line are gated on their built-in.
- Custom field values still do **not** appear in list rows — only in the expanded detail, as built in Phase 5.

### Search (§4)

Enabled custom `text` field values were added to the free-text search. ⚠️ For the record: the search covers **transaction name** + **amount** (exact or prefix, on both `totalAmount` and `totalAmountMain`) + now custom text. It does **not** cover `notes`, and never has — adding it would have been a legacy behaviour change, so it was left alone.

### Tests added

- `src/transactions/utils/__tests__/filterDimensions.test.ts` (34 tests) — legacy space yields today's four built-ins; solo/group presets; custom select + boolean in definition order; text fields absent; disabled fields absent; select options carry **ids not labels**; select matches on option id and *not* on label; boolean *no* matches explicit `false`, an absent key **and** an absent `custom` map; boolean *yes* matches only `true`; reconcile drops a disabled dimension, drops a deleted option while siblings survive, keeps an unobserved built-in selection, survives an option **rename**, and returns the same reference when unchanged.
- `src/spaces/components/tabs/__tests__/TransactionsTab.test.tsx` (15 tests, new file) — legacy space renders the exact historical chip list and order; solo space offers no country/city/currency and drops the day-header flags; category pill positive control + hidden when disabled; a custom select narrows the list; boolean yes/no incl. pre-field-existence rows; custom text hits the search box but is not a dimension; disabling a field mid-filter clears the chip and widens the results; deleting a filtered option keeps siblings; renaming an option keeps the filter working and shows the new label; empty result shows the no-match state with a working clear action.

Full suite: 308/308 passing (was 259). `tsc --noEmit`, `pnpm build` clean. `pnpm lint` introduces no new problems (the 4 remaining in `TransactionsTab.tsx` are pre-existing: 3 × `react-refresh/only-export-components` on the `currencySymbol`/`formatAmount`/`groupByDay` exports, 1 × `set-state-in-effect` in `PendingBadge`).

### Files changed

| File | Change |
|------|--------|
| `src/transactions/utils/filterDimensions.ts` | **New** — descriptors, value extraction, reconciliation |
| `src/transactions/hooks/useTransactionFilters.ts` | Generic over `dimensions`; string-keyed filter state; custom-text search; reconciliation; `availableOptions` now `Record<string, Set<string>>` |
| `src/transactions/components/FilterPanel.tsx` | Renders generically over descriptors; tri-state control; chips carry `aria-label` |
| `src/spaces/components/tabs/TransactionsTab.tsx` | `getSpaceConfig()` resolved once; day-header / row / detail gating; new FilterPanel props |

### Not done / still open

- Manual browser verification (prompt §Verification items 2, 9, 10 — legacy click-through, day-header layout with country disabled, 375px with several chips) was **not** performed: no Firebase login session in this environment. Legacy parity is covered by the component tests above, but a real click-through is still recommended before treating Phase 6 as closed.
- Custom `select` filters offer no "Undefined" option (built-ins do). Not requested; worth deciding before Phase 7 reuses these descriptors for dashboard breakdowns.
- Out of scope by prompt §7: grouping/sorting by a custom dimension (Phase 7), bulk selection, filter persistence across sessions.

## ✨ Working Session 024 — 6 August 2026

**Type**: Feature — Space refactor Phase 7a (config-driven dashboard) + member scope picker patch
**Tools used**: Claude Code (claude-code CLI)

### Context

Phase 7a rebuilt the Dashboard tab around a single scoped pipeline, added generic 1D breakdown cards with a card builder, gated every card on `config`, and wired row-tap drill-down into the Transactions tab. A follow-up patch in the same session replaced the binary You/All toggle with a full member picker.

### The one idea the phase is built around

Every card now reads **one** resolution step and nothing else:

```
transactions → scope (global range; exclude transfers/withdrawals) → attribute → ScopedTransaction[]
```

`scopeTransactions()` is pure, has no React import, and takes `{ range, mode, mainCurrency }`. Cards never receive raw transactions. Before this, each card did its own filtering, so two cards could quietly show different windows.

The exclusion rule was **not** rewritten — `countsAsSpending()` from `walletHelpers` is reused, so transfers and withdrawals stay out and expense-mode adjustments stay in, exactly as before. **Adjustment treatment, stated explicitly:** `adjustmentMode: 'expense'` counts as spending; `'balance_only'` and a missing mode do not. Unchanged from pre-Phase-7a.

### Member scope picker (the patch)

`mode: 'you' | 'all'` became `mode: typeof ALL_MEMBERS | string`, and `currentMemberId` was **removed from `ScopeOptions` entirely**. The pure function therefore has no parameter that could carry identity: the UI resolves its "You" row to a `travelMemberId` before calling in, so `scopeTransactions()` never sees the string `'you'` and works for any member, not just the logged-in one.

The picker is a bottom sheet (vaul `Drawer`) — a segmented control does not survive 375px past three members. Rows: All · You · then the rest in `space.members` order, unclaimed slots included (they hold splits like anyone else). Hidden entirely in a one-member space. Neither the range nor the member selection is persisted: a stored range goes stale the moment the calendar moves on.

If the selected member disappears (removed by someone else, arriving over `onSnapshot`), the tab falls back to `ALL_MEMBERS` via adjust-state-during-render rather than showing zeroes for someone who is gone.

### Drill-down asymmetry (deliberate)

Tapping a breakdown row opens Transactions with the dimension, the value(s), **and the global date range** — without the range the drilled list would not sum to the number just tapped. It deliberately does **not** carry the member selection: a member's share of a group dinner is not a transaction of its own, so pre-filtering would hide the very rows the number came from. Commented at the call site and pinned by a test asserting the payload keys.

`useTransactionFilters` gained a set-from-outside entry point (`FilterRequest` with a `nonce`, since the same row can legitimately be tapped twice) rather than having its internals reached into. Existing filters are **replaced**, not merged.

### Cards owning their own scoping — migrated

Only one: **"Recent days"** owned a 3/7/15-day look-back pill. §2 required lifting it, so it now reads the global range, was renamed **"Day by day"**, and is capped at 15 rows with a show-all link. **This is the only card whose numbers change on a legacy space.** Every other card reproduces its pre-Phase-7a figures.

### Deviation from the acceptance criterion (accepted)

§6's legacy default card set is category **and** country, but no country card existed before this phase — so a legacy space gains one. Reviewed and kept: it is an addition, no existing card's numbers move, and it is config-gated.

### The "Uncategorized" degradation, fixed

Phase 5 let a space with `builtInFields.category` disabled fall back to a single "Uncategorized" bucket. `categoryKey()` now returns `''` when the field is off, so the bucket never forms.

### Default range without branching on `presetOrigin`

The spec asked for all-time on travel-shaped spaces and this-month elsewhere, but SPEC §8 invariant 4 forbids branching on `presetOrigin`. `defaultRangePreset(config)` reads `builtInFields.country || features.wallets` instead, which reproduces the intended default for a legacy space and for all four presets.

### Tests added (+43 over Phase 6's 344 → 387)

- `dashboardScope.test.ts` (19) — exclusions incl. the three adjustment cases; `ALL_MEMBERS` sums `totalAmountMain`; a member id takes the beneficiary share at the tx rate; unclaimed slots attribute normally; **both** members reconcile against `computeBalances` (`consumed = paid − net`) and their shares partition the group total; DD-MM-YYYY is never compared lexicographically; `defaultRangePreset` per preset.
- `dashboardCards.test.ts` (17) — sort by amount, Other collapsing, missing row pinned last even after Other, select grouped on option **id** with label resolution and raw-value fallback, boolean absent-key counts as No, disabled dimension hides a card without deleting it.
- `DashboardTab.test.tsx` (30) — legacy regression; gating; breakdown behaviour; controls; drill-down payload; card builder.
- `DashboardControls.test.tsx` (7) — pins that "You" calls back with a member id and **never** `'you'`.
- `TransactionsTab.test.tsx` (+5) — drill-down replaces rather than merges, carries the range, opens the panel.

**Mutation-tested rather than assumed.** Three deliberate mutations confirmed the new assertions bite: `beneficiaries`→`paidBy` (5 failures), range filter disabled (2), All-mode amount doubled (10). All reverted.

### Files changed

| File | Change |
|------|--------|
| `src/shared/utils/dateRange.ts` | **New** — relative range model; parses via `parseTxDate`, never raw string compare |
| `src/spaces/utils/dashboardScope.ts` | **New** — `scopeTransactions`, `attributedAmount`, `defaultRangePreset` |
| `src/spaces/utils/dashboardCards.ts` | **New** — `computeBreakdown`, legacy card set, visibility |
| `src/spaces/components/dashboard/` | **New** — `DashboardControls`, `BreakdownCard`, `CardBuilder` |
| `src/spaces/components/tabs/DashboardTab.tsx` | Rewritten around the scoped pipeline |
| `src/spaces/types.ts` | `DashboardCardDef`; `SpaceConfig.dashboardCards?` |
| `src/spaces/config.ts` | `dashboardCards` preserved as `undefined` (absent ≠ empty) |
| `src/spaces/services/spaceService.ts` | `updateSpaceDashboardCards()`, dotted-path atomic write |
| `src/transactions/utils/filterDimensions.ts` | `FilterRequest` type |
| `src/transactions/hooks/useTransactionFilters.ts` | Set-from-outside entry point; `dateRange` state |
| `src/transactions/components/FilterPanel.tsx` | 📅 range badge |
| `src/spaces/components/CollapsibleCard.tsx` | `actions` slot as a **sibling** of the toggle (a button may not nest a button) |
| `src/spaces/components/SpaceTabs.tsx`, `SpaceDetailPage.tsx` | Plumb `filterRequest` down, `onDrillDown` up |
| `vite.config.ts` | `testTimeout: 20000` — cold-start transform under parallel workers was tripping the 5s default |

### Not done / still open

- **`TransactionForm.tsx` has 47 `react-hooks/rules-of-hooks` errors** (conditional hooks). Not touched this session and not introduced by it; the file was heavily rewritten in Phase 5, so that is the likely origin. This is **not** a style complaint — hooks called conditionally corrupt state when the condition flips between renders. Worth a dedicated session; the usual cause is one early return sitting above the hook block.
- Lint across the whole project: 90 problems (84 errors, 6 warnings). 9 fall in files this session touched, **all pre-existing, 0 new** (4 of them are named verbatim in Session 023's entry, written before Phase 7a existed).
- Manual browser verification not performed (no Firebase session in this environment): legacy click-through, You-mode agreement with the Balance tab in the real app, 375px layout.
- Phase 7b (out of scope by §7): 2D pivot cards, a month dimension, per-member dashboards, persisting range/mode. `DashboardCardDef.dimensions` is already an array so 7b widens `[string]` → `[string, string]` without a stored-shape change. Expected friction: `computeBreakdown` returns a flat `BreakdownRow[]`; a separate `computePivot` is probably cleaner than overloading it.

## ✨ Working Session 025 — 6 August 2026

**Type**: Feature — Space refactor Phase 7b (2D pivot breakdown cards)
**Tools used**: Claude Code (claude-code CLI)

### Context

Phase 7a shipped the scoped pipeline, the generic 1D breakdown card, the card builder and row-tap drill-down. 7b adds a **second grouping dimension**. The aggregation was a small extension; the layout and the duplicate rules were the actual work.

### 1D regression — confirmed

The 387 tests from Phase 7a all pass **unmodified in behaviour**. Nine of them were edited for the `FilterRequest` shape change only (see below) and one for `cardTitle`'s new signature — no assertion about a rendered number, row, or drill-down result changed. `BreakdownCard.tsx` was touched on exactly one line (`cardTitle(card, [dimension])`). A pivot is a new rendering mode, not a rewrite of the card.

There is also a pure-function regression anchor: `computePivot(scoped, country, category)` section totals are asserted equal, key for key, to `computeBreakdown(scoped, country)` rows.

### `computePivot` is a sibling, not a generalisation

Deliberate, per the prompt's carry-in 0.1. The 1D function applies top-N once to a flat row list; a pivot applies it at **two** levels over a cell matrix. The two share only `optionLabel()` and the `OTHER_ROW` / `UNDEFINED_FILTER` sentinels. The mild duplication buys a shipped, tested code path that literally cannot regress.

Rules, applied identically at both levels: only combinations that **exist** produce an entry (no empty cells, which is what keeps a sparse pivot readable); sort by total descending; top-N with an "Other · N values" entry; missing values pinned **last, after Other**.

Two caps: `TOP_N = 5` rows per section (shared with 1D) and a new `SECTION_TOP_N = 8`.

⚠️ **`SECTION_TOP_N = 8` is a known-unvalidated number.** It has never been seen against real data — no Firebase session in this environment. It was deliberately **not** retuned: swapping one guess for another buys nothing, and the builder's live preview exists precisely so real data settles it. Revisit after the first real high-cardinality pivot, not before.

**The "Other" section is the one asymmetry.** It stands for several primary values, so it has no single secondary breakdown: `rows: []`, not expandable, drills straight through. Consequence to know: the "section total = Σ its rows" invariant holds for every *expandable* section, and the test asserts it that way. "Σ section totals = card total" holds unconditionally.

The **missing-primary** section, by contrast, does break down normally — knowing *what* is missing a country is the whole reason to open it.

### `FilterRequest` grew a selections list (carry-in 0.2)

```ts
selections: { dimensionKey: string; values: string[] }[]
```

One entry for a 1D row, two for a pivot cell, ANDed by the hook — which is what the filter state already does across dimensions, so this is a shape change and not a behaviour change. The 1D call site was migrated rather than left on the old shape, so there is only one shape in play. Replace-not-merge semantics unchanged.

### Layout: nested list, not a grid

A true matrix loses at 375px — ten countries × twelve categories needs horizontal scrolling inside a vertically-scrolling tab. So primary → collapsible sections, secondary → indented rows. Row chrome (label, amount, %) matches `BreakdownCard` so the two read as one feature. All sections start collapsed **except the first**; the state is component-local and not persisted, and the card is remounted (keyed on the joined dimensions) when the pair changes so it is re-derived rather than carried over.

Row percentages are of the **section**, not the card: inside "Japan", what the user is comparing is Japan's own composition.

### Two tap targets in a section header

The chevron collapses; the **total** drills down to the primary value alone (the same result as the equivalent 1D card row). They are separate `<button>`s with an underline affordance on the total, because the total is the more valuable action and must stay reachable without expanding first — the test asserts it is still there while the section is collapsed.

### Duplicate prevention — order is meaningful

`usedCardKeys(cards, exceptId?)` keys on the **ordered** join, computed from the **full stored array**.

| Case | Rule |
|---|---|
| `[country]` vs `[country, category]` | different cards, neither blocks the other |
| `[country, category]` vs `[category, country]` | different cards, both legitimate |
| first-dimension picker | disabled only when the exact card being built already exists |
| second-dimension picker | disabled when it would complete an existing pair, or would pair a dimension with itself |
| swap control | disabled when the swapped card already exists — the case most easily missed, since it collides without either picker being touched |
| hidden cards | **counted**, or the user creates a card that silently collides when the field is re-enabled |

Unavailable choices are greyed out with `title="Already on your dashboard"` rather than rejected after the fact. One further UX fix fell out of this: the builder now opens on the first dimension that is *not* already a 1D card, so it never starts on a combination it would refuse to save.

**Post-review fix — the second-dimension row is permanent.** It was first built behind a `+ Add a second dimension` action. That hid the pivot option *and* the greying that depends on it: the first picker re-evaluates against the **pair** once a secondary exists (`[country]` being taken does not make `country × category` a duplicate), but with the row hidden the user never saw that ungreying happen. The row is now always rendered, with a leading **`None`** chip standing for a 1D card — which also replaces the old `Remove` link. `None` is greyed when the `[primary]` 1D card already exists, since dropping back to 1D can itself be the duplicate. Both rows offer identical chip labels, so each is wrapped in a `role="group"` with an `aria-label` — a screen reader has exactly the test's problem of telling two adjacent identically-named button groups apart.

### Disabled dimensions (§6)

A pivot is hidden when **either** dimension is disabled, and never degraded to 1D — that would show a card whose title promises two dimensions and whose numbers are a different aggregation. `visibleDashboardCards()` now returns `dims: FilterDimension[]` and requires every key to resolve. Nothing is written, so re-enabling brings the card back with its title and order intact.

### Tests added (+29 over Phase 7a's 387 → 416)

- `dashboardCards.test.ts` (+13) — no empty cells; both sortings; row-level Other with `collapsedKeys`; section-level cap at 8 with a non-expandable Other; missing pinned last at both levels *after* Other; missing section still breaks down; both eyeball invariants with **both** caps engaged simultaneously; custom select resolved from the option **id** as a secondary; absent boolean key counts as No; 1D regression anchor; `cardTitle` order-sensitivity; `usedCardKeys` ordering/`exceptId`/hidden-card rules; pivot hidden on either dimension and restored intact.
- `DashboardTab.test.tsx` (+10) — only the first section expanded; row drill-down carries both filters and the range and *not* the member; section-total drill-down carries the primary only; chevron collapses without navigating and leaves the total reachable; Other row drills the collapsed set; a one-disabled-dimension card is hidden and not written away; save preserves picked order; swap updates the title live and saves the swapped order; second picker greys out completing pairs while leaving the reverse available; swap disabled when the swapped card exists; a hidden card's dimension still counts once re-enabled.
- `TransactionsTab.test.tsx` (+2) — two selections are ANDed; a cell whose values never co-occur yields nothing.

`tsc --noEmit`, `pnpm test` (416/416), `pnpm build` clean. `pnpm lint` still 90 problems, **0 in the files this session touched** — unchanged from Session 024.

### Files changed

| File | Change |
|------|--------|
| `src/spaces/components/dashboard/PivotCard.tsx` | **New** — nested-list renderer, two-target section header |
| `src/spaces/utils/dashboardCards.ts` | `computePivot`, `PivotSection`/`PivotRow`, `SECTION_TOP_N`, `drillValues`, `usedCardKeys`; `visibleDashboardCards` → `dims[]`; `cardTitle` takes the dimension list |
| `src/spaces/components/dashboard/CardBuilder.tsx` | Second dimension, swap, duplicate greying, pivot preview, `DimensionPicker` extracted |
| `src/spaces/components/dashboard/BreakdownCard.tsx` | One line — `cardTitle(card, [dimension])` |
| `src/spaces/components/tabs/DashboardTab.tsx` | Renders `PivotCard` for a 2-dimension card; `selections[]` drill-down; passes `usedKeys` |
| `src/spaces/types.ts` | `dimensions: [string] \| [string, string]` |
| `src/transactions/utils/filterDimensions.ts` | `FilterSelection`; `FilterRequest.selections` |
| `src/transactions/hooks/useTransactionFilters.ts` | Applies a list of selections |

### Not done / still open

- **Carry-in 0.3, deferred as instructed**: the "Day by day" card is an undeclared pivot — it groups by day outside the card system and overlaps with "Spending over time". Folding it in as an ordinary card definition needs the month/day **derived dimension** that is still out of scope, so it stays bespoke for now.
- Manual browser verification not performed (no Firebase session in this environment): the real-space checks in the prompt's Verification §2–§9, including the 375px pass with a long section label. The 5/8 caps are logged above as known-unvalidated and deliberately left alone.
- Out of scope by §7 and untouched: three or more dimensions, transposing a saved card in place, exporting a pivot.

### 🐛 Open bug — country values have no canonical form (investigated, NOT fixed)

Reported against the dashboard: countries render inconsistently — sometimes the bare name, sometimes only a flag. Diagnosed this session, **deliberately deferred**. Three findings:

**1. `Transaction.country` has no canonical stored form.** The form's country picker writes the **bare name** (`TransactionForm.tsx:186` uses `value={c.label}`); the flag lives separately on `space.countries[].emoji`. Other paths write **flag + name** (`"🇯🇵 Japan"`). That second shape is definitely in real data — `TransactionsTab.tsx:97` carries an `extractCountryEmoji()` helper whose only job is stripping a leading flag back off. XLSX import writes whatever the sheet cell holds, so a bare flag is possible too.

**2. `getFlagForCountry()` is broken** (`pickerData.ts:366`). Entries are `[code, flag, name]`, but it destructures `([, n])` — binding the **flag** — and compares it to a country *name*, so it never matches; and on a match it would return `found[0]`, the ISO code, not the flag. Verified: it returns `'🌍'` for every input. Consequence: every country auto-added by `syncTransactionLocation()` or by XLSX import gets 🌍 instead of its flag. Only the form's picker produces a real flag, because it passes one directly.

**3. The dashboard shows the raw value** because `breakdownDimensions()` calls `filterDimensions(space, config)` with no observed values, so built-in dimensions come back with `options: []` and `optionLabel()` falls through to the stored string.

⚠️ **A display-only fix would make it worse.** The grouping key *is* the raw string, so `"Japan"` and `"🇯🇵 Japan"` are already two rows with split totals; normalising only the label would render two rows reading identically.

**Agreed fix when picked up — canonicalise at the descriptor level, no data migration:**

`dimensionValues()` is a **single funnel** — it drives `matchesDimension()`, the cross-filtered availability list, `computeBreakdown` *and* `computePivot`, all via `STATIC_BY_KEY.get(key).extract(tx)`. Canonicalising inside country's `extract` therefore propagates to all four for free, and drill-down needs no change: the requested value and the matcher canonicalise identically, so they agree by construction.

| File | Change |
|---|---|
| `pickerData.ts` | Fix `getFlagForCountry`; add a name→flag index and `canonicalCountry(raw)` (strip flag prefix, resolve to canonical name) |
| `filterDimensions.ts` | Country `extract` canonicalises; country `labelFor` renders flag + name; expose `labelFor` on `FilterDimension` |
| `useTransactionFilters.ts` | The observed-values block (~line 185) hand-rolls extraction — the **one** path bypassing `dimensionValues` |
| `dashboardCards.ts` | `optionLabel()` falls back to `dim.labelFor` when `options` is empty |
| `TransactionsTab.tsx` | Row / detail / day-header country through the same helper; `extractCountryEmoji` likely deletes |

**Design decision to take first**: the canonical key should be the **bare country name**, with the flag rendered at display time — the form already writes bare names, so most existing data is already canonical and few rows move, and it matches how categories work (label stored, emoji resolved from the list).

Effort: ~60–80 lines of production code, ~10 new tests; only 6 country literals exist across the whole test suite, so fixture churn is trivial. Roughly half a session, low risk because of the single funnel.

**What that fix would still leave**: `space.countries` entries already storing `'🌍'` keep showing 🌍 in the Parameters list editor (it renders the `LabeledItem`'s own emoji rather than looking it up — one extra line to include); the stored data stays mixed, made invisible rather than cleaned; and countries absent from `ALL_COUNTRIES` keep their raw name with no flag, deliberately — better a flagless name than a dropped value. A true data normalisation pass over stored transactions remains a separate, larger option.

### Decided for the NEXT phase — the month dimension resolves to a range

Agreed as the next thing after 7b, and the plumbing question raised during this session has a settled answer. Writing it down now so it is a **constraint in the prompt** rather than something discovered mid-implementation:

> **A month is a display dimension that resolves to a date RANGE on drill-down.** It is not a `filterDimensions()` entry and it introduces no synthetic filter value.

Tapping `March × Food` becomes:

```
range = [1 Mar, 31 Mar] ∩ globalRange   +   category = Food
```

Why this is the right shape:

- The Transactions tab **already** filters on ranges, so nothing new has to be learnt by the filter model — no synthetic month value, no new filter concept, no reconciliation rule for a dimension whose options are unbounded and derived.
- Intersecting with the global range falls out naturally, so the drilled list still sums to the tapped number without a special case.
- It keeps `Transaction.date` (`"DD-MM-YYYY"`, parsed via `parseTxDate` — never compared lexicographically) as the only source of truth.

⚠️ The consequence to carry into the prompt: month is **genuinely a different shape from every other dimension**. Every other dimension produces `FilterSelection` entries; this one produces a `range` override instead. `FilterRequest` already carries both `selections` and `range`, so the payload needs no change — but `computePivot`'s grouping key and the drill-down translation are no longer the same mechanism, and the design has to say so up front.

Once it exists, the bespoke **"Day by day"** card (carry-in 0.3) and its overlap with "Spending over time" can finally fold into ordinary card definitions.

---

## ✨ Working Session 026 — 9 August 2026

**Type**: Feature — Space refactor Phase 8 (import / export). **Completes the refactor.**
**Tools used**: Claude Code (claude-code CLI)

### Context

Final phase. Every other surface already reads `getSpaceConfig()`; the spreadsheet did not. Export hard-coded country and category, emitted every built-in column unconditionally, and knew nothing about custom fields. Seven commits (six planned, plus one for the cached-formula-values fix).

### What shipped

| Commit | Scope |
| --- | --- |
| 1 | Hidden `_globeexpenses` metadata sheet — format version, space identity, full resolved `SpaceConfig` with field + option ids, member list |
| 2 | Config-driven export columns; disabled-fields-holding-data warning |
| 3 | Analysis sheet generated from `config.dashboardCards` |
| 3b | Real computed values cached in every formula cell; truncation disclosure |
| 4 | Lossless import path via the metadata sheet |
| 5 | Foreign-spreadsheet import: column mapping, per-column select decisions |
| 6 | New custom fields from unmatched columns; completeness sweep; doc corrections |

Tests: **387 → 613**.

### Four pre-existing bugs, all silent

None threw. Each produced a plausible-looking wrong file, which is why they survived this long.

**1. Country totals were always zero.** `buildAnalysisSheet` built its SUMPRODUCT filter as `emoji + ' ' + label` for *both* blocks. `Transaction.category` genuinely is stored emoji-prefixed (`effectiveCategories` maps to the concatenation and the select's value *is* that string), so category worked. `Transaction.country` is stored **bare** — `SmartCountrySelect` calls `onChange(name)` and the flag goes to `Space.countries[].emoji`. So country compared `"🇯🇵 Japan"` against `"Japan"` and matched nothing. Confirms audit finding **F7**; the architecture doc's claim of a flag prefix was wrong and is now corrected.

The fix is structural, not a patched string: `dimensionCellText()` is the single function producing both the exported cell and the formula's filter value, so they cannot drift again.

**2. No exported file contained any formulas.** `fml()` omitted the cached `v`, with a comment explaining it was to avoid caching a stale value. But SheetJS 0.18.5 skips any cell whose `v` is `undefined` — formula included. Isolated:

```
{ t:'n', f:'SUM(B1:B2)' }        → cell absent from the file
{ t:'n', v:0, f:'SUM(B1:B2)' }   → written
```

This affected Balance, Balance Summary, the ✔/✅ check columns and Analysis — everything, not just the sheet being rewritten.

**3. The first fix would have shown a grid of zeros.** A `v: 0` placeholder plus `fullCalcOnLoad` works in Excel and LibreOffice, but Google Sheets is a plausible destination and may render the cached value as-is. Rather than ship on an assumption I could not test from here, every formula now carries its **correct** computed result; `fullCalcOnLoad` became belt, not braces.

**4. Every re-imported file shifted every date back one day.** The Excel epoch (1899-12-30) predates standardised time zones — Europe/Paris was on LMT, `+00:09:21` — so the gap between it and a modern *local* midnight is not a whole number of days. Export survived via `Math.round`; import did not, and SheetJS returned `10-06-2026` as `09-06-2026 23:59:39`.

⚠️ The first fix here was also wrong, and only cross-timezone testing caught it: rounding to the nearest local midnight handles Paris but not `Pacific/Kiritimati`, which was **−10:40** in 1899 and is **+14:00** today — over 24 hours of drift, which no ±12h rounding absorbs. Both directions now convert **entirely in UTC**, and `parseSheetFile` reads raw serials with `cellDates: false` rather than letting SheetJS construct Dates. Verified green under UTC, New_York, Kolkata, Chatham, Kiritimati and Apia.

**Data consequence**: transactions from files imported before this fix have dates one day early in Firestore. The mechanism is fixed; already-imported rows are not.

### `pnpm tsc --noEmit` was a no-op — in every phase

The root `tsconfig.json` has `"files": []` and only project references, so `--noEmit` type-checks **nothing** and exits 0. It was verification step 1 in all eight phase prompts. Coverage was not actually lost — `pnpm build` runs `tsc -b` and was also run each phase — but the cited command was worthless. `CLAUDE.md` now documents `pnpm tsc -b` as the convention.

### Design decisions

**Analysis is generated from dashboard cards, not a second config surface.** The user already declared which breakdowns matter by building cards. A card whose dimension has no exported column is skipped; no card surviving omits the sheet entirely rather than emitting an empty one.

**Blocks are capped, and say so.** 60 rows for 1D, 25×15 for pivots, ranked by spend. Deliberately *not* the dashboard's top-5/top-8 — that is a small-screen readability affordance, this is a file-size and recalculation-cost limit. Different constraint, different numbers. Each capped block carries a note (`Top 60 of 78 by spend — 18 more not shown`): a spreadsheet implies completeness in a way a phone card does not, and someone reconciling a total would otherwise find an unexplainable gap.

**Optional built-in columns are typed `number | undefined`.** Making absence a type-level fact forced every consumer to handle it, which is how the two unguarded reads in `sheetImport.ts` surfaced. Column widths are now assigned *by column number* rather than pushed in order — pushing meant one disabled built-in shifted every later width by one.

**Import has three paths, chosen by the file.** Lossless (our export, same space — ids match, one confirmation, nothing to ask); foreign space (our export elsewhere — config known, ids not); foreign file (no structure — column mapping). A **partial** member-id match is treated as foreign: importing half the splits by id and silently orphaning the rest is worse than asking.

**The GlobeExpenses layout is still tried first.** Routing every metadata-less file through column mapping was tempting, but pre-Phase-8 exports have no metadata sheet *and* the hidden `txId` column has no header text — auto-matching would ignore it, so re-importing an old export would duplicate every transaction instead of updating in place.

**Select decisions are per column, never per value.** Importing into a near-empty space leaves nearly every value unmatched; that is the main case, not an edge case.

**Rows with no per-member columns** attribute the full amount to the signed-in user's slot. Otherwise a bank or personal-budget export imports with empty splits — visible in the list, invisible in every balance.

### Not done / still open

- **No data-preview step on the foreign path.** The two decision screens already show counts and samples; a third read-only screen felt like friction. Reconsider if imports go wrong in practice.
- **Google Sheets `fullCalcOnLoad` behaviour is still unverified** — worked around rather than confirmed. The cached values make it moot, but the flag's actual support is unknown.
- **Dates already corrupted by bug 4** are not repaired.
- **`space.countries` entries storing `'🌍'`** — unchanged, see the open country-canonicalisation bug from Session 025. Phase 8 made the *export* correct without touching stored data.
