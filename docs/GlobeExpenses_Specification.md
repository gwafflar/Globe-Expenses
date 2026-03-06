**GlobeExpenses**

Formal Product Specification

_Version 0.4 - March 2026_

_Reference document for AI-assisted development sessions. All decisions recorded herein are binding unless explicitly revised._

# 1. Product Vision

GlobeExpenses is a collaborative travel expense tracking application. It enables travelers to record spending during trips, convert amounts to a reference currency, analyze their expenses via a dashboard, and settle debts among travel companions. The application works fully offline and synchronizes automatically when internet connectivity is available.

The product is distributed as a Progressive Web App (PWA), installable directly on Android and iOS devices without going through an app store.

# 2. Decided Technical Stack

| **Concern** | **Decision** | **Rationale** |
| --- | --- | --- |
| App platform | PWA (Progressive Web App) | Single codebase for Android + iOS, no store fees, offline via Service Worker, push notifications supported iOS 16.4+ |
| Frontend language | TypeScript | Type safety, better AI tooling support, fewer runtime errors |
| Frontend framework | React 18 | Widest AI tool ecosystem, strong community, best Cursor support |
| Build tool | Vite + vite-plugin-pwa | Fast DX, first-class PWA and Service Worker support |
| UI library | shadcn/ui + Tailwind CSS | Accessible components, readable generated code, good AI support |
| State management | Zustand | Minimal boilerplate, easy to reason about, TypeScript-friendly |
| Local persistence | Dexie.js (IndexedDB) | Structured offline storage, offline write queue |
| Backend platform | Firebase (BaaS) | No custom server required, handles auth + DB + functions + notifications |
| Database | Cloud Firestore | Real-time sync, native offline persistence, document model fits data |
| Authentication | Firebase Auth | Email/password + Google OAuth. Apple login excluded (not targeting App Store) |
| Server-side logic | Firebase Cloud Functions | Currency computation, bank import agent (v2), notification dispatch (serverless) |
| Push notifications | Firebase Cloud Messaging | Phase 3 feature |
| Hosting | Firebase Hosting | CDN delivery, HTTPS by default |
| Currency rates | Hardcoded table (v1) | Deferred complexity. Rate stored per transaction at creation time regardless of source. |
| AI coding tools | Cursor (primary) + Claude (architecture/review) | Cursor for daily development, Claude for design decisions and code review |

# 3. Functional Requirements

## 3.1 User Account

- A user must register and authenticate before using the app.
- Authentication methods: email/password and Google OAuth (via Firebase Auth).
- Each user has a profile with: display name, email, main currency (ISO 4217 code), a global fallback list of categories, and a global fallback list of payment methods.
- The User document carries a type field fixed to 'human', distinguishing human actors from agent actors in the CreatedByRef union type. Agent actors do not have User documents.
- Global categories and payment methods are available across all travels as a fallback when a travel has no per-travel list defined.

## 3.2 Travel Management

- A user can create multiple travels.
- A travel has: name (required), emoji (optional, for visual identification), description (optional), start date (optional), end date (optional), and a fixed list of members.
- Members are defined at travel creation in v1. Dynamic membership is deferred to v2.
- All members have equal access to read and write transactions within a travel.
- A user can view only travels in which they are a member.
- Each travel carries per-travel editable lists: categories, paymentMethods, countries, cities (all LabeledItem\[\]). These are managed from the Parameters tab of the travel detail view.
- \[v2\] Dynamic member addition with join-date based visibility cutoff for past transactions.

## 3.3 Transaction Management

### 3.3.1 Transaction Fields

| **Field** | **Required** | **Type** | **Description** |
| --- | --- | --- | --- |
| Date | Yes | Date | Date the expense occurred |
| Name / Description | Yes | String | Short label for the expense |
| Total Amount | Yes | Decimal | Amount in the transaction currency |
| Currency | Yes | ISO 4217 | Currency of the transaction |
| Exchange Rate | Auto | Decimal | Rate at time of entry (1 unit = X main currency). Stored permanently. |
| Amount (main currency) | Auto | Decimal | Computed: totalAmount \* exchangeRate. Stored. |
| Category | No | String | From travel's per-travel category list (falls back to user's global list) |
| Payment Method | No | String | From travel's per-travel payment method list (falls back to user's global list) |
| Country | No | String | Country of the expense. Shown only when travel.settings.trackLocation is true. |
| City | No | String | City of the expense. Shown only when travel.settings.trackLocation is true. |
| Paid By (splits) | Yes | Split\[\] | Who paid and how much each. Must sum to total amount. |
| Beneficiaries (splits) | Yes | Split\[\] | Who benefits and how much each. Must sum to total amount. |
| Draft ID | No | String | ID of the originating draft if created via bank import (v2). Enables retrieval of raw bank data on demand. |
| Notes | No | String | Free text additional notes |

### 3.3.2 Transaction Attribution

The createdBy field uses a union type to distinguish between manual user entry and automated agent creation:

- { type: 'user', uid: string } - for manually created transactions
- { type: 'agent', name: string } - for transactions created by the bank import agent (e.g. 'Revolut Agent', 'Deblock Agent')

This enables filtering and auditing by source in the transaction list view.

### 3.3.3 Split Model

A Split is defined as: { uid: string, amount: number }. Both paidBy and beneficiaries are arrays of Splits.

Invariants enforced by the UI:

- sum(paidBy\[\].amount) == totalAmount (validated to 2dp rounding tolerance)
- sum(beneficiaries\[\].amount) == totalAmount (validated to 2dp rounding tolerance)

Split editor behaviour:
- Equal mode: amounts computed to 3dp internally; validity check rounds to 2dp to absorb floating-point drift
- Custom mode: amounts stored and displayed at 2dp; an "absorb" chip redistributes any remainder to a selected member
- Solo travel (1 member): split UI is hidden entirely; paidBy and beneficiaries are set automatically to the single member

Example - Restaurant: Total 75 EUR. Alice paid 50, Bob paid 25 (paidBy). Alice's meal cost 30, Bob's cost 45 (beneficiaries). Net: Alice paid 50, owes 30 → is owed 20. Bob paid 25, owes 45 → owes 20.

### 3.3.4 Transaction Form — Smart Dropdowns

**Currency:**
- Default: last transaction's currency in this travel (falls back to userProfile.mainCurrency for the first transaction)
- Dropdown options listed first: travel.currencies ordered by most recent use
- `+ Add…` option: opens an inline searchable picker; selected currency is permanently added to travel.currencies

**Country:**
- Default: last transaction's country in this travel
- Dropdown options listed first: travel.countries ordered by most recent use, with flag emoji
- `+ Add…` option: opens an inline searchable picker with flag emojis (~110 countries); selected country permanently added to travel.countries

**City:** previously used values from existing transactions, plus `+ Add new…` inline text input.

**Category / Payment Method:** travel's per-travel list shown; falls back to userProfile global list if travel list is empty.

When a transaction is saved with a country or city not yet in the travel's lists, `syncTransactionLocation()` writes them to the travel document via `arrayUnion` (fire-and-forget, offline-safe). The travel detail page updates local state optimistically via an `onLocationAdded` callback so subsequent form opens and the Parameters tab reflect the new value immediately.

### 3.3.5 Transaction Operations

- Create transaction - any travel member can create
- Edit transaction - any travel member can edit (v1: no access control beyond membership)
- Delete transaction - any travel member can delete (v1)
- View transaction list - filterable by date range, category, payment method, currency, member (filter UI is a placeholder in current implementation)

## 3.4 Travel Detail View — Tabs

The travel detail view is organised into three tabs accessible by tapping the tab bar or by horizontal swipe gesture.

### Transactions tab

- Lists all transactions for the travel, ordered by date descending then createdAt descending
- Each transaction card shows: date, category emoji, name, primary payer, amount in transaction currency, amount in main currency, pending sync badge (if applicable)
- Filter button and Display Mode toggle: placeholders, deferred to a future version
- Empty state with CTA to add the first expense
- Floating action button (+) and empty state button both open the transaction creation bottom sheet

