**GlobeExpenses**

Formal Product Specification

_Version 0.6 - November 2026_

_Reference document for AI-assisted development sessions. All decisions recorded herein are binding unless explicitly revised._

# 1. Product Vision

GlobeExpenses is a collaborative space expense tracking application. It enables travelers to record spending during trips, convert amounts to a reference currency, analyze their expenses via a dashboard, and settle debts among space companions. The application works fully offline and synchronizes automatically when internet connectivity is available.

The product is distributed as a Progressive Web App (PWA), installable directly on Android and iOS devices without going through an app store.

# 2. Decided Technical Stack

| **Concern** | **Decision** | **Rationale** |
| --- | --- | --- |
| App platform | PWA (Progressive Web App) | Single codebase for Android + iOS, no store fees, offline via Service Worker, push notifications supported iOS 16.4+ |
| Frontend language | TypeScript | Type safety, better AI tooling support, fewer runtime errors |
| Frontend framework | React 18 | Widest AI tool ecosystem, strong community, best Cursor support |
| Build tool | Vite + vite-plugin-pwa | Fast DX, first-class PWA and Service Worker support |
| UI library | shadcn/ui + Tailwind CSS v4 | Accessible components, readable generated code, good AI support |
| State management | Zustand | Minimal boilerplate, easy to reason about, TypeScript-friendly |
| Local persistence | Dexie.js (IndexedDB) | Structured offline storage, offline write queue |
| Backend platform | Firebase (BaaS) | No custom server required, handles auth + DB + functions + notifications |
| Database | Cloud Firestore | Real-time sync, native offline persistence, document model fits data |
| Authentication | Firebase Auth | Email/password + Google OAuth. Apple login excluded (not targeting App Store) |
| Server-side logic | Firebase Cloud Functions | Currency computation, bank import agent (v2), notification dispatch (serverless) |
| Push notifications | Firebase Cloud Messaging | Live since Nov 2026, see §3.11 |
| Hosting | Firebase Hosting | CDN delivery, HTTPS by default |
| Currency rates | Hardcoded table (v1) | Deferred complexity. Rate stored per transaction at creation time regardless of source. |
| AI coding tools | Cursor (primary) + Claude (architecture/review) | Cursor for daily development, Claude for design decisions and code review |

# 3. Functional Requirements

## 3.1 User Account

- A user must register and authenticate before using the app.
- Authentication methods: email/password and Google OAuth (via Firebase Auth).
- Each user has a profile with: display name, email, main currency (ISO 4217 code), a global fallback list of categories, and a global fallback list of payment methods.
- A user may optionally claim a **nametag** — a unique lowercase handle (3–20 alphanumeric + underscore characters, e.g. `alice`). The nametag is used for friend search and displayed in invites. Claiming a nametag is atomic: a sentinel document in `nametags/{tag}` is written in a batch alongside the user profile update; the batch fails if the tag is already taken.
- The User document carries a `type` field fixed to `'human'`, distinguishing human actors from agent actors in the CreatedByRef union type. Agent actors do not have User documents.
- Global categories and payment methods are available across all spaces as a fallback when a space has no per-space list defined.

## 3.2 Space Management

