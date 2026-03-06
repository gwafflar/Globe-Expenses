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

**Friends & invite system (carried over from Session 005.2 tail):**
- `ProfilePage.tsx`: full profile management (identity, security, preferences, friends, contact dev, sign out)
  - `@nametag` claim flow: availability pre-check → atomic sentinel batch write → Zustand cache update
  - Friends: nametag search (debounced 300ms), send request, accept/decline incoming requests, share invite link
- `src/friends/services/friendService.ts`: `createShareableInvite`, `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `sendTravelInvite`, `acceptTravelInvite`, `subscribeToIncomingRequests`, `fetchFriends`, `searchByNametag`
- `src/friends/hooks/usePendingInvites.ts`: real-time snapshot for incoming invites, exposes `{ invites, count }`
- `src/friends/types.ts`: `Invite`, `Friend`, `SearchUser` interfaces
- `src/friends/pages/InvitePage.tsx`: invite acceptance page for `/invite/:inviteId` links
- `ParametersTab.tsx` — `MembersSection`: current members list, invite friend picker (lazy), share travel invite link
- `TravelDetailPage` header: profile avatar button with pending-invites badge (red dot)
- `TravelsPage` header: profile avatar button with pending-invites badge

**Transaction editing:**
- `transactionService.ts`: added `updateTransaction(travelId, txId, data)` — fire-and-forget `updateDoc`, deletes optional fields via `deleteField()` when cleared (prevents stale category/city/notes after edits)
- `TransactionForm.tsx`: dual-mode form — `initialValues?: TransactionWithStatus` prop; pre-fills all fields in edit mode; `detectSplitMode()` helper restores equal/custom mode from saved splits; `handleSave` branches to `updateTransaction` vs `createTransaction`
- `TransactionsTab.tsx`: transaction rows are now tappable (`cursor-pointer`, hover/active states), `onEditTransaction` callback
- `TravelTabs.tsx`: threads `onEditTransaction` from `TravelDetailPage` → `TransactionsTab`
- `TravelDetailPage.tsx`: `editingTx` state; `handleEditTransaction()` opens edit drawer; unified drawer with dynamic "New expense"/"Edit expense" title; `handleTransactionSaved` skips save banner for edits

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
- [ ] Or: delete transaction feature