### Balance tab

- Placeholder. Will display net balance per member and optimal settlement suggestions (greedy debt-simplification algorithm). To be implemented in a future session.

### Parameters tab

Editable per-travel settings, all changes auto-saved to Firestore on interaction.

- **Travel identity**: name (auto-save on blur) and emoji (auto-save on blur, grapheme-aware — keeps first emoji only)
- **Members**: placeholder (dynamic membership is v2)
- **Currencies**: collapsible searchable checklist of ~42 currencies (code, symbol, name). Selection persisted to travel.currencies.
- **Categories**: inline editable list (LabeledItem\[\]) — add item (emoji + label), rename on tap, delete. Persisted to travel.categories.
- **Payment methods**: same inline editable list pattern. Persisted to travel.paymentMethods.
- **Countries**: collapsible searchable checklist of ~110 countries with flag emojis. Replaces free-text entry. Persisted to travel.countries.
- **Cities**: inline editable list. Auto-seeded on render from existing transactions (cities not already in the list are appended). Persisted to travel.cities.

## 3.5 Draft Transactions (v2)

### 3.5.1 Overview

Draft transactions are pre-filled transaction records created automatically by the bank import agent, pending user review. They are a first-class feature with their own inbox and editing flow.

### 3.5.2 Draft Fields

Drafts carry all core transaction fields pre-filled from the bank data, plus:

- source - the payment method / bank that originated the draft (e.g. 'Revolut', 'Deblock')
- rawData - the original bank payload as received; preserved permanently for audit purposes
- country - country of transaction as reported by the bank
- city - city inferred by the agent from bank data or from past transaction records in the same area
- status - 'pending', 'validated', or 'dismissed' (see lifecycle below)
- linkedTxId - ID of the transaction created upon validation; null until status = 'validated'
- travelId - null until assigned by the user during review
- expiresAt - optional auto-expiry timestamp for unreviewed drafts (duration TBD)

### 3.5.3 Draft Lifecycle (Soft Delete)

Drafts are never hard-deleted. This preserves the audit trail and raw bank data:

- pending → validated: user confirms the draft. A transaction is created, draftId is set on the transaction, linkedTxId is set on the draft. Draft is hidden from the inbox.
- pending → dismissed: user explicitly discards the draft. Draft is hidden from the inbox but retained in Firestore.
- Validated and dismissed drafts remain queryable. When a user edits a transaction that has a draftId, the UI offers an expandable 'View original bank data' panel fetching rawData from the linked draft on demand.

### 3.5.4 Draft Inbox

- A global Drafts inbox surfaces all pending drafts across all travels
- Drafts are filterable by payment method / source bank
- A badge on the Drafts tab shows the count of unreviewed drafts

### 3.5.5 Draft Review Flow

- User opens a draft from the inbox
- Travel selection: a horizontal swipe carousel displays travel cards (name + emoji), extending beyond screen edges to hint at scrollability
- User reviews the pre-filled transaction form - all fields are editable
- Split fields (paidBy and beneficiaries) are collapsed by default and expand on tap
- User confirms - a transaction is created with draftId referencing this draft; draft status moves to 'validated' (soft delete, hidden from inbox, raw data preserved)
- Travel can be changed at any point during review (carousel is accessible from within the form too)

### 3.5.6 Bulk Actions

- User can select multiple drafts from the inbox
- Bulk dismiss: discard all selected drafts (status → 'dismissed'; soft delete, retained in Firestore)
- Bulk travel assignment: assign all selected drafts to the same travel

## 3.6 Activity Feed (v2)

The Activity Feed is a pull-model notification center surfacing collaborative events that affect the current user. It is distinct from the Drafts inbox: drafts are the user's own unconfirmed bank imports; the activity feed is about collaborators' actions.