- A user can create multiple spaces.
- A space has: name (required), emoji (optional, for visual identification), description (optional), and a list of members.
- Space members can invite others to join via a shareable invite link (see section 3.5). The invited user joins the space by accepting the link — all existing transactions are visible to them from the moment of joining (no join-date visibility cutoff in v1).
- All members have equal access to read and write transactions within a space.
- A user can view only spaces in which they are a member.
- Each space carries per-space editable lists: categories, paymentMethods, countries, cities (all `LabeledItem[]`). Managed from the Parameters tab of the space detail view.
- Each space has a **main currency** (`mainCurrency`: ISO 4217) set at creation (defaults to user's `mainCurrency`). All transactions in the space compute `exchangeRate` and `totalAmountMain` relative to this currency. Locked after creation in v1 (editable + batch recompute is v2). Canonical reader: `getSpaceMainCurrency(space)` with fallback chain `mainCurrency → currencies[0] → 'EUR'`.
- Each space has **default exchange rates** (`defaultRates: Record<string, number>`) seeded from the hardcoded table at creation. User-editable in the Parameters tab (both directions). Per-transaction override is available in the form. `getExchangeRate(from, to, spaceRates?)` checks space rates first.
- A member can **leave** a multi-user space (removed from `memberUids`, slot unclaimed but preserved for split integrity). If the leaving member was the creator, `createdBy` is reassigned to a random remaining member from `memberUids`.
- A member can **delete** a solo space (or a space where they are the last user in `memberUids`). The client deletes the space document only; the `onTravelDeleted` Cloud Function then deletes all its transactions server-side.
- A member can **archive** a space for themselves only (per-user `archivedByUids` array). Archived spaces appear in a separate collapsible section on the spaces list and show an unarchive banner when opened.
- After creating a new space, the user is navigated directly to the space detail page.
- [v2] Dynamic member removal and join-date based visibility cutoff for past transactions.

## 3.3 Transaction Management

### 3.3.1 Transaction Fields

| **Field** | **Required** | **Type** | **Description** |
| --- | --- | --- | --- |
| Date | Yes | Date | Date the expense occurred |
| Name / Description | Yes | String | Short label for the expense |
| Total Amount | Yes | Decimal | Amount in the transaction currency |
| Currency | Yes | ISO 4217 | Currency of the transaction |
| Exchange Rate | Auto | Decimal | Rate at time of entry (1 unit = X main currency). Stored permanently. |
| Amount (main currency) | Auto | Decimal | Computed: totalAmount * exchangeRate. Stored. |
| Category | No | String | From space's per-space category list (falls back to user's global list) |
| Payment Method | No | String | From space's per-space payment method list (falls back to user's global list) |
| Country | No | String | Country of the expense. |
| City | No | String | City of the expense. |
| Paid By (splits) | Yes | Split[] | Who paid and how much each. Must sum to total amount. |
| Beneficiaries (splits) | Yes | Split[] | Who benefits and how much each. Must sum to total amount. |
| Draft ID | No | String | ID of the originating draft if created via bank import (v2). Enables retrieval of raw bank data on demand. |
| Notes | No | String | Free text additional notes |
| Type | No | `'expense' \| 'withdrawal' \| 'adjustment' \| 'transfer'` | Transaction purpose. Absent on legacy documents → treated as `'expense'`. Withdrawal = wallet top-up; Adjustment = reconciliation entry; Transfer = person-to-person money movement (settlement, loan). |
| Fees | No | Decimal | Withdrawal fees in transaction currency. User received `totalAmount - fees`. Only set when `type === 'withdrawal'`. |
| Adjustment Mode | No | `'expense' \| 'balance_only'` | For adjustment transactions: whether the amount counts in spending analytics. Only set when `type === 'adjustment'`. |
| Amount Formula | No | String | Raw formula entered by user (e.g. `"2*2.5 + 1.5"`). `totalAmount` is always the evaluated result. Display-only. |

### 3.3.2 Transaction Attribution

The `createdBy` field uses a union type to distinguish between manual user entry and automated agent creation:

- `{ type: 'user', uid: string }` — for manually created transactions
- `{ type: 'agent', name: string }` — for transactions created by the bank import agent (e.g. 'Revolut Agent')

### 3.3.3 Split Model

A Split is defined as: `{ travelMemberId: string, amount: number }`. `travelMemberId` is the stable nanoid from `SpaceMember` — never a Firebase Auth UID. Both `paidBy` and `beneficiaries` are arrays of Splits.

Invariants enforced by the UI:
- `sum(paidBy[].amount) == totalAmount` (validated to 2dp rounding tolerance)
- `sum(beneficiaries[].amount) == totalAmount` (validated to 2dp rounding tolerance)

Split editor behaviour:
- Equal mode: amounts computed to 3dp internally; validity check rounds to 2dp to absorb floating-point drift
- Custom mode: amounts stored and displayed at 2dp; an "absorb" chip redistributes any remainder to a selected member
- Solo space (1 member): split UI is hidden entirely; paidBy and beneficiaries are set automatically to the single member

Example — Restaurant: Total 75 EUR. Alice paid 50, Bob paid 25 (paidBy). Alice's meal cost 30, Bob's cost 45 (beneficiaries). Net: Alice paid 50, owes 30 → is owed 20. Bob paid 25, owes 45 → owes 20.

### 3.3.4 Transaction Form — Smart Dropdowns

**Currency:**
- Default: last transaction's currency in this space (falls back to userProfile.mainCurrency for the first transaction)
- Dropdown options: space.currencies ordered by most recent use
- `+ Add…` option: opens an inline searchable picker; selected currency is permanently added to space.currencies

**Country:**
- Default: last transaction's country in this space
- Dropdown options: space.countries ordered by most recent use, with flag emoji
- `+ Add…` option: opens an inline searchable picker with flag emojis (~110 countries); selected country permanently added to space.countries

**City:** previously used values from existing transactions, plus `+ Add new…` inline text input.

**Category / Payment Method:** space's per-space list shown; falls back to userProfile global list if space list is empty. Both support `+ Add new…` which adds the item to the space's list.

When a transaction is saved with a country or city not yet in the space's lists, `syncTransactionLocation()` writes them to the space document via `arrayUnion` (fire-and-forget, offline-safe). The space detail page updates local state optimistically via an `onLocationAdded` callback so subsequent form opens and the Parameters tab reflect the new value immediately.

### 3.3.5 Transaction Operations

- **Create**: any space member can create. Fire-and-forget write.
- **Edit**: tap any transaction row to open the form pre-filled with existing values. On save, `updateTransaction()` uses `deleteField()` for any cleared optional fields (category, paymentMethod, country, city, notes) to actually remove the Firestore field.
- **Delete**: any space member can delete (v1, no access control beyond membership)
- **View list**: client-side filter & search — 8 dimensions (type, category, currency, country, city, paymentMethod, paidBy, beneficiaries) + text search on name/amount. OR within dimension, AND across dimensions. Cross-filtering greys out values with no remaining matches. "Undefined" sentinel for optional fields. Filter state managed by `useTransactionFilters` hook. Display Mode is still deferred.

### 3.3.6 Wallet Tracker (Cash Simulator)

Per-space tracking of remaining balances for any payment method (typically cash wallets). Uses the existing transaction subcollection — no new Firestore collections.

**Withdrawal** (`type: 'withdrawal'`): money deposited into a payment method (ATM withdrawal, top-up). `paidBy` = owner, `beneficiaries` = owner, `fees` = optional bank/ATM fee deducted from the deposited amount. Does not count as spending.

**Adjustment** (`type: 'adjustment'`): reconciliation entry to correct a wallet balance. `adjustmentMode` controls whether it counts in spending analytics (`'expense'`) or is invisible to analytics (`'balance_only'`).

**Transfer** (`type: 'transfer'`): person-to-person money movement (settlement, loan, reimbursement). `paidBy` = sender, `beneficiaries` = receiver(s). Does not count as spending, but shifts inter-member balance. No wallet impact.

**Wallet balance computation**: `computeWalletBalances()` in `walletHelpers.ts` — pure function, takes full tx list + travelMemberId + pmLabelMap → `WalletBalance[]` per (paymentMethod, currency) pair. Only PM/currency pairs with at least one withdrawal become wallets.

**Privacy note (v1)**: wallet events are stored in the shared transactions subcollection — all space members can technically read each other's wallet data. The UI only renders each user's own wallet balances. Per-member structural privacy is a v2 feature.

**UI**: Wallet card in Dashboard tab — scrollable carousel of wallet sub-cards, drill-down detail with deposited/spent/adjustments summary, top-up list, "Reconcile" button → `ReconciliationDialog`.

## 3.4 Space Detail View — Tabs

The space detail view is organised into four tabs accessible by tapping the tab bar or by horizontal swipe gesture (50px threshold).

### Transactions tab

- Lists all transactions for the space, ordered by date descending then createdAt descending
- Each transaction card shows: date, category emoji, name, primary payer, location, amount in transaction currency, "for you" amount in main currency, pending sync badge
- Tapping a row opens the transaction in edit mode (pre-filled form)
- Filter button and Display Mode toggle: placeholders, deferred to a future version
- Empty state with CTA to add the first expense
- Floating action button (+) opens the transaction creation bottom sheet

### Balance tab

Displays net balance per member and optimal settlement suggestions.

- **Net balances**: per-member row with coloured avatar, name, "paid X · share Y" subtitle, net amount (green = owed, orange = owes), proportional bar
- **Settlements**: greedy debt-simplification algorithm (sort creditors desc / debtors asc, match largest pairs, 0.01 tolerance). One card per settlement with from/to avatars, names, arrow, amount.
- **"Mark as paid"** button: opens `TransactionForm` in transfer mode, pre-filled with amount, currency, sender, and receiver — creates a transfer transaction that shifts the balance.
- **Settlement currency selector**: user can pick any currency + exchange rate to display settlements in. Conversion is display-only; core computation always in mainCurrency. Same-currency optimization: when all balance-affecting transactions share one currency and it matches the settlement currency, raw amounts are used (no lossy round-trip conversion).
- **Copy button**: plain-text settlement summary to clipboard.
- **Solo view**: upsell card when `isSolo`.
- Implementation: `computeBalances()` / `computeBalancesRaw()` / `computeSettlements()` in `src/spaces/utils/balanceUtils.ts`.

### Dashboard tab

Read-only analytics tab. All computations are client-side (no additional Firestore queries — reuses the transaction snapshot already loaded). See section 3.8 for full spec.

### Parameters tab

Editable per-space settings. All changes auto-saved to Firestore on interaction.

- **Space identity**: name (auto-save on blur) and emoji (auto-save on blur, grapheme-aware — keeps first emoji only)
- **Members**: list of current members with avatars. "Invite to space" button generates a shareable travel_member invite link. Sharing a second time reuses or regenerates the link.
- **Currencies**: collapsible searchable checklist of ~42 currencies (code, symbol, name). Selection persisted to space.currencies.
- **Categories**: inline editable list (LabeledItem[]) — add item (emoji + label), rename on tap, delete. Persisted to space.categories.
- **Payment methods**: same inline editable list pattern. Persisted to space.paymentMethods.
- **Countries**: collapsible searchable checklist of ~110 countries with flag emojis. Persisted to space.countries.
- **Cities**: inline editable list. Auto-seeded on render from existing transactions (cities not already in the list are appended). Persisted to space.cities.