- An activity event is generated when any travel member creates or edits a transaction that lists the current user as a payer or beneficiary
- The Activity tab shows a chronological feed of these events: new transactions, edits, and settlement changes
- A badge on the Activity tab shows the count of unseen events; a lastSeenAt timestamp on the User document tracks seen state
- Tapping an activity item deep-links to the relevant transaction, pre-opened for review
- From the transaction view, the user can edit the transaction directly if they disagree with the recorded data
- \[v3\] Activity events are also delivered as push notifications via Firebase Cloud Messaging

## 3.7 Dashboard & Statistics

- Total spending per travel, in main currency
- Spending breakdown by category (pie/bar chart)
- Spending over time (line chart)
- Spending breakdown by member
- Balance summary: who owes whom, and how much (optimal settlement suggestions)
- Multi-currency summary with converted totals

## 3.8 Export & Import

- Export: download all transactions for a travel as a .csv file
- Import: upload a .csv file to batch-create transactions in a travel
- CSV format is flat (one row per transaction), versioned, and documented
- Round-trip integrity: an exported file can be re-imported without data loss
- Split data is serialized in a defined format within the CSV (to be specified during implementation)

## 3.9 Offline Behavior

- The app shell loads without network (Service Worker caches assets)
- All previously loaded data is readable offline (Firestore offline persistence)
- Transactions can be created and edited offline
- Offline writes are queued and automatically synchronized when connectivity is restored
- syncTransactionLocation() writes are also queued offline and replayed on reconnect
- Conflict policy v1: last-write-wins
- \[v2\] Conflict detection: if a transaction's lastModifiedAt in Firestore is newer than the version the user loaded, a visual warning is shown on that transaction

## 3.10 Notifications (Phase 3)

- Push notifications via Firebase Cloud Messaging
- Trigger: a transaction is created or edited that lists the user as a payer or beneficiary
- Notification content: transaction name, amount, travel name, actor
- Users can enable/disable notifications per travel

# 4. Non-Functional Requirements

- The app must be installable on Android (Chrome) and iOS (Safari, 16.4+) via 'Add to Home Screen'
- The app must function without network for all core transaction features
- All data must be stored in Firebase - no sensitive data stored only on device
- All Firestore access must be protected by security rules based on travel membership
- The app must be responsive and usable on screens from 375px width (iPhone SE) upward
- Exchange rates are stored at transaction time and never retroactively updated

# 5. UI Design Principles

- Design before building: for complex flows (especially the draft review flow), wireframes should be validated before any backend schema is finalized
- Carousel for travel selection: use a horizontal swipe carousel with large cards showing travel name + emoji, extending beyond the screen edge to hint at more content
- Emoji per travel: travels can have an optional emoji for visual identification; this is a v1 feature, set at travel creation and editable in the Parameters tab
- Progressive disclosure: complex fields (splits, picker lists) are collapsed by default and expanded on demand
- Bulk actions: the draft inbox supports multi-select for batch operations
- Offline-first: every user action must work offline; sync state is surfaced via badges and banners, not blocking modals
- Smart defaults: form fields pre-fill from the most recent transaction where possible (currency, country, city); pickers show recently used items first

# 6. Out of Scope (v1)

- Dynamic travel membership
- Live currency exchange rate API integration
- Bank rate / cash withdrawal rate input
- Conflict resolution UI
- Push notifications (v3)
- Receipt photo attachment
- Multi-language / i18n
- App Store / Play Store distribution
- Settlement recording (marking a debt as paid)
- Bank import agent and draft transaction flow (v2)
- Activity feed for collaborative transaction events (v2)
- Manual fetch-new-transactions trigger (v4)
- Recurring / template transactions (v4)
- Filter and Display Mode in Transactions tab (placeholders exist, implementation deferred)

# 7. Development Approach

- Vibe-coding methodology: Cursor as primary IDE, Claude for architecture decisions and code review
- All sessions should begin by loading this document and the architecture document into context
- Work in small, verifiable increments - each prompt's output must be reviewable in one sitting
- Tests are written alongside code, not after
- A living SPEC.md and ARCHITECTURE.md are maintained in the repository root
- The repository maintains a SESSION_LOG.md summarizing completed work and next steps for AI context loading
- UI design (wireframes) precedes implementation for complex multi-step flows