## 3.5 Friends & Invite System

### 3.5.1 Overview

The friends system enables users to discover each other by nametag, send friend requests, and invite friends to join shared spaces. Invites use capability-based security: the invite link contains an opaque random token that is itself the proof of authorization — no separate access control check is needed.

### 3.5.2 Nametag

- Optional, unique, immutable once claimed (change = release old + claim new)
- Format: lowercase, alphanumeric + underscore, 3–20 characters
- Claimed via atomic batch write: sentinel document `nametags/{tag} = { uid }` + user profile update. Batch fails if the tag is already taken (atomic uniqueness guarantee without a Cloud Function).
- Used as the primary search key for friend discovery
- Displayed in invite pages and friend lists

### 3.5.3 Friend Requests

- **Search**: user types a nametag prefix (minimum 1 character); debounced Firestore range query returns up to 10 matches
- **Send**: creates an `invites/{id}` document with type='friend', multiUse=false, toUid set. The recipient sees an incremented badge on their profile avatar button.
- **Accept**: atomic batch — invite status→'accepted', usedBy updated, bidirectional `users/{uid}/friends/{friendUid}` entries written
- **Decline**: invite status→'declined'. Fire-and-forget.
- Incoming requests visible in Profile page under the Friends section

### 3.5.4 Shareable Invite Links

Any invite (friend or travel_member) can be shared as a link:
- `createShareableInvite()` creates an invite with `multiUse=true`, returns the inviteId
- Share URL: `/invite/:inviteId`
- Multi-use links keep `status='active'` after each acceptance (the link keeps working)
- Single-use targeted invites (toUid set) transition to `status='accepted'` after first use

### 3.5.5 Space Member Invite

- From the Parameters tab, any space member can generate a travel_member invite link
- Recipient opens the link → `InvitePage` validates and displays space + sender info
- Accept → `acceptSpaceInvite()`:
  - Atomic batch: invite update + space update (members + memberUids via arrayUnion, pendingInviteId set)
  - Firestore security rule validates the invite token via `get()` before allowing the non-member write
  - Friendship writes happen fire-and-forget after the batch, so they cannot abort the space join
- The `pendingInviteId` field on the space document is a transient authorization carrier — only written to satisfy the security rule; has no semantic meaning after the write

### 3.5.6 Invite Lifecycle

| **State** | **Meaning** |
| --- | --- |
| active | Invite is valid and can be accepted |
| accepted | Single-use invite has been accepted (multi-use stays 'active') |
| declined | Recipient explicitly declined a targeted invite |
| revoked | Sender deleted the invite |

Expiry: invites expire 30 days after creation (enforced client-side in InvitePage; server-side enforcement via Cloud Function is a v2 improvement).

## 3.6 Draft Transactions (v2)

### 3.6.1 Overview

Draft transactions are pre-filled transaction records created automatically by the bank import agent, pending user review. They are a first-class feature with their own inbox and editing flow.

### 3.6.2 Draft Fields

Drafts carry all core transaction fields pre-filled from the bank data, plus:

- `source` — the payment method / bank that originated the draft
- `rawData` — the original bank payload as received; preserved permanently for audit purposes
- `status` — 'pending', 'validated', or 'dismissed' (see lifecycle below)
- `linkedTxId` — ID of the transaction created upon validation; null until validated
- `travelId` — null until assigned by the user during review
- `expiresAt` — optional auto-expiry timestamp for unreviewed drafts (duration TBD)

### 3.6.3 Draft Lifecycle (Soft Delete)

Drafts are never hard-deleted:
- pending → validated: user confirms. A transaction is created with draftId set, linkedTxId set on draft. Hidden from inbox.
- pending → dismissed: user discards. Hidden from inbox but retained in Firestore.
- Validated and dismissed drafts remain queryable. When editing a transaction with a draftId, the UI offers an expandable 'View original bank data' panel.

### 3.6.4 Draft Inbox

- Global across all spaces, filterable by payment method / source bank
- Badge on Drafts tab shows count of unreviewed drafts

### 3.6.5 Draft Review Flow

1. User opens a draft from the inbox
2. Space selection: horizontal swipe carousel with space cards (name + emoji), extending beyond screen edges
3. User reviews all pre-filled fields — all editable; splits expandable
4. User confirms → transaction created, draft soft-deleted (status='validated')

### 3.6.6 Bulk Actions

- Multi-select for batch dismiss (status→'dismissed') or space assignment