# 8. Decision Log

| **#** | **Decision** | **Detail** | **Rationale** |
| --- | --- | --- | --- |
| 1 | PWA platform | Single PWA for Android + iOS, no App Store | No publishing fees, one codebase, offline via Service Worker |
| 2 | Firebase backend | Firebase Auth + Firestore + Functions + FCM | No custom server, offline sync built-in, scales with usage |
| 3 | React + TypeScript | React 18, TypeScript, Vite, shadcn/ui | Best AI tooling ecosystem, readable generated code |
| 4 | Hardcoded currency rates (v1) | Rate stored per transaction at creation. No live API yet. | Defers complexity; correct model (store rate at time of purchase) is already in place |
| 5 | Multi-payer splits | Both paidBy and beneficiaries are Split\[\] arrays summing to total | Handles all real-world payment scenarios including partial payments and cash change |
| 6 | Global categories/payment methods | Per-user global fallback, available across all travels | Maximum flexibility; per-travel lists (decision #38) take priority when defined |
| 7 | Fixed membership v1 | Travel members set at creation, cannot be changed in v1 | Simplifies security rules and data model; dynamic joining deferred to v2 |
| 8 | Last-write-wins (v1) | No conflict resolution in v1; conflicts detected and flagged in v2 | Firestore default; acceptable for small travel groups; v2 adds detection |
| 9 | Auth: email + Google | Firebase Auth, no Apple login | Apple login required only for App Store distribution |
| 10 | No custom server | All backend logic in Cloud Functions | Reduces ops burden; appropriate for expected scale |
| 11 | createdBy as union type | { type: 'user', uid } \| { type: 'agent', name } - applies to both transactions and drafts | Enables clear attribution between manual entry and automated agent; backward compatible |
| 12 | User.type fixed to 'human' | Explicit type field on User document; agents never have User documents | Documents the actor model clearly for future reference |
| 13 | Travel emoji (v1) | Optional emoji field on Travel document, displayed in carousel and lists; editable in Parameters tab | Low effort, high personality; supports visual identification of travels |
| 14 | Draft inbox: global + filter by source | All drafts in one inbox, filterable by payment method / source bank | User assigns travel during review; filtering by source useful when multiple bank accounts are connected |
| 15 | Carousel for travel selection in drafts | Horizontal swipe carousel with travel name + emoji cards, extends beyond screen edge | Aesthetic and efficient; avoids dropdown for a visually prominent action |
| 16 | Bank import: Revolut preferred (v2) | Revolut offers native webhook + API. N26/Deblock fiat via GoCardless aggregator. Deblock on-chain via Alchemy/Moralis. | Revolut is the most developer-friendly option; on-chain data is public by design and easier to integrate |
| 17 | UI design before backend for complex flows | Wireframes validated before finalizing data models for draft flow and other complex v2 features | Avoids costly backend rework driven by UI shape requirements |
| 18 | Draft soft delete | Drafts transition to 'validated' or 'dismissed' but are never hard-deleted. Raw bank data preserved permanently. | Audit trail; enables retroactive inspection of original bank payload from a transaction's edit view |
| 19 | Transaction.draftId reference | Lean pointer from transaction to originating draft; raw data fetched on demand, not duplicated | Keeps transaction documents clean; raw data only loaded when explicitly needed |
| 20 | Activity feed (v2, pull model) | Dedicated Activity tab for collaborative events affecting the current user; push upgrade in v3 via FCM | Conceptually separate from drafts inbox; pull model keeps v2 scope manageable |
| 21 | Manual fetch trigger deferred to v4 | Fetch-new-transactions button is v4, not v2 | Low priority given reliable webhooks; reduces v2 scope |
| 22 | Auth spinner pattern | Show spinner while isAuthReady === false to prevent flash-to-login | Clean UX; avoids redirect on page load for authenticated users |
| 23 | Firestore profile creation in auth store | Defensive check in onAuthStateChanged — creates doc if missing, handles Google OAuth automatically | Single place for profile bootstrap; no risk of missing doc on first sign-in |
| 24 | memberUids dual-field pattern | members: MemberRef\[\] for UI, memberUids: string\[\] for security rules | Firestore security rules cannot inspect fields inside array objects; flat UID array required for array-contains queries |
| 25 | createdBy as union type (transactions + drafts) | { type: 'user', uid } \| { type: 'agent', name } — backward compatible | Enables clear attribution; agents never have User documents |
| 26 | Travel emoji (v1, extended) | Optional emoji field; displayed in carousel, lists, and travel detail header | Visual identification; low effort |
| 27 | Draft inbox: global + filter by source | All drafts in one inbox, filterable by payment method / bank source | User assigns travel during review |
| 28 | Carousel for travel selection in drafts | Horizontal swipe carousel, travel name + emoji, extends beyond screen edge | Avoids dropdown for a visually prominent action |
| 29 | Draft soft delete | Drafts never hard-deleted; 'validated' and 'dismissed' hidden from inbox but retained | Audit trail |
| 30 | Transaction.draftId | Lean pointer to originating draft; raw data fetched on demand, not duplicated | Keeps transaction documents clean |
| 31 | rawData on draft is permanent | Original bank payload preserved indefinitely | Audit and retroactive inspection |
| 32 | User.type = 'human' | Explicit field on User document | Documents actor model clearly |
| 33 | Activity feed in v2 (pull) | Separate from Drafts inbox; push upgrade in v3 | Conceptually distinct from draft imports |
| 34 | Manual fetch trigger → v4 | Low priority given reliable webhooks | Reduces v2 scope |
| 35 | Fire-and-forget transaction write | doc() + setDoc() without await; ID returned synchronously | Enables immediate UI feedback and true offline support |
| 36 | isPending flag on transaction | Derived from snapshot.metadata.hasPendingWrites; drives "not synced" badge and save banner | Clear offline/online state feedback to user |
| 37 | includeMetadataChanges on onSnapshot | Required for isPending badge to disappear when server confirms write | Without it, hasPendingWrites flip is not observed |
| 38 | Per-travel LabeledItem lists | categories, paymentMethods, countries, cities stored as LabeledItem\[\] on travel document; fall back to userProfile globals if empty | Maximum per-trip flexibility; emoji personalisation; backward compatible with older travels |
| 39 | LabeledItem type | { id: string, label: string, emoji?: string } with client-generated stable id | Stable id required for Firestore arrayUnion/arrayRemove addressing |
| 40 | CountryPicker backed by static list | ~110 countries with flag emojis in pickerData.ts; replaces free-text entry for countries | Flag emoji is a v1 feature; static list avoids API dependency |
| 41 | Smart currency/country dropdowns in TransactionForm | Travel lists ordered by recent use; `+ Add…` permanently adds to travel | Reduces friction for recurring currencies/countries; keeps list curated per trip |
| 42 | syncTransactionLocation | After transaction save, new country/city written to travel document via arrayUnion (fire-and-forget, offline-safe); parent updates local state optimistically via onLocationAdded | Ensures dropdowns and Parameters tab stay current without manual entry |
| 43 | Shared picker data | src/shared/data/pickerData.ts — single source of truth for currency and country static data | Avoids duplication between ParametersTab and TransactionForm |
| 44 | Three-tab travel detail | Transactions / Balance / Parameters tabs with swipe gesture | Separates concerns cleanly; Parameters replaces a separate settings screen |
| 45 | SplitEditor mode as controlled prop | mode (equal/custom) lifted to TransactionForm; persists across drawer open/close | Prevents accidental mode reset when user re-opens the form |
| 46 | Decimal precision rule | UI always displays amounts at 2dp (toFixed(2)). Internal calculations (equal split distribution, balance computation, statistics) use 3dp to avoid floating-point drift. Validity checks round to 2dp. This applies globally across the app — not just in the split editor. | 3dp internally prevents false "invalid" states (e.g. 100/3 = 33.333 × 3 = 99.999, rounds to 100 at 2dp ✓). Users never see sub-cent values. |