## 3.7 Activity Feed (v2)

The Activity Feed is a pull-model notification center surfacing collaborative events that affect the current user. Distinct from the Drafts inbox.

- An activity event is generated when any space member creates or edits a transaction listing the current user as a payer or beneficiary
- Shows a chronological feed: new transactions, edits, settlement changes
- Badge shows count of unseen events; `lastSeenAt` on the User document tracks seen state
- Tapping an item deep-links to the relevant transaction for review/edit
- [v3] Activity events also delivered as push notifications via FCM

## 3.8 Dashboard & Statistics

- Total spending per space, in main currency
- Spending breakdown by category (pie/bar chart)
- Spending over time (line chart)
- Spending breakdown by member
- Balance summary: who owes whom (optimal settlement suggestions)
- Multi-currency summary with converted totals

## 3.9 Export & Import

- Export: download all transactions for a space as a .csv file
- Import: upload a .csv file to batch-create transactions in a space
- CSV format is flat (one row per transaction), versioned, and documented
- Round-trip integrity: an exported file can be re-imported without data loss
- Split data is serialized in a defined format within the CSV (to be specified during implementation)

## 3.10 Offline Behavior

- The app shell loads without network (Service Worker caches assets)
- All previously loaded data is readable offline (Firestore offline persistence)
- Transactions can be created and edited offline
- Offline writes are queued and automatically synchronized when connectivity is restored
- `syncTransactionLocation()` writes are also queued offline and replayed on reconnect
- Conflict policy v1: last-write-wins
- [v2] Conflict detection: if a transaction's lastModifiedAt in Firestore is newer than the version the user loaded, a visual warning is shown

## 3.11 Notifications (Phase 3) — ✅ live since 14 Nov 2026

> Detailed design: see `docs/NOTIFICATIONS_SPEC.md`, which takes precedence where it differs.

- Push notifications via Firebase Cloud Messaging, on Android (Chrome) and iOS 16.4+ (Home Screen install only)
- Triggers: a transaction involving the user is created, materially edited or deleted; a space invite, friend request or accepted invite; a space deleted; an import finished. The actor is never notified
- Notification content: space, actor, transaction name, amount and the recipient's own share
- Per-device master switch (Profile) and per-space mute (Parameters); the OS prompt only opens from a tap
- At most 2 pushes per (recipient, space), then one "more changes" push, then silence until 60 s of quiet
- Every event is also written to the user's activity feed (`users/{uid}/activity`), whose UI is not built yet
- **An XLSX import must produce at most one push notification per recipient**, never one per imported row. Every imported row still gets its own Activity Feed entry; only the push is collapsed. This must be in place before the import feature (currently gated off by `SHEETS_FEATURE_ENABLED` in `TransactionsTab.tsx`) and push notifications are both live.

# 4. Non-Functional Requirements

- The app must be installable on Android (Chrome) and iOS (Safari, 16.4+) via 'Add to Home Screen'
- The app must function without network for all core transaction features
- All data must be stored in Firebase — no sensitive data stored only on device
- All Firestore access must be protected by security rules based on space membership or invite token
- The app must be responsive and usable on screens from 375px width (iPhone SE) upward
- Exchange rates are stored at transaction time and never retroactively updated

# 5. UI Design Principles

- Design before building: for complex flows (especially the draft review flow), wireframes should be validated before any backend schema is finalized
- Carousel for space selection: horizontal swipe carousel with large cards showing space name + emoji, extending beyond screen edge to hint at more content
- Emoji per space: spaces have an optional emoji for visual identification; set at space creation and editable in Parameters tab
- Progressive disclosure: complex fields (splits, picker lists) are collapsed by default and expanded on demand
- Bulk actions: the draft inbox supports multi-select for batch operations
- Offline-first: every user action must work offline; sync state is surfaced via badges and banners, not blocking modals
- Smart defaults: form fields pre-fill from the most recent transaction where possible (currency, country, city); pickers show recently used items first
- Capability-based invite links: the invite URL itself is the authorization — no login-gated invite page; just validate the token and show the invite

# 6. Out of Scope (v1)

- Dynamic member removal and join-date visibility cutoff (v2; invite-based joining without cutoff is v1)
- Live currency exchange rate API integration
- Bank rate / cash withdrawal rate input
- Conflict resolution UI
- Receipt photo attachment
- Multi-language / i18n
- App Store / Play Store distribution
- Settlement recording (marking a debt as paid)
- Bank import agent and draft transaction flow (v2)
- Activity feed for collaborative transaction events (v2)
- Manual fetch-new-transactions trigger (v4)
- Recurring / template transactions (v4)
- Display Mode in Transactions tab (placeholder exists, implementation deferred)

# 7. Development Approach

- Vibe-coding methodology: Cursor as primary IDE, Claude for architecture decisions and code review
- All sessions should begin by loading this document and the architecture document into context
- Work in small, verifiable increments — each prompt's output must be reviewable in one sitting
- Tests are written alongside code, not after
- Living SPEC.md and ARCHITECTURE.md maintained in the repository
- SESSION_LOG.md summarizes completed work and next steps for AI context loading
- UI design (wireframes) precedes implementation for complex multi-step flows

# 8. Decision Log

| **#** | **Decision** | **Detail** | **Rationale** |
| --- | --- | --- | --- |
| 1 | PWA platform | Single PWA for Android + iOS, no App Store | No publishing fees, one codebase, offline via Service Worker |
| 2 | Firebase backend | Firebase Auth + Firestore + Functions + FCM | No custom server, offline sync built-in, scales with usage |
| 3 | React + TypeScript | React 18, TypeScript, Vite, shadcn/ui | Best AI tooling ecosystem, readable generated code |
| 4 | Hardcoded currency rates (v1) | Rate stored per transaction at creation. No live API yet. | Defers complexity; correct model (store rate at time of purchase) is already in place |
| 5 | Multi-payer splits | Both paidBy and beneficiaries are Split[] arrays summing to total | Handles all real-world payment scenarios including partial payments and cash change |
| 6 | Global categories/payment methods | Per-user global fallback, available across all spaces | Maximum flexibility; per-space lists (decision #38) take priority when defined |
| 7 | Invite-based space joining (v1) | Non-members can join via invite link. No join-date visibility cutoff. Dynamic membership with cutoff is v2. | Functional collaborative use case without complex cutoff logic |
| 8 | Last-write-wins (v1) | No conflict resolution in v1; conflicts detected and flagged in v2 | Firestore default; acceptable for small space groups |
| 9 | Auth: email + Google | Firebase Auth, no Apple login | Apple login required only for App Store distribution |
| 10 | No custom server | All backend logic in Cloud Functions | Reduces ops burden; appropriate for expected scale |
| 11 | createdBy as union type | `{ type: 'user', uid }` \| `{ type: 'agent', name }` — applies to both transactions and drafts | Enables clear attribution between manual entry and automated agent; backward compatible |
| 12 | User.type fixed to 'human' | Explicit type field on User document; agents never have User documents | Documents the actor model clearly |
| 13 | Space emoji (v1) | Optional emoji field on Space document, displayed in lists and detail header; editable in Parameters tab | Low effort, high personality; supports visual identification |
| 14 | Draft inbox: global + filter by source | All drafts in one inbox, filterable by payment method / source bank | User assigns space during review; filtering by source useful when multiple accounts connected |
| 15 | Carousel for space selection in drafts | Horizontal swipe carousel with space name + emoji cards, extends beyond screen edge | Aesthetic and efficient; avoids dropdown for a visually prominent action |
| 16 | Bank import: Revolut preferred (v2) | Revolut: native webhook + API. N26/Deblock fiat: GoCardless aggregator. Deblock on-chain: Alchemy/Moralis. | Revolut is most developer-friendly; on-chain data is public by design |
| 17 | UI design before backend for complex flows | Wireframes validated before finalizing data models for draft flow and other complex v2 features | Avoids costly backend rework |
| 18 | Draft soft delete | Drafts transition to 'validated' or 'dismissed' but are never hard-deleted. Raw bank data preserved permanently. | Audit trail; enables retroactive inspection of original bank payload |
| 19 | Transaction.draftId reference | Lean pointer from transaction to originating draft; raw data fetched on demand, not duplicated | Keeps transaction documents clean |
| 20 | Activity feed (v2, pull model) | Dedicated Activity tab for collaborative events affecting current user; push upgrade in v3 via FCM | Conceptually separate from drafts inbox; pull model keeps v2 scope manageable |
| 21 | Manual fetch trigger deferred to v4 | Fetch-new-transactions button is v4 | Low priority given reliable webhooks |
| 22 | Auth spinner pattern | Show spinner while isAuthReady === false to prevent flash-to-login | Clean UX; avoids redirect on page load for authenticated users |
| 23 | Firestore profile creation in auth store | Defensive check in onAuthStateChanged — creates doc if missing, handles Google OAuth | Single place for profile bootstrap; no risk of missing doc on first sign-in |
| 24 | memberUids dual-field pattern | members: MemberRef[] for UI, memberUids: string[] for security rules | Firestore security rules cannot inspect fields inside array objects; flat UID array required |
| 25 | Fire-and-forget transaction write | doc() + setDoc() without await; ID returned synchronously | Enables immediate UI feedback and true offline support |
| 26 | isPending flag on transaction | Derived from snapshot.metadata.hasPendingWrites; drives "not synced" badge and save banner | Clear offline/online state feedback without polling |
| 27 | includeMetadataChanges on onSnapshot | Required for isPending badge to disappear when server confirms write | Without it, hasPendingWrites flip is not observed |
| 28 | Per-space LabeledItem lists | categories, paymentMethods, countries, cities stored as LabeledItem[] on space document; fall back to userProfile globals if empty | Maximum per-trip flexibility; emoji personalisation; backward compatible |
| 29 | LabeledItem type | `{ id: string, label: string, emoji?: string }` with client-generated stable id | Stable id required for Firestore arrayUnion/arrayRemove addressing |
| 30 | CountryPicker backed by static list | ~110 countries with flag emojis in pickerData.ts; replaces free-text entry for countries | Flag emoji is a v1 feature; static list avoids API dependency |
| 31 | Smart currency/country dropdowns in TransactionForm | Space lists ordered by recent use; `+ Add…` permanently adds to space | Reduces friction for recurring currencies/countries |
| 32 | syncTransactionLocation | After transaction save, new country/city written to space via arrayUnion (fire-and-forget); parent updates local state optimistically via onLocationAdded | Ensures dropdowns and Parameters tab stay current without manual entry |
| 33 | Shared picker data | src/shared/data/pickerData.ts — single source of truth for currency and country static data | Avoids duplication between ParametersTab and TransactionForm |
| 34 | Four-tab space detail | Transactions / Balance / Dashboard / Parameters tabs with swipe gesture | Separates concerns cleanly; Parameters replaces a separate settings screen |
| 35 | SplitEditor mode as controlled prop | mode (equal/custom) lifted to TransactionForm; persists across drawer open/close | Prevents accidental mode reset when user re-opens the form |
| 36 | Decimal precision rule | UI displays amounts at 2dp. Internal calculations use 3dp to avoid floating-point drift. Validity checks round to 2dp. Applies globally. | 3dp internally prevents false "invalid" states (e.g. 100/3 = 33.333 × 3 = 99.999, rounds to 100 at 2dp). Users never see sub-cent values. |
| 37 | Nametag: atomic sentinel batch write | Delete old nametags/{tag} + create new + update user doc — all in one batch. Fails atomically if tag is taken. | Uniqueness guaranteed without a Cloud Function |
| 38 | deleteField() for cleared optional fields | updateTransaction() uses deleteField() for undefined optional fields (category, city, notes, etc.) | Clearing a field in edit mode actually removes it from Firestore — prevents stale data surviving edits |
| 39 | Unified create/edit drawer | Same Drawer + TransactionForm for both create and edit modes, driven by editingTx state and initialValues prop | Avoids duplicating the form component; mode switch is transparent to the form |
| 40 | No save banner for edited transactions | watchedTxId/SaveBanner pattern only triggered for newly created transactions | Transaction already in snapshot; edit updates flow through onSnapshot naturally |
| 41 | Capability-based invite tokens | inviteId is an opaque random Firestore-generated ID. Possessing it is sufficient authorization to view and accept the invite. | No ACL checks needed; unguessable IDs provide equivalent security without server-side validation |
| 42 | Invite acceptance: core batch + separate friendship writes | Batch = invite update + space update (atomic, must succeed together). Friendship writes = fire-and-forget outside batch. | A friendship-related failure (e.g. already friends) must not abort the space join |
| 43 | arrayUnion not reflected in request.resource.data | Firestore FieldValue transforms are evaluated server-side AFTER rules pass. Rules checking request.resource.data.memberUids during an arrayUnion write will see the pre-write value and always fail. | Space join rule uses pendingInviteId + get() capability check instead of checking the mutated array |
| 44 | pendingInviteId: transient authorization carrier | The accepter writes pendingInviteId to the space document solely for the security rule to read via get(). It has no semantic meaning for the UI and is not displayed or used after the write. | Enables non-member write authorization without a Cloud Function intermediate |
| 65 | Leave = unclaim slot, not remove | Member slot kept with `userId: null` on leave; `memberUids` updated via `arrayRemove`. | Preserves `travelMemberId` references in transaction splits |
| 66 | ~~Delete = client-side subcollection cleanup (v1)~~ | Superseded by #96 (Nov 2026). | |
| 67 | Per-user archive via `archivedByUids` | Each member archives independently. No impact on access or membership. Client-side filtering. | Simple, no extra queries; each member manages their own view |
| 68 | "Only user" check uses `memberUids.length` | Not `members.filter(userId !== null).length`. | A user in `memberUids` who hasn't claimed a slot still has access and counts as a real user |
| 69 | Creator reassignment on leave | If leaving user is `createdBy`, reassign to random remaining UID from `memberUids`. | Ensures `createdBy` always points to an active member |
| 70 | Removed `startDate` / `endDate` from Space | No use case in v1. Existing Firestore docs unaffected. | Fields simply ignored on read; no migration needed |
| 71 | `amountFormula` stored on Transaction | Raw formula string (e.g. `"2*2.5 + 1.5"`). `totalAmount` is always the evaluated result. Display-only — never used in any computation. | Enables showing the formula in the transaction detail without complicating the data model |
| 72 | Wallet tracker uses shared transactions subcollection | Withdrawals, adjustments, transfers stored alongside expenses. `type` field discriminates. | No new Firestore collections or security rules needed; wallet balance computed client-side from existing snapshot |
| 73 | Transfer type (`type: 'transfer'`) | Person-to-person money movement. `countsAsSpending: false`, `affectsBalance: true`. No wallet impact. | Needed to record settlements and inter-member transfers without distorting spending analytics |
| 74 | `affectsBalance()` predicate for BalanceTab | Replaces `countsAsSpending()` in settlement computation. Includes transfers + expenses + adjustments. | Transfers must shift balances without appearing in spending totals |
| 75 | mainCurrency is per-space | `Space.mainCurrency` set at creation. Locked in v1. `UserProfile.mainCurrency` retained as default for new spaces. | Ensures consistent exchange rates across all members in a shared space |
| 76 | defaultRates per-space | `Space.defaultRates?: Record<string, number>`. Seeded from hardcoded table. User-editable. Per-transaction override available. | Lets users correct rates to match actual space rates without affecting past transactions |
| 77 | Same-currency balance optimization | `getSingleCurrency()` + `computeBalancesRaw()` — skips exchangeRate multiplication when all txs share one currency. | Eliminates lossy round-trip distortion (e.g. all-MYR trip settling in MYR) |
| 78 | Feedback collection (`/feedback/{id}`) | Written with `await` (not fire-and-forget). `allow create: if true` security rule (anonymous allowed). | Feedback needs success/failure feedback; unauthenticated users should still be able to report issues |
| 79 | Container renamed Travel → Space | Generic across trips, flatshares, personal budgets | See `docs/SPACE_REFACTOR_SPEC.md` |
| 80 | Firestore path `travels/` frozen as legacy | Renaming a collection means copying every document; zero user value | |
| 81 | Firestore field keys frozen, incl. `travelMemberId` | Type properties map 1:1 to stored keys; renaming needs a migration | |
| 82 | Routes migrated to `/spaces/:spaceId` | Temporary redirect from `/travels/:id`; invite links unaffected | |
| 83 | Three field tiers: core / built-in / custom | Built-ins are hard-coded and toggleable; custom fields get generic behaviour only | Phase 2+ |
| 84 | `notes` becomes a toggleable built-in field | | Phase 2+ |
| 85 | Custom field types v1: `select`, `text`, `boolean` | `number`, `date`, `multi-select` deferred — aggregation semantics need design | Phase 2+ |
| 86 | `select` custom fields store the **option id** | Renaming an option updates all transactions for free; diverges from label-based legacy built-ins | Phase 2+ |
| 87 | `SpaceConfig` on the space document, read via `getSpaceConfig()` | Legacy docs resolve to space-mode defaults; no migration | Phase 2+ |
| 88 | Presets are creation-time templates, not runtime discriminators | Avoids combinatorial mode-conditionals | Phase 2+ |
| 89 | `presetOrigin` stored but **display-only** | No behaviour may branch on it | Phase 2+ |
| 90 | Preset re-application in v1 | Overwrites toggles only, never lists or members | Phase 2+ |
| 91 | `multiCurrency` is a sticky auto-upgrading flag | Auto-upgrades on first foreign-currency use, never auto-downgrades | Phase 2+ |
| 92 | Single-currency is a visibility rule, not a data-model change | `exchangeRate = 1` still stored | Phase 2+ |
| 93 | One event model, two channels | Cloud Functions write an activity entry per event and recipient; only a subset is pushed | The feed UI can follow without rework. `NOTIFICATIONS_SPEC.md` |
| 94 | Server-side push limiter, no deferral | 2 pushes, one "more changes", then silence until 60 s of quiet, per (recipient, space) | iOS ignores notification `tag` replacement, so bursts can only be capped server-side |
| 95 | One push per import | `importBatchId` on imported rows, one `importBatches` marker triggers the summary push | An import must never push once per row |
| 96 | Space delete cascade is server-side | Client deletes the space doc; `onTravelDeleted` recursively deletes subcollections | No `tx_deleted` event per row, no 500-write cap, survives a client crash |
| 97 | Second Firestore mapping in `functions/` | `functions/src/mapping.ts`, pinned by tests | Functions cannot import from `src/`; a shared package needs a build step for one small function |
| 98 | Push SW via Workbox `importScripts` | `public/push-sw.js` added to the generated service worker; data-only FCM messages | One service worker on iOS; caching strategy untouched